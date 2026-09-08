import type { NextConfig } from "next";
if (process.env.VERCEL) {
  if (process.env.APP_MODE !== "managed")
    throw new Error(
      "Vercel builds require APP_MODE=managed; local demo deployment is disabled.",
    );
  for (const key of [
    "APP_ORIGIN",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "TURNSTILE_SITE_KEY",
  ]) {
    if (!process.env[key])
      throw new Error(`Missing hosted configuration: ${key}`);
  }
  if (!process.env.APP_ORIGIN?.startsWith("https://"))
    throw new Error("Hosted origins must use HTTPS.");
}
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    if (process.env.APP_MODE !== "demo" || !process.env.APP_ORIGIN) return [];
    const canonical = new URL(process.env.APP_ORIGIN);
    const hosts = ["localhost", "127.0.0.1", "[::1]"];
    if (!hosts.includes(canonical.hostname)) return [];
    // Configuration redirects preserve absolute loopback destinations. Proxy
    // redirects are relativized against Next's internal server hostname.
    return hosts
      .filter((host) => host !== canonical.hostname)
      .flatMap((host) =>
        ["/", "/recover"].map((path) => ({
          source: path,
          has: [
            {
              type: "host" as const,
              value: host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            },
          ],
          destination: canonical.origin + path,
          permanent: false,
        })),
      );
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
          ...(process.env.APP_ORIGIN?.startsWith("https://")
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};
export default config;
// Document the next adjustment for next config module
// Capture a cleanup item for next config module
