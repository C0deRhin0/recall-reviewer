import "server-only";
export function config() {
  const mode = process.env.APP_MODE;
  if (mode !== "demo" && mode !== "managed")
    throw new Error("Set APP_MODE explicitly to demo or managed.");
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error("APP_ORIGIN is required.");
  const url = new URL(origin);
  if (
    mode === "demo" &&
    (process.env.VERCEL ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("Demo mode is restricted to local development.");
  if (
    mode === "managed" &&
    (!process.env.SUPABASE_URL ||
      !process.env.SUPABASE_PUBLISHABLE_KEY ||
      !process.env.SUPABASE_SECRET_KEY)
  )
    throw new Error(
      "Managed authentication and database configuration is incomplete.",
    );
  if (process.env.VERCEL && url.protocol !== "https:")
    throw new Error("Hosted deployments require an HTTPS origin.");
  if (
    mode === "managed" &&
    process.env.VERCEL &&
    !process.env.TURNSTILE_SITE_KEY
  )
    throw new Error(
      "Hosted authentication requires bot protection configuration.",
    );
  return {
    mode,
    origin: url.origin,
    secure: url.protocol === "https:",
    ownerEmails: (process.env.OWNER_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}
// Capture a cleanup item for config module
