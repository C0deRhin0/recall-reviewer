import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  records: new Map<string, { revision: number; value: unknown }>(),
  cookie: new Map<string, string>(),
  cookieOptions: {} as Record<string, unknown>,
  getUser: vi.fn(),
  refresh: vi.fn(),
  setSession: vi.fn(),
  sessionActive: vi.fn(),
  signOut: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      mocked.cookie.has(key) ? { value: mocked.cookie.get(key) } : undefined,
    set: (key: string, value: string, options: Record<string, unknown>) => {
      mocked.cookie.set(key, value);
      mocked.cookieOptions = options;
    },
    delete: (key: string) => mocked.cookie.delete(key),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocked.createClient }));
vi.mock("../src/server/store", () => ({
  privileged: () => ({
    rpc: mocked.sessionActive,
    auth: { admin: { signOut: mocked.signOut } },
  }),
  store: () => ({
    read: async (key: string) => mocked.records.get(key) || null,
  }),
  mutate: async (
    key: string,
    initial: () => unknown,
    fn: (value: unknown) => unknown,
  ) => {
    const previous = mocked.records.get(key),
      value = structuredClone(previous?.value ?? initial());
    const result = fn(value);
    mocked.records.set(key, { revision: (previous?.revision ?? 0) + 1, value });
    return result;
  },
}));
import {
  identity,
  saveSession,
  revokeSession,
  rateLimit,
  authClient,
  openDemoSession,
} from "../src/server/auth";
import { config } from "../src/server/config";
import type { Session } from "@supabase/supabase-js";
const userId = "11111111-1111-4111-8111-111111111111",
  sessionId = "22222222-2222-4222-8222-222222222222";
function session(exp = Math.floor(Date.now() / 1000) + 3600): Session {
  const access = [
    "header",
    Buffer.from(
      JSON.stringify({ exp, session_id: sessionId, aal: "aal1" }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  return {
    access_token: access,
    refresh_token: "private-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId, email: "owner@example.invalid" },
  } as Session;
}
beforeEach(() => {
  mocked.records.clear();
  mocked.cookie.clear();
  mocked.cookieOptions = {};
  vi.clearAllMocks();
  vi.stubEnv("APP_MODE", "managed");
  vi.stubEnv("APP_ORIGIN", "https://reviewer.example.invalid");
  vi.stubEnv("SUPABASE_URL", "https://project.example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "placeholder");
  vi.stubEnv("SUPABASE_SECRET_KEY", "placeholder");
  vi.stubEnv("OWNER_EMAILS", "owner@example.invalid");
  vi.stubEnv("VERCEL", "");
  mocked.getUser.mockResolvedValue({
    data: { user: { id: userId, email: "owner@example.invalid" } },
    error: null,
  });
  mocked.sessionActive.mockResolvedValue({ data: true, error: null });
  mocked.signOut.mockResolvedValue({ error: null });
  mocked.setSession.mockResolvedValue({ error: null });
  mocked.createClient.mockReturnValue({
    auth: {
      getUser: mocked.getUser,
      refreshSession: mocked.refresh,
      setSession: mocked.setSession,
    },
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("server session boundary", () => {
  it("requires a stored opaque session instead of trusting a cookie value", async () => {
    mocked.cookie.set("reviewer_session", "forged-cookie");
    expect(await identity()).toBeNull();
    expect(mocked.getUser).not.toHaveBeenCalled();
  });
  it("stores provider tokens only on the server and sets secure cookie flags", async () => {
    const provider = session();
    await saveSession(provider);
    const cookie = mocked.cookie.get("reviewer_session")!;
    expect(cookie).not.toContain(provider.access_token);
    expect(cookie).not.toContain(provider.refresh_token);
    expect(cookie.length).toBeGreaterThan(32);
    expect(mocked.cookieOptions).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect([...mocked.records.values()][0].value).toMatchObject({
      accessToken: provider.access_token,
    });
  });
  it("signing in again keeps the same user ID for persisted progress", async () => {
    await saveSession(session());
    const before = await identity();
    const cookie = mocked.cookie.get("reviewer_session");
    await revokeSession();
    await saveSession(session());
    expect(mocked.cookie.get("reviewer_session")).not.toBe(cookie);
    expect((await identity())?.id).toBe(before?.id);
  });
  it("checks both provider identity and live session revocation", async () => {
    await saveSession(session());
    expect((await identity())?.owner).toBe(true);
    expect(mocked.sessionActive).toHaveBeenCalledWith(
      "reviewer_session_active",
      { session_uuid: sessionId, user_uuid: userId },
    );
    mocked.sessionActive.mockResolvedValue({ data: false, error: null });
    expect(await identity()).toBeNull();
  });
  it("rejects an invalid token even when the cookie record exists", async () => {
    await saveSession(session());
    mocked.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    });
    expect(await identity()).toBeNull();
    expect(mocked.sessionActive).not.toHaveBeenCalled();
  });
  it("never grants owner access from user-editable metadata", async () => {
    await saveSession(session());
    mocked.getUser.mockResolvedValue({
      data: {
        user: {
          id: userId,
          email: "learner@example.invalid",
          user_metadata: { role: "owner" },
        },
      },
      error: null,
    });
    expect((await identity())?.owner).toBe(false);
  });
  it("refreshes near-expiry credentials server-side and keeps the opaque cookie", async () => {
    await saveSession(session(1));
    const before = mocked.cookie.get("reviewer_session");
    const fresh = session();
    mocked.refresh.mockResolvedValue({
      data: { session: { ...fresh, refresh_token: "rotated-refresh" } },
      error: null,
    });
    expect(await identity()).not.toBeNull();
    expect(mocked.refresh).toHaveBeenCalledWith({
      refresh_token: "private-refresh-token",
    });
    expect(mocked.cookie.get("reviewer_session")).toBe(before);
    expect([...mocked.records.values()][0].value).toMatchObject({
      refreshToken: "rotated-refresh",
    });
  });
  it("globally revokes provider sessions and clears private tokens on logout", async () => {
    const provider = session();
    await saveSession(provider);
    await revokeSession(true);
    expect(mocked.signOut).toHaveBeenCalledWith(
      provider.access_token,
      "global",
    );
    expect(mocked.cookie.has("reviewer_session")).toBe(false);
    expect([...mocked.records.values()][0].value).toMatchObject({
      revoked: true,
      accessToken: "",
      refreshToken: "",
    });
  });
  it("does not reuse browser-managed auth storage", () => {
    authClient();
    expect(mocked.createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  });
  it("shares rate counters and rejects an excess request", async () => {
    await rateLimit("test", 2, 60000);
    await rateLimit("test", 2, 60000);
    await expect(rateLimit("test", 2, 60000)).rejects.toThrow(
      "Too many requests",
    );
  });
});
describe("environment separation", () => {
  it("rejects a demo deployment even on a Vercel preview", () => {
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
    vi.stubEnv("VERCEL", "1");
    expect(() => config()).toThrow("restricted to local");
  });
  it("rejects demo mode for a nonlocal origin", () => {
    vi.stubEnv("APP_MODE", "demo");
    expect(() => config()).toThrow("restricted to local");
  });
  it("requires explicit configuration instead of silently falling back to demo", () => {
    vi.stubEnv("APP_MODE", "");
    expect(() => config()).toThrow("explicitly");
    vi.stubEnv("APP_MODE", "managed");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => config()).toThrow("incomplete");
  });
});

describe("remembered local workspace", () => {
  it("reopens the same workspace after session expiry while keeping other browsers separate", async () => {
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
    await openDemoSession();
    const first = await identity();
    const workspace = mocked.cookie.get("reviewer_local_workspace");
    for (const [key, record] of mocked.records) {
      if (key.startsWith("session:"))
        (record.value as { expires: number }).expires = 0;
    }
    expect(await identity()).toBeNull();
    await openDemoSession();
    expect((await identity())?.id).toBe(first?.id);
    expect(mocked.cookie.get("reviewer_local_workspace")).toBe(workspace);
    mocked.cookie.clear();
    await openDemoSession();
    expect((await identity())?.id).not.toBe(first?.id);
  });
  it("cannot use the remembered demo identity in managed mode", async () => {
    mocked.cookie.set("reviewer_local_workspace", "local-only");
    await expect(openDemoSession()).rejects.toThrow("Demo access is disabled");
    expect(mocked.records.size).toBe(0);
  });
});
// Clarify implementation notes for auth test module
// Document the next adjustment for auth test module
