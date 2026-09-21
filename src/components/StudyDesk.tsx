"use client";
import { useRef, useState } from "react";
import type { Disclosure, PublicAttempt } from "@/domain/types";
import { api, date, modeNames, type Dashboard } from "./client";

export default function StudyDesk({
  data,
  open,
  configure,
  progress,
  history,
}: {
  data: Dashboard;
  open: (id: string) => void;
  configure: (mode?: string, category?: string) => void;
  progress: () => void;
  history: () => void;
}) {
  const [category, setCategory] = useState(""),
    [count, setCount] = useState("5"),
    [disclosure, setDisclosure] = useState<Disclosure>(data.profile.disclosure),
    [unseen, setUnseen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const available = category
    ? data.stats.categories.find((c) => c.slug === category)?.count || 0
    : data.release?.count || 0;
  const limit = Math.min(available, 100),
    requested = Number(count),
    size =
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, limit)
        : 0;
  const unfinished = data.attempts.filter((a) => !a.completedAt),
    recent = data.attempts.filter((a) => a.completedAt).slice(0, 4);
  async function start() {
    if (busy || !size) return;
    setBusy(true);
    setError("");
    const settings = {
      mode: category ? "category" : "mixed",
      category,
      contentStyle: "mixed",
      count: size,
      disclosure,
      minutes: 30,
      preferUnseen: unseen,
    };
    const signature = JSON.stringify(settings);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await api<PublicAttempt>("attempts", {
        ...settings,
        requestId: pending.current!.id,
      });
      open(result.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function normalizeCount() {
    const parsed = Number(count);
    setCount(
      String(
        Number.isFinite(parsed)
          ? Math.max(1, Math.min(parsed, Math.max(limit, 1)))
          : 1,
      ),
    );
  }
  return (
    <div className="study-desk">
      <div className="page-heading desk-heading">
        <h1>Study desk</h1>
        <div className="action-strip">
          <button className="button secondary" onClick={() => configure()}>
            Customize
          </button>
          <button
            className="button primary"
            type="submit"
            form="quick-practice"
            disabled={busy || !size}
          >
            {busy ? "Starting…" : "Start practice"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {unfinished.length > 0 && (
        <section
          className="desk-section continue-section"
          aria-labelledby="continue-heading"
        >
          <div className="section-heading">
            <h2 id="continue-heading">Continue</h2>
            <span className="quiet-count">{unfinished.length} active</span>
          </div>
          {unfinished.map((a) => (
            <button
              key={a.id}
              className="continue-row"
              onClick={() => open(a.id)}
            >
              <span className="session-title">
                {modeNames[a.mode]}
                <span>
                  {a.answered}/{a.total} answered
                </span>
              </span>
              <progress
                aria-label={`${modeNames[a.mode]} progress`}
                value={a.answered}
                max={a.total}
              />
              <span className="continue-action">
                Resume <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </section>
      )}
      <section
        className="desk-section quick-session"
        aria-labelledby="session-heading"
      >
        <div className="section-heading">
          <h2 id="session-heading">
            {unfinished.length ? "New session" : "Today’s session"}
          </h2>
          <span className="today-progress">
            <span>
              {data.streak.todayCount}/{data.profile.dailyTarget} today
            </span>
            <progress
              aria-label="Daily target"
              max={data.profile.dailyTarget}
              value={Math.min(data.streak.todayCount, data.profile.dailyTarget)}
            />
          </span>
        </div>
        <form
          id="quick-practice"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <div className="quick-controls">
            <label>
              Category
              <select
                value={category}
                disabled={busy}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {data.stats.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Questions
              <input
                type="number"
                min={1}
                max={Math.max(1, limit)}
                required
                value={count}
                disabled={!limit || busy}
                onChange={(e) => setCount(e.target.value)}
                onBlur={normalizeCount}
              />
            </label>
            <span className="pool-count">{available} available</span>
          </div>
          <details className="session-options">
            <summary>Options</summary>
            <div className="options-fields">
              <label>
                Answer feedback
                <select
                  disabled={busy}
                  value={disclosure}
                  onChange={(e) => setDisclosure(e.target.value as Disclosure)}
                >
                  <option value="on-demand">On demand</option>
                  <option value="automatic">After each answer</option>
                  <option value="after-session">After session</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={unseen}
                  disabled={busy}
                  onChange={(e) => setUnseen(e.target.checked)}
                />
                Prefer unseen
              </label>
            </div>
          </details>
        </form>
        {!available && (
          <p className="compact-empty">
            {data.release
              ? "No questions in this category."
              : "Publish a question bank to start."}
          </p>
        )}
        <div className="practice-shortcuts" aria-label="Other practice modes">
          <button onClick={() => configure("mistakes")}>
            Mistakes <span aria-hidden="true">↗</span>
          </button>
          <button onClick={() => configure("bookmarks")}>
            Saved <span>{data.bookmarks.length}</span>
          </button>
          <button onClick={() => configure("due")}>
            Due <span>{data.due}</span>
          </button>
          <button onClick={() => configure("mock")}>
            Timed mock <span aria-hidden="true">↗</span>
          </button>
        </div>
      </section>
      <section className="desk-section" aria-labelledby="progress-heading">
        <div className="section-heading">
          <h2 id="progress-heading">Progress</h2>
          <button className="text-button" onClick={progress}>
            View progress <span aria-hidden="true">↗</span>
          </button>
        </div>
        <dl className="inline-progress">
          <div>
            <dt>Streak</dt>
            <dd>
              {data.streak.current} <span>days</span>
            </dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>
              {data.stats.accuracy === null ? "—" : `${data.stats.accuracy}%`}
            </dd>
          </div>
          <div>
            <dt>Explored</dt>
            <dd>
              {data.stats.unique}
              <span>/{data.release?.count || 0}</span>
            </dd>
          </div>
        </dl>
      </section>
      <section className="desk-section" aria-labelledby="recent-heading">
        <div className="section-heading">
          <h2 id="recent-heading">Recent activity</h2>
          <button className="text-button" onClick={history}>
            View all <span aria-hidden="true">↗</span>
          </button>
        </div>
        {recent.length ? (
          <div className="recent-table">
            {recent.map((a) => (
              <button
                key={a.id}
                className="recent-row"
                onClick={() => open(a.id)}
              >
                <span>{modeNames[a.mode]}</span>
                <span className="recent-date">{date(a.startedAt)}</span>
                <span className="recent-score">
                  {a.score}/{a.total}
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="compact-empty">No completed sessions.</p>
        )}
      </section>
    </div>
  );
}
