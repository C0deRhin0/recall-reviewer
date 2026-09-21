"use client";
import { useEffect, useRef, useState } from "react";
import { api, date, modeNames, setCsrf, type Dashboard } from "./client";
import Auth from "./Auth";
import Practice from "./Practice";
import Bank from "./Bank";
import Settings from "./Settings";
import StudyDesk from "./StudyDesk";
type View =
  "dashboard" | "practice" | "progress" | "history" | "bank" | "settings";
const nav: { id: View; label: string; number: string }[] = [
  { id: "dashboard", label: "Study desk", number: "01" },
  { id: "practice", label: "Practice", number: "02" },
  { id: "progress", label: "Progress", number: "03" },
  { id: "history", label: "History", number: "04" },
  { id: "bank", label: "Question bank", number: "05" },
];
export default function App({
  recovery = false,
  initialData = null,
}: {
  recovery?: boolean;
  initialData?: Dashboard | null;
}) {
  const [data, setData] = useState<Dashboard | null>(initialData),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [signingOutBusy, setSigningOutBusy] = useState(false),
    [view, setView] = useState<View>("dashboard"),
    [attempt, setAttempt] = useState(""),
    [preset, setPreset] = useState({ mode: "mixed", category: "" });
  const signingOut = useRef(false);
  useEffect(() => {
    setCsrf(data?.user.csrf || "");
  }, [data?.user.csrf]);
  async function refresh() {
    const result = await api<Dashboard>("bootstrap");
    setCsrf(result.user.csrf);
    setData(result);
    return result;
  }
  useEffect(() => {
    const expired = () => {
      setCsrf("");
      setData(null);
    };
    window.addEventListener("reviewer:session-expired", expired);
    return () =>
      window.removeEventListener("reviewer:session-expired", expired);
  }, []);
  useEffect(() => {
    if (recovery) return;
    const sync = () => {
      const q = new URLSearchParams(location.search);
      const v = q.get("view");
      if (
        [
          "dashboard",
          "practice",
          "progress",
          "history",
          "bank",
          "settings",
        ].includes(v || "")
      )
        setView(v as View);
      else setView("dashboard");
      setAttempt(q.get("attempt") || "");
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [recovery]);
  function go(v: View, id = "", mode = "mixed", category = "") {
    setView(v);
    setAttempt(id);
    setPreset({ mode, category });
    window.history.pushState(
      null,
      "",
      `/?view=${v}${id ? "&attempt=" + id : ""}`,
    );
    setError("");
    window.scrollTo(0, 0);
  }
  if (loading)
    return (
      <div className="loading-screen">
        <span className="brand">
          RECALL<span className="brand-period">.</span>
        </span>
        <p>Opening your study desk…</p>
      </div>
    );
  if (!data || recovery)
    return (
      <>
        {error && (
          <div className="global-error" role="alert">
            {error}
          </div>
        )}
        <Auth
          recovery={recovery}
          onLogin={async () => {
            setLoading(true);
            try {
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        />
      </>
    );
  return (
    <div
      className={
        "app-shell " + (view === "practice" && attempt ? "focus-session" : "")
      }
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          <span className="brand-mark" aria-hidden="true" />
          RECALL<span className="brand-period">.</span>
        </a>
        <div className="workspace-label">
          <strong>Security+</strong>
          <span className="mono">
            {data.release?.edition || "v7"} ·{" "}
            {data.user.demo ? "Sample" : "Reviewer"}
          </span>
        </div>
        <nav aria-label="Main navigation">
          {nav
            .filter((n) => n.id !== "bank" || data.user.owner)
            .map((n) => (
              <button
                key={n.id}
                className={"nav-item " + (view === n.id ? "active" : "")}
                onClick={() => go(n.id)}
                aria-current={view === n.id ? "page" : undefined}
              >
                {n.label}
                {n.id === "practice" && data.due > 0 && (
                  <span className="nav-count">{data.due}</span>
                )}
              </button>
            ))}
          <button
            className={
              "nav-item mobile-settings " +
              (view === "settings" ? "active" : "")
            }
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => go("settings")}
          >
            Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={"nav-item " + (view === "settings" ? "active" : "")}
            onClick={() => go("settings")}
          >
            <span className="nav-number" aria-hidden="true">
              ↳
            </span>
            Settings
          </button>
          <div className="account">
            <span className="avatar">
              {(data.profile.name || data.user.email).slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{data.profile.name || "Your workspace"}</strong>
              <span>
                {data.user.demo ? "Local sample session" : "Personal account"}
              </span>
            </div>
            <button
              className="text-button"
              aria-label="Sign out"
              onClick={async () => {
                if (signingOut.current) return;
                signingOut.current = true;
                setSigningOutBusy(true);
                try {
                  await api("auth/logout", {});
                  setCsrf("");
                  setData(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  signingOut.current = false;
                  setSigningOutBusy(false);
                }
              }}
              disabled={signingOutBusy}
              title={signingOutBusy ? "Signing out…" : "Sign out"}
            >
              {signingOutBusy ? "…" : "↗"}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <main
          id="main"
          tabIndex={-1}
          className={
            "main-content " + (view === "practice" ? "practice-content" : "")
          }
        >
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {view === "dashboard" && (
            <StudyDesk
              data={data}
              open={(id) => go("practice", id)}
              configure={(mode = "mixed", category = "") =>
                go("practice", "", mode, category)
              }
              progress={() => go("progress")}
              history={() => go("history")}
            />
          )}
          {view === "practice" && (
            <Practice
              dashboard={data}
              attemptId={attempt}
              preset={preset}
              onAttempt={(id) => {
                setAttempt(id);
                window.history.replaceState(
                  null,
                  "",
                  "/?view=practice&attempt=" + id,
                );
              }}
              refresh={refresh}
              onExit={() => go("dashboard")}
            />
          )}
          {view === "progress" && (
            <Progress
              data={data}
              practice={(mode) => go("practice", "", mode)}
            />
          )}
          {view === "history" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>History</h1>
                </div>
                <button
                  className="button primary"
                  onClick={() => go("practice")}
                >
                  New session →
                </button>
              </div>
              <SessionList data={data} open={(id) => go("practice", id)} />
            </>
          )}
          {view === "bank" && <Bank dashboard={data} refresh={refresh} />}
          {view === "settings" && (
            <Settings dashboard={data} refresh={refresh} />
          )}
        </main>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
}) {
  return (
    <div className="metric">
      <span className="eyebrow">{label}</span>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      {detail && <span className="fine-print">{detail}</span>}
    </div>
  );
}
function SessionList({
  data,
  open,
  limit,
}: {
  data: Dashboard;
  open: (id: string) => void;
  limit?: number;
}) {
  const sessions = limit ? data.attempts.slice(0, limit) : data.attempts;
  return sessions.length ? (
    <div className="session-list">
      {sessions.map((a) => (
        <button className="session-row" key={a.id} onClick={() => open(a.id)}>
          <span className="session-symbol">{a.completedAt ? "✓" : "↻"}</span>
          <span className="session-name">
            {modeNames[a.mode]}
            <span>
              {date(a.startedAt)} · {a.total} questions · {a.releaseLabel}
            </span>
          </span>
          <span className="mono">
            {a.completedAt
              ? `${a.score} / ${a.total}`
              : `${a.answered} / ${a.total}`}
          </span>
          <span className="session-state">
            {a.completedAt ? "Review results" : "Continue"} →
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <p>No sessions yet.</p>
    </div>
  );
}
function Progress({
  data,
  practice,
}: {
  data: Dashboard;
  practice: (mode: string) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Progress</h1>
        </div>
        <button className="button primary" onClick={() => practice("mistakes")}>
          Review mistakes →
        </button>
      </div>
      <div className="metrics">
        <Metric
          label="FIRST-ENCOUNTER ACCURACY"
          value={
            data.stats.firstAccuracy === null
              ? "—"
              : data.stats.firstAccuracy + "%"
          }
          detail="Your first recorded answer per question"
        />
        <Metric
          label="OVERALL ACCURACY"
          value={data.stats.accuracy === null ? "—" : data.stats.accuracy + "%"}
          detail="Includes repeated questions"
        />
        <Metric label="DUE FOR REVIEW" value={String(data.due)} detail="" />
        <Metric
          label="SAVED QUESTIONS"
          value={String(data.bookmarks.length)}
          detail=""
        />
      </div>
      <div className="action-strip">
        <button className="button secondary" onClick={() => practice("due")}>
          Practice due questions
        </button>
        <button
          className="button secondary"
          onClick={() => practice("bookmarks")}
        >
          Practice saved questions
        </button>
        <button className="button secondary" onClick={() => practice("mock")}>
          Take a timed mock
        </button>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <h2>Category coverage</h2>
          <span className="fine-print">
            Accuracy is practice feedback, not a predicted exam score.
          </span>
        </div>
        {data.stats.categories.map((c) => (
          <div className="coverage-row" key={c.slug}>
            <div>
              <strong>{c.name}</strong>
              <span className="subtle">
                {c.seen} of {c.count} questions explored
              </span>
            </div>
            <div className="coverage-track">
              <span
                style={{ width: `${c.count ? (c.seen / c.count) * 100 : 0}%` }}
              />
            </div>
            <span className="mono">
              {c.accuracy === null ? "—" : c.accuracy + "%"}
            </span>
          </div>
        ))}
      </section>
      <section className="section-block">
        <h2>Objective coverage</h2>
        <p className="subtle">
          {data.user.demo
            ? "Sample objective labels are placeholders until your syllabus is confirmed."
            : "Coverage follows the objective codes in your active release."}
        </p>
        <div className="objective-grid">
          {data.stats.objectives.map((o) => (
            <div className="objective" key={o.code}>
              <span className="mono">{o.code}</span>
              <strong>
                {o.seen}
                <span> / {o.total}</span>
              </strong>
              <span className="fine-print">questions explored</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
