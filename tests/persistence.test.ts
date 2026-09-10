import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import {
  LocalStore,
  ManagedStore,
  mutate,
  type Store,
  type Envelope,
} from "../src/server/store";
import { initialUser, type UserState, type Bank } from "../src/domain/types";
import { bankSchema, prepareRelease } from "../src/domain/content";
import { answer, startAttempt } from "../src/domain/engine";
import sample from "../content/examples/sample-bank.json";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllEnvs();
});
async function backend(kind: string) {
  if (kind === "local") {
    const directory = await mkdtemp(join(tmpdir(), "recall-persistence-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    return {
      store: new LocalStore(directory),
      reopen: () => new LocalStore(directory),
    };
  }
  const db = new PGlite();
  cleanups.push(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.sessions(id uuid, user_id uuid);",
  );
  await db.exec(await readFile("supabase/migrations/001_reviewer.sql", "utf8"));
  await db.exec("set role service_role");
  vi.stubEnv("SUPABASE_URL", "https://project.example.invalid");
  vi.stubEnv("SUPABASE_SECRET_KEY", "placeholder");
  // Exercise the real managed adapter through the migration's SQL functions.
  mocks.createClient.mockReturnValue({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "reviewer_read") {
        const result = await db.query<{ value: Envelope<UserState> | null }>(
          "select public.reviewer_read($1) as value",
          [args.document_key],
        );
        return { data: result.rows[0].value, error: null };
      }
      const result = await db.query<{ value: boolean }>(
        "select public.reviewer_write($1,$2,$3::jsonb) as value",
        [
          args.document_key,
          args.expected_revision,
          JSON.stringify(args.document_value),
        ],
      );
      return { data: result.rows[0].value, error: null };
    },
  });
  return { store: new ManagedStore(), reopen: () => new ManagedStore() };
}
function fixture() {
  const bank: Bank = { activeId: null, releases: [], audit: [] };
  const release = prepareRelease(
    bank,
    bankSchema.parse(sample),
    "replace",
  ).release;
  release.status = "published";
  bank.activeId = release.id;
  bank.releases.push(release);
  const state = initialUser();
  const attempt = startAttempt(bank, state, {
    mode: "mixed",
    category: "",
    count: 3,
    disclosure: "on-demand",
    minutes: 10,
    preferUnseen: false,
    requestId: crypto.randomUUID(),
  });
  answer(state, attempt.id, 0, attempt.items[0].choices[0].id, false);
  state.bookmarks.push("saved-question");
  state.reports.push({
    id: "report",
    questionId: attempt.items[0].question.external_id,
    revision: 1,
    message: "Preserve this issue",
    at: new Date().toISOString(),
  });
  return state;
}
for (const kind of ["local", "managed SQL"])
  describe(`${kind} persistence`, () => {
    it("preserves all study records when preferences change and storage reopens", async () => {
      const { store, reopen } = await backend(kind);
      const original = fixture();
      await store.cas("user:test", 0, original);
      await mutate(
        "user:test",
        initialUser,
        (s) => {
          s.profile.name = "Updated";
          s.profile.dailyTarget = 12;
        },
        store,
      );
      const saved = (await reopen().read<UserState>("user:test"))!.value;
      expect(saved.profile).toMatchObject({ name: "Updated", dailyTarget: 12 });
      const { profile: _, ...records } = saved;
      const { profile: __, ...before } = original;
      expect(records).toEqual(before);
    }, 20000);
    it("retries a conflicting preference/progress write without dropping either update", async () => {
      const { store, reopen } = await backend(kind);
      const original = fixture();
      await store.cas("user:test", 0, original);
      let reads = 0,
        conflicts = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((r) => {
        release = r;
      });
      const racing: Store = {
        read: async <T>(key: string) => {
          const result = await store.read<T>(key);
          reads++;
          if (reads === 2) release();
          if (reads <= 2) await bothRead;
          return result;
        },
        cas: async (key, revision, value) => {
          const ok = await store.cas(key, revision, value);
          if (!ok) conflicts++;
          return ok;
        },
      };
      const choice = original.attempts[0].items[1].choices[0].id;
      await Promise.all([
        mutate(
          "user:test",
          initialUser,
          (s) => {
            s.profile.dailyTarget = 17;
          },
          racing,
        ),
        mutate(
          "user:test",
          initialUser,
          (s) => {
            answer(s, s.attempts[0].id, 1, choice, true);
          },
          racing,
        ),
      ]);
      const saved = (await reopen().read<UserState>("user:test"))!.value;
      expect(conflicts).toBeGreaterThan(0);
      expect(saved.profile.dailyTarget).toBe(17);
      expect(saved.attempts[0].items[1]).toMatchObject({
        selectedId: choice,
        guessed: true,
      });
      expect(saved.attempts[0].items[0]).toEqual(original.attempts[0].items[0]);
      expect(saved.bookmarks).toEqual(original.bookmarks);
      expect(saved.reports).toEqual(original.reports);
      expect(Object.values(saved.activity).flat()).toHaveLength(2);
    }, 20000);
  });
it("a managed read outage fails instead of replacing progress with defaults", async () => {
  const { store } = await backend("managed SQL");
  const original = fixture();
  await store.cas("user:test", 0, original);
  const rpc = mocks.createClient.getMockImplementation()!;
  const write = vi.fn();
  mocks.createClient.mockReturnValue({
    rpc: async (name: string) => {
      if (name === "reviewer_write") write();
      return { data: null, error: { message: "unavailable" } };
    },
  });
  await expect(
    mutate(
      "user:test",
      initialUser,
      (s) => {
        s.profile.dailyTarget = 15;
      },
      store,
    ),
  ).rejects.toThrow("Storage unavailable");
  expect(write).not.toHaveBeenCalled();
  mocks.createClient.mockImplementation(rpc);
  expect((await store.read<UserState>("user:test"))!.value).toEqual(original);
}, 20000);
