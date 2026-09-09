import "server-only";
import { cookies } from "next/headers";
import { createClient, type Session } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "./config";
import { mutate, privileged, store } from "./store";
const cookieName = "reviewer_session";
const workspaceCookie = "reviewer_local_workspace";
export type Identity = {
  id: string;
  email: string;
  owner: boolean;
  demo: boolean;
  csrf: string;
  aal2: boolean;
};
type SavedSession = {
  id: string;
  email: string;
  csrf: string;
  expires: number;
  authenticatedAt: number;
  accessToken: string;
  refreshToken: string;
  providerId: string;
  aal2: boolean;
  revoked: boolean;
};
export function authClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function claims(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
}
async function rememberLocalWorkspace(id: string) {
  const jar = await cookies();
  let token = jar.get(workspaceCookie)?.value;
  const existing = token
    ? await store().read<{ id: string }>("workspace:" + digest(token))
    : null;
  if (existing?.value.id !== id) {
    token = randomBytes(32).toString("base64url");
    await mutate(
      "workspace:" + digest(token),
      () => ({ id }),
      () => null,
    );
  }
  jar.set(workspaceCookie, token!, {
    httpOnly: true,
    secure: config().secure,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86400,
  });
}
export async function openDemoSession() {
  if (config().mode !== "demo") throw new Error("Demo access is disabled.");
  const active = await currentSession();
  if (active) {
    await rememberLocalWorkspace(active.id);
    return;
  }
  const token = (await cookies()).get(workspaceCookie)?.value;
  const workspace = token
    ? await store().read<{ id: string }>("workspace:" + digest(token))
    : null;
  await saveSession(null, workspace?.value.id || randomUUID());
}
export async function saveSession(session: Session | null, demoId?: string) {
  if (demoId && config().mode !== "demo")
    throw new Error("Demo access is disabled.");
  const token = randomBytes(32).toString("base64url"),
    csrf = randomBytes(32).toString("base64url");
  const saved: SavedSession = {
    id: demoId || session!.user.id,
    email: demoId ? "local@example.invalid" : session!.user.email || "",
    csrf,
    expires: Date.now() + 7 * 86400000,
    authenticatedAt: Date.now(),
    accessToken: session?.access_token || "",
    refreshToken: session?.refresh_token || "",
    providerId: session ? claims(session.access_token).session_id : "",
    aal2: session ? claims(session.access_token).aal === "aal2" : true,
    revoked: false,
  };
  await mutate(
    "session:" + digest(token),
    () => saved,
    (s) => s,
  );
  if (demoId) await rememberLocalWorkspace(demoId);
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: config().secure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
  return saved;
}
export async function currentSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const record = await store().read<SavedSession>("session:" + digest(token));
  if (!record || record.value.revoked || record.value.expires < Date.now())
    return null;
  return { token, ...record.value };
}
export async function identity(): Promise<Identity | null> {
  const session = await currentSession();
  if (!session) return null;
  const cfg = config();
  if (cfg.mode === "demo")
    return {
      id: session.id,
      email: session.email,
      owner: true,
      demo: true,
      csrf: session.csrf,
      aal2: true,
    };
  const client = authClient();
  let access = session.accessToken;
  if (claims(access).exp * 1000 < Date.now() + 30000) {
    const { data, error } = await client.auth.refreshSession({
      refresh_token: session.refreshToken,
    });
    if (error || !data.session) return null;
    access = data.session.access_token;
    await mutate(
      "session:" + digest(session.token),
      () => session,
      (s) => {
        if (!s.revoked) {
          s.accessToken = data.session!.access_token;
          s.refreshToken = data.session!.refresh_token;
          s.aal2 = claims(access).aal === "aal2";
        }
        return null;
      },
    );
  }
  const {
    data: { user },
    error,
  } = await client.auth.getUser(access);
  if (error || !user || user.id !== session.id) return null;
  const { data: active, error: activeError } = await privileged().rpc(
    "reviewer_session_active",
    { session_uuid: claims(access).session_id, user_uuid: user.id },
  );
  if (activeError || !active) return null;
  return {
    id: user.id,
    email: user.email || "",
    owner: cfg.ownerEmails.includes((user.email || "").toLowerCase()),
    demo: false,
    csrf: session.csrf,
    aal2: claims(access).aal === "aal2",
  };
}
export async function authenticatedClient() {
  const s = await currentSession();
  if (!s) throw new Error("Sign in to continue.");
  const client = authClient();
  const { error } = await client.auth.setSession({
    access_token: s.accessToken,
    refresh_token: s.refreshToken,
  });
  if (error) throw new Error("Sign in again to continue.");
  return client;
}
export async function revokeSession(global = false) {
  const s = await currentSession();
  if (s) {
    if (config().mode === "managed") {
      const { error } = await privileged().auth.admin.signOut(
        s.accessToken,
        global ? "global" : "local",
      );
      if (error)
        throw new Error("Could not revoke your session. Please retry.");
    }
    await mutate(
      "session:" + digest(s.token),
      () => s,
      (state) => {
        state.revoked = true;
        state.accessToken = "";
        state.refreshToken = "";
        return null;
      },
    );
  }
  (await cookies()).delete(cookieName);
}
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const allowed = await mutate(
    "rate:" + digest(key),
    () => ({ start: now, count: 0 }),
    (s) => {
      if (now - s.start >= windowMs) {
        s.start = now;
        s.count = 0;
      }
      s.count++;
      return s.count <= limit;
    },
  );
  if (!allowed)
    throw new Error("Too many requests. Wait a few minutes and try again.");
}
// Align local documentation for auth module
// Review follow-up details for auth module
