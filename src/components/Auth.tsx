"use client";
import { useEffect, useRef, useState } from "react";
import { api, setCsrf, type Dashboard } from "./client";
declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}
export default function Auth({
  onLogin,
  recovery = false,
}: {
  onLogin: () => void;
  recovery?: boolean;
}) {
  const [settings, setSettings] = useState<{
      demo: boolean;
      siteKey: string;
    } | null>(null),
    [reset, setReset] = useState(false),
    [verified, setVerified] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const target = useRef<HTMLDivElement>(null),
    widget = useRef<string | null>(null);
  useEffect(() => {
    api<{ demo: boolean; siteKey: string }>("auth/config")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!settings?.siteKey || recovery) return;
    let disposed = false;
    const render = () => {
      if (!disposed && target.current && window.turnstile && !widget.current)
        widget.current = window.turnstile.render(target.current, {
          sitekey: settings.siteKey,
          theme: "dark",
          callback: (token: string) => setCaptcha(token),
          "expired-callback": () => setCaptcha(""),
        });
    };
    let script: HTMLScriptElement | undefined;
    if (window.turnstile) render();
    else {
      script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      if (widget.current) {
        window.turnstile?.remove(widget.current);
        widget.current = null;
      }
      script?.remove();
    };
  }, [settings, recovery]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (widget.current) {
        window.turnstile?.reset(widget.current);
        setCaptcha("");
      }
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          RECALL<span className="brand-period">.</span>
        </a>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <h1>
            {recovery
              ? "Reset password"
              : reset
                ? "Password reset"
                : settings?.demo
                  ? "Sample workspace"
                  : "Sign in"}
          </h1>
          {settings?.demo && (
            <p className="subtle">30 sample questions · Local progress</p>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {settings?.demo && !recovery ? (
            <>
              <button
                className="button primary wide"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("auth/demo", {});
                    onLogin();
                  })
                }
              >
                {busy ? "Opening workspace…" : "Open sample workspace"}{" "}
                <span>→</span>
              </button>
              <p className="fine-print"></p>
            </>
          ) : recovery ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (!verified) {
                    const token = new URLSearchParams(
                      window.location.search,
                    ).get("token_hash");
                    if (!token)
                      throw new Error(
                        "This link is missing its recovery token. Request a new reset email.",
                      );
                    await api("auth/recover", { token });
                    const b = await api<Dashboard>("bootstrap");
                    setCsrf(b.user.csrf);
                    setVerified(true);
                    window.history.replaceState(null, "", "/recover");
                  }
                  await api("auth/password", { password });
                  window.location.href = "/";
                });
              }}
            >
              <label>
                New password
                <input
                  type="password"
                  minLength={12}
                  maxLength={200}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <p className="fine-print">
                At least 12 characters. Existing sessions will be signed out.
              </p>
              <button className="button primary wide" disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (reset) {
                    const result = await api<{ message: string }>(
                      "auth/reset",
                      { email, captcha },
                    );
                    setMessage(result.message);
                  } else {
                    await api("auth/login", { email, password, captcha });
                    onLogin();
                  }
                });
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {!reset && (
                <label>
                  Password
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              <div ref={target} />
              <button
                className="button primary wide"
                disabled={busy || !settings || (!!settings.siteKey && !captcha)}
              >
                {busy
                  ? "Please wait…"
                  : reset
                    ? "Send reset instructions"
                    : "Sign in"}{" "}
                <span>→</span>
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setReset(!reset);
                  setError("");
                  setMessage("");
                }}
              >
                {reset ? "Back to sign in" : "Forgot your password?"}
              </button>
              <p className="fine-print">Invitation only.</p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
// Align local documentation for auth module
