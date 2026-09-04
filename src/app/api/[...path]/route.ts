import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { config } from "@/server/config";
import {
  authClient,
  authenticatedClient,
  currentSession,
  identity,
  rateLimit,
  revokeSession,
  saveSession,
  openDemoSession,
  type Identity,
} from "@/server/auth";
import {
  bankKey,
  dashboard,
  emptyBank,
  getBank,
  getUserState,
} from "@/server/service";
import { mutate } from "@/server/store";
import { initialUser, type Bank } from "@/domain/types";
import {
  activeRelease,
  answer,
  eligibleQuestions,
  expireAttempts,
  finishAttempt,
  publicAttempt,
  startAttempt,
  questionKey,
} from "@/domain/engine";
import {
  bankSchema,
  exportRelease,
  parseImport,
  prepareRelease,
} from "@/domain/content";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const uuid = z.string().uuid();
const fail = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });
function owner(user: Identity) {
  if (!user.owner) throw fail("Owner access required.", 403);
  if (!user.aal2 && !user.demo)
    throw fail(
      "Verify your authenticator in Settings before managing questions.",
      403,
    );
}
async function body(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw fail("Expected JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) return {};
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 2200000) {
      await reader.cancel();
      throw fail(
        "Request exceeds 2 MiB. Split the import into smaller batches.",
        413,
      );
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw fail("Invalid JSON request.");
  }
}
async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/");
    const cfg = config();
    if (request.method === "GET" && path === "auth/config")
      return reply({
        demo: cfg.mode === "demo",
        siteKey: process.env.TURNSTILE_SITE_KEY || "",
      });
    if (
      request.method === "POST" &&
      (request.headers.get("origin") !== cfg.origin ||
        request.headers.get("x-reviewer-request") !== "1")
    )
      throw fail("Request origin could not be verified. Reload the app.", 403);
    const data = request.method === "POST" ? await body(request) : {};
    if (request.method === "POST" && path === "auth/demo") {
      if (cfg.mode !== "demo") throw fail("Demo access is disabled.", 404);
      await openDemoSession();
      return reply({ ok: true });
    }
    if (
      request.method === "POST" &&
      ["auth/login", "auth/reset", "auth/recover"].includes(path)
    ) {
      const client = cfg.mode === "managed" ? authClient() : null;
      if (!client) throw fail("Use the local sample session.");
      const ip = process.env.VERCEL
        ? request.headers.get("x-vercel-forwarded-for") || "unknown"
        : "local";
      await rateLimit("auth-ip:" + ip, 20, 15 * 60000);
      if (path === "auth/login") {
        const input = z
          .object({
            email: z.email().max(254),
            password: z.string().min(1).max(200),
            captcha: z.string().min(1).max(4096),
          })
          .strict()
          .parse(data);
        await rateLimit("login:" + input.email.toLowerCase(), 10, 15 * 60000);
        const { data: result, error } = await client.auth.signInWithPassword({
          email: input.email,
          password: input.password,
          options: { captchaToken: input.captcha },
        });
        if (error || !result.session || !result.user.email_confirmed_at)
          throw fail("Unable to sign in with those details.", 401);
        await saveSession(result.session);
        return reply({ ok: true });
      }
      if (path === "auth/reset") {
        const input = z
          .object({
            email: z.email().max(254),
            captcha: z.string().min(1).max(4096),
          })
          .strict()
          .parse(data);
        await rateLimit("reset:" + input.email.toLowerCase(), 3, 60 * 60000);
        await client.auth.resetPasswordForEmail(input.email, {
          redirectTo: cfg.origin + "/recover",
          captchaToken: input.captcha,
        });
        return reply({
          message:
            "If this account can receive a reset email, instructions will arrive shortly.",
        });
      }
      const input = z
        .object({ token: z.string().min(20).max(2048) })
        .strict()
        .parse(data);
      const { data: result, error } = await client.auth.verifyOtp({
        token_hash: input.token,
        type: "recovery",
      });
      if (error || !result.session)
        throw fail(
          "This recovery link is invalid or expired. Request another one.",
        );
      await saveSession(result.session);
      return reply({ ok: true });
    }
    const user = await identity();
    if (!user) return reply({ error: "Sign in to continue." }, 401);
    if (
      request.method === "POST" &&
      request.headers.get("x-csrf-token") !== user.csrf
    )
      throw fail("Your session changed. Reload before trying again.", 403);
    await rateLimit("api:" + user.id, 300, 60000);
    if (request.method === "POST" && path === "auth/logout") {
      await revokeSession();
      return reply({ ok: true });
    }
    if (request.method === "POST" && path === "auth/password") {
      if (user.demo) throw fail("Passwords are managed in connected accounts.");
      const session = await currentSession();
      if (!session || Date.now() - (session.authenticatedAt || 0) > 15 * 60000)
        throw fail(
          "Sign in again or verify your authenticator before changing your password.",
          403,
        );
      const input = z
        .object({ password: z.string().min(12).max(200) })
        .strict()
        .parse(data);
      const client = await authenticatedClient();
      const { error } = await client.auth.updateUser({
        password: input.password,
      });
      if (error)
        throw fail(
          "Unable to update password. Reauthenticate or request a new recovery link.",
        );
      await revokeSession(true);
      return reply({ ok: true });
    }
    if (path === "auth/mfa" && request.method === "GET") {
      if (user.demo) return reply({ factors: [] });
      const client = await authenticatedClient();
      const { data: result, error } = await client.auth.mfa.listFactors();
      if (error) throw fail("Unable to load authenticators.");
      return reply({
        factors: result.totp.map((f) => ({
          id: f.id,
          name: f.friendly_name,
          status: f.status,
        })),
      });
    }
    if (path === "auth/mfa/enroll" && request.method === "POST") {
      if (user.demo)
        throw fail("Connect an account to enroll an authenticator.");
      const client = await authenticatedClient();
      const { data: existing, error: factorError } =
        await client.auth.mfa.listFactors();
      if (factorError) throw fail("Unable to check existing authenticators.");
      for (const factor of existing.all.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      )) {
        const { error: removeError } = await client.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (removeError)
          throw fail("Unable to restart authenticator setup. Please retry.");
      }
      const { data: result, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Reviewer authenticator",
      });
      if (error)
        throw fail(
          "Unable to enroll. Verify an existing authenticator if you already have one.",
        );
      return reply({
        id: result.id,
        qr: result.totp.qr_code,
        secret: result.totp.secret,
      });
    }
    if (path === "auth/mfa/verify" && request.method === "POST") {
      const input = z
        .object({ id: uuid, code: z.string().regex(/^\d{6}$/) })
        .strict()
        .parse(data);
      const client = await authenticatedClient();
      const { data: result, error } = await client.auth.mfa.challengeAndVerify({
        factorId: input.id,
        code: input.code,
      });
      if (error) throw fail("Invalid or expired authenticator code.");
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session || !result) throw fail("Verification failed.");
      await saveSession(sessionData.session);
      return reply({ ok: true });
    }
    if (request.method === "POST" && path === "settings") {
      const input = z
        .object({
          name: z.string().trim().max(60),
          timezone: z.string().max(80),
          dailyTarget: z.number().int().min(5).max(200),
          examDate: z
            .string()
            .refine(
              (v) =>
                v === "" ||
                (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))),
            ),
          disclosure: z.enum(["automatic", "on-demand", "after-session"]),
        })
        .strict()
        .parse(data);
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      } catch {
        throw fail("Choose a valid IANA timezone.");
      }
      await mutate("user:" + user.id, initialUser, (state) => {
        if (input.timezone !== state.profile.timezone) {
          if (
            state.profile.timezoneChangedAt &&
            Date.now() - Date.parse(state.profile.timezoneChangedAt) <
              7 * 86400000
          )
            throw fail("Timezone can be changed once every seven days.");
          state.profile.timezoneChangedAt = new Date().toISOString();
        }
        state.profile = { ...state.profile, ...input };
        return null;
      });
      return reply({ ok: true });
    }
    const bank = await getBank(user);
    if (request.method === "GET" && path === "bootstrap") {
      // Adopt existing local sessions before they sign out or expire.
      if (user.demo) await openDemoSession();
      return reply(dashboard(user, bank, await getUserState(user)));
    }
    if (request.method === "GET" && path === "pool") {
      const mode = z
        .enum([
          "mixed",
          "category",
          "mistakes",
          "bookmarks",
          "due",
          "mock",
          "weighted",
        ])
        .parse(request.nextUrl.searchParams.get("mode") || "mixed");
      const category = request.nextUrl.searchParams.get("category") || "";
      return reply({
        count: bank.activeId
          ? eligibleQuestions(
              activeRelease(bank),
              await getUserState(user),
              mode,
              category,
            ).length
          : 0,
      });
    }
    if (request.method === "POST" && path === "attempts") {
      const input = z
        .object({
          mode: z.enum([
            "mixed",
            "category",
            "mistakes",
            "bookmarks",
            "due",
            "mock",
            "weighted",
          ]),
          category: z.string().max(100),
          count: z.number().int().min(1).max(100),
          disclosure: z.enum(["automatic", "on-demand", "after-session"]),
          minutes: z.number().int().min(1).max(180),
          preferUnseen: z.boolean(),
          requestId: uuid,
        })
        .strict()
        .parse(data);
      const result = await mutate("user:" + user.id, initialUser, (state) => {
        expireAttempts(state);
        return publicAttempt(startAttempt(bank, state, input));
      });
      return reply(result);
    }
    if (path.startsWith("attempts/")) {
      const [, id, action] = path.split("/");
      uuid.parse(id);
      if (request.method === "GET" && !action) {
        const state = await getUserState(user);
        const a = state.attempts.find((a) => a.id === id);
        if (!a) throw fail("Session not found.", 404);
        return reply(publicAttempt(a));
      }
      if (request.method === "POST") {
        const result = await mutate("user:" + user.id, initialUser, (state) => {
          expireAttempts(state);
          const a = state.attempts.find((a) => a.id === id);
          if (!a) throw fail("Session not found.", 404);
          if (action === "answer") {
            const x = z
              .object({
                index: z.number().int().min(0).max(99),
                choice: z.string().max(100),
                guessed: z.boolean(),
              })
              .strict()
              .parse(data);
            answer(state, id, x.index, x.choice, x.guessed);
          } else if (action === "finish") finishAttempt(state, a);
          else if (action === "reveal") {
            const x = z
              .object({ index: z.number().int().min(0).max(99) })
              .strict()
              .parse(data);
            const item = a.items[x.index];
            if (
              !item ||
              !item.selectedId ||
              (a.disclosure === "after-session" && !a.completedAt)
            )
              throw fail("Explanation is not available yet.", 403);
            item.revealed = true;
          } else if (action === "flag") {
            const x = z
              .object({
                index: z.number().int().min(0).max(99),
                flagged: z.boolean(),
              })
              .strict()
              .parse(data);
            if (!a.items[x.index]) throw fail("Question not found.");
            a.items[x.index].flagged = x.flagged;
          } else throw fail("Action not found.", 404);
          return publicAttempt(a);
        });
        return reply(result);
      }
    }
    if (request.method === "POST" && path === "bookmarks") {
      const x = z
        .object({
          attempt: uuid,
          index: z.number().int().min(0).max(99),
          saved: z.boolean(),
        })
        .strict()
        .parse(data);
      await mutate("user:" + user.id, initialUser, (s) => {
        const a = s.attempts.find((a) => a.id === x.attempt),
          item = a?.items[x.index];
        if (!a || !item)
          throw fail("Practice this question before bookmarking it.");
        const key = questionKey(
          a.examCode,
          a.edition,
          item.question.external_id,
        );
        s.bookmarks = s.bookmarks.filter((id) => id !== key);
        if (x.saved) s.bookmarks.push(key);
        return null;
      });
      return reply({ ok: true });
    }
    if (request.method === "POST" && path === "reports") {
      const x = z
        .object({
          attempt: uuid,
          index: z.number().int().min(0).max(99),
          message: z.string().trim().min(5).max(2000),
        })
        .strict()
        .parse(data);
      await rateLimit("reports:" + user.id, 10, 3600000);
      await mutate("user:" + user.id, initialUser, (s) => {
        const item = s.attempts.find((a) => a.id === x.attempt)?.items[x.index];
        if (!item) throw fail("Question not found.");
        s.reports.push({
          id: randomUUID(),
          questionId: item.question.external_id,
          revision: item.question.revision,
          message: x.message,
          at: new Date().toISOString(),
        });
        return null;
      });
      return reply({ ok: true });
    }
    if (request.method === "GET" && path === "export") {
      const state = await getUserState(user);
      return reply({
        schema_version: 1,
        profile: state.profile,
        attempts: state.attempts.map(publicAttempt),
        bookmarks: state.bookmarks,
        activity: state.activity,
        reports: state.reports,
      });
    }
    if (request.method === "GET" && path === "reports") {
      return reply((await getUserState(user)).reports);
    }
    if (request.method === "GET" && path === "bank") {
      owner(user);
      return reply({
        activeId: bank.activeId,
        releases: bank.releases.map((r) => ({
          id: r.id,
          label: r.label,
          edition: r.edition,
          count: r.questions.length,
          status: r.status,
          createdAt: r.createdAt,
          parentId: r.parentId,
        })),
        audit: bank.audit.slice(-50).reverse(),
        active: bank.activeId ? exportRelease(activeRelease(bank)) : null,
      });
    }
    if (request.method === "POST" && path === "bank/preview") {
      owner(user);
      await rateLimit("import:" + user.id, 20, 3600000);
      const x = z
        .object({
          raw: z.string().max(2100000),
          format: z.enum(["json", "csv"]),
          mode: z.enum(["merge", "replace"]),
        })
        .strict()
        .parse(data);
      const current = bank.activeId ? activeRelease(bank) : null;
      const parsed = parseImport(
        x.raw,
        x.format,
        current
          ? {
              exam_code: current.examCode,
              edition: current.edition,
              release_label:
                current.edition +
                "-import-" +
                new Date().toISOString().slice(0, 10),
              categories: current.categories,
            }
          : undefined,
      );
      const prepared = prepareRelease(bank, parsed, x.mode);
      return reply({
        input: parsed,
        mode: x.mode,
        parentId: bank.activeId,
        changes: prepared.changes,
        unchanged: prepared.unchanged,
        count: prepared.release.questions.length,
      });
    }
    if (request.method === "POST" && path === "bank/stage") {
      owner(user);
      const x = z
        .object({
          input: bankSchema,
          mode: z.enum(["merge", "replace"]),
          parentId: uuid.nullable(),
        })
        .strict()
        .parse(data);
      const result = await mutate<Bank, { id: string; unchanged: boolean }>(
        bankKey(user),
        emptyBank,
        (b) => {
          if (b.activeId !== x.parentId)
            throw fail(
              "The active release changed. Preview the import again.",
              409,
            );
          const { release, unchanged } = prepareRelease(b, x.input, x.mode);
          if (unchanged) return { id: b.activeId!, unchanged: true };
          const duplicate = b.releases.find(
            (r) => r.hash === release.hash && r.parentId === b.activeId,
          );
          if (duplicate) return { id: duplicate.id, unchanged: false };
          if (b.releases.some((r) => r.label === release.label))
            throw fail("Use a new release label; that label already exists.");
          b.releases.push(release);
          b.audit.push({
            at: new Date().toISOString(),
            actor: user.id,
            action: "staged",
            target: release.id,
          });
          return { id: release.id, unchanged: false };
        },
      );
      return reply(result);
    }
    if (request.method === "POST" && path === "bank/activate") {
      owner(user);
      const x = z
        .object({ id: uuid, expectedActiveId: uuid.nullable() })
        .strict()
        .parse(data);
      await mutate<Bank, null>(bankKey(user), emptyBank, (b) => {
        if (b.activeId !== x.expectedActiveId)
          throw fail(
            "The active release changed. Refresh and review again.",
            409,
          );
        const r = b.releases.find((r) => r.id === x.id);
        if (!r) throw fail("Release not found.", 404);
        if (r.status === "draft" && r.parentId !== b.activeId)
          throw fail(
            "This draft is based on an older release. Preview and stage the import again.",
            409,
          );
        b.activeId = r.id;
        r.status = "published";
        b.audit.push({
          at: new Date().toISOString(),
          actor: user.id,
          action: "activated",
          target: r.id,
        });
        return null;
      });
      return reply({ ok: true });
    }
    return reply({ error: "Endpoint not found." }, 404);
  } catch (error) {
    if (error instanceof ZodError)
      return reply(
        {
          error: error.issues
            .slice(0, 8)
            .map((i) => `${i.path.join(".") || "Import"}: ${i.message}`)
            .join("\n"),
        },
        400,
      );
    const e = error as Error & { status?: number };
    console.error(
      JSON.stringify({
        event: "request_failed",
        requestId: randomUUID(),
        status: e.status || 400,
        type: e.name || "Error",
      }),
    );
    return reply(
      { error: e.message || "Unable to complete the request." },
      e.status || 400,
    );
  }
}
export const GET = handle;
export const POST = handle;
// Document the next adjustment for route module
