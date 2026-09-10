"use client";
import { useState } from "react";
import type { Disclosure } from "@/domain/types";
import { api, download, type Dashboard } from "./client";
export default function Settings({
  dashboard,
  refresh,
}: {
  dashboard: Dashboard;
  refresh: () => Promise<Dashboard>;
}) {
  const [profile, setProfile] = useState(dashboard.profile),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [password, setPassword] = useState(""),
    [factor, setFactor] = useState(""),
    [code, setCode] = useState(""),
    [enrollment, setEnrollment] = useState<{
      id: string;
      qr: string;
      secret: string;
    } | null>(null);
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
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
        </div>
      </div>
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
      <div className="settings-grid">
        <form
          className="settings-panel"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const { timezoneChangedAt: _, ...payload } = profile;
              void _;
              await api("settings", payload);
              await refresh();
              setMessage("Study preferences saved.");
            });
          }}
        >
          <h2>Study preferences</h2>
          <label>
            Your name
            <input
              value={profile.name}
              maxLength={60}
              autoComplete="given-name"
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              placeholder="Name"
            />
          </label>
          <div className="form-row">
            <label>
              Daily question target
              <input
                type="number"
                min={5}
                max={200}
                value={profile.dailyTarget}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    dailyTarget: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Exam date, optional
              <input
                type="date"
                value={profile.examDate}
                onChange={(e) =>
                  setProfile({ ...profile, examDate: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Timezone
            <input
              list="timezones"
              value={profile.timezone}
              onChange={(e) =>
                setProfile({ ...profile, timezone: e.target.value })
              }
            />
            <datalist id="timezones">
              {[
                "Asia/Manila",
                "Asia/Singapore",
                "Asia/Tokyo",
                "Europe/London",
                "America/New_York",
                "America/Los_Angeles",
                "Australia/Sydney",
                "UTC",
              ].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <p className="fine-print">
            Streaks use your local calendar day. Timezone changes affect future
            activity and are limited to once a week.
          </p>
          <label>
            Default answer feedback
            <select
              value={profile.disclosure}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  disclosure: e.target.value as Disclosure,
                })
              }
            >
              <option value="on-demand">Reveal when I choose</option>
              <option value="automatic">Show automatically</option>
              <option value="after-session">Wait until the session ends</option>
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save preferences"} →
          </button>
        </form>
        <div>
          <section className="settings-panel">
            <h2>Your data</h2>
            <p className="subtle">Export sessions, bookmarks, and progress.</p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  download("recall-progress.json", await api("export")),
                )
              }
            >
              Export my progress ↓
            </button>
            <div className="aside-rule" />
            <span className="eyebrow">ACCOUNT</span>
            <p>
              {dashboard.user.demo
                ? "Local sample session"
                : dashboard.user.email}
            </p>
            <p className="fine-print">
              {dashboard.user.demo
                ? "Progress stays on this machine; this browser remembers your workspace after sign-out."
                : "Your account is private. Contact the workspace owner to request account removal."}
            </p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("auth/logout", {});
                  window.location.href = "/";
                })
              }
            >
              Sign out of this workspace
            </button>
          </section>
          {!dashboard.user.demo && (
            <section className="settings-panel">
              <h2>Authenticator</h2>
              <p className="subtle">
                {dashboard.user.aal2
                  ? "Your authenticator is verified for this session."
                  : "An authenticator is required before an owner can publish or restore questions."}
              </p>
              <div className="action-strip">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await api<{
                        factors: { id: string; status: string }[];
                      }>("auth/mfa");
                      const verified = result.factors.find(
                        (f) => f.status === "verified",
                      );
                      if (verified) {
                        setFactor(verified.id);
                        setMessage(
                          "Enter the current code from your authenticator.",
                        );
                      } else {
                        const enrollment = await api<{
                          id: string;
                          qr: string;
                          secret: string;
                        }>("auth/mfa/enroll", {});
                        setEnrollment(enrollment);
                        setFactor(enrollment.id);
                      }
                    })
                  }
                >
                  Set up or verify authenticator
                </button>
              </div>
              {enrollment && (
                <div className="mfa-enrollment">
                  <img
                    src={
                      enrollment.qr.startsWith("data:")
                        ? enrollment.qr
                        : "data:image/svg+xml;charset=utf-8," +
                          encodeURIComponent(enrollment.qr)
                    }
                    width={200}
                    height={200}
                    alt="Scan this code with your authenticator app"
                  />
                  <details>
                    <summary>Enter a setup key instead</summary>
                    <code>{enrollment.secret}</code>
                  </details>
                </div>
              )}
              {factor && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api("auth/mfa/verify", { id: factor, code });
                      await refresh();
                      setFactor("");
                      setEnrollment(null);
                      setCode("");
                      setMessage("Authenticator verified.");
                    });
                  }}
                >
                  <label>
                    Six-digit code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    Verify
                  </button>
                </form>
              )}
            </section>
          )}
          {!dashboard.user.demo && (
            <form
              className="settings-panel"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api("auth/password", { password });
                  window.location.href = "/";
                });
              }}
            >
              <h2>Change password</h2>
              <label>
                New password
                <input
                  type="password"
                  minLength={12}
                  maxLength={200}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p className="fine-print">
                At least 12 characters. Changing your password signs out
                existing sessions.
              </p>
              <button className="button secondary" disabled={busy}>
                Update password
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
