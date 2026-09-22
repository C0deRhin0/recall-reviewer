"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ContentStyle,
  Disclosure,
  Mode,
  PublicAttempt,
  Timing,
} from "@/domain/types";
import { poolCountKey } from "@/domain/types";
import { api, modeNames, type Dashboard } from "./client";
import Modal from "./Modal";
import StudyIcon from "./StudyIcon";
export default function Practice({
  dashboard,
  attemptId,
  preset,
  onAttempt,
  refresh,
  onExit,
}: {
  dashboard: Dashboard;
  attemptId: string;
  preset: { mode: string; category: string };
  onAttempt: (id: string) => void;
  refresh: () => Promise<Dashboard>;
  onExit: () => void;
}) {
  const [attempt, setAttempt] = useState<PublicAttempt | null>(null),
    [index, setIndex] = useState(0),
    [selected, setSelected] = useState(""),
    [guessed, setGuessed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>(preset.mode as Mode),
    [category, setCategory] = useState(preset.category),
    [contentStyle, setContentStyle] = useState<ContentStyle>("mixed"),
    [count, setCount] = useState("10"),
    [disclosure, setDisclosure] = useState<Disclosure>(
      dashboard.profile.disclosure,
    ),
    [minutes, setMinutes] = useState(30),
    [timing, setTiming] = useState<Timing>(
      preset.mode === "mock" ? "overall" : "none",
    ),
    [perQuestionSeconds, setPerQuestionSeconds] = useState(60),
    [unseen, setUnseen] = useState(false),
    [remaining, setRemaining] = useState(""),
    [confirmFinish, setConfirmFinish] = useState(false),
    [report, setReport] = useState(false),
    [reportText, setReportText] = useState("");
  const [lens, setLens] = useState("all"),
    [explanationView, setExplanationView] = useState("technical"),
    [mapOpen, setMapOpen] = useState(true);
  const promptRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setMapOpen(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const finishing = useRef(false),
    requestId = useRef<string>("");
  useEffect(() => {
    setMode(preset.mode as Mode);
    setCategory(preset.category);
    setTiming(preset.mode === "mock" ? "overall" : "none");
  }, [preset.mode, preset.category]);
  const pool =
    dashboard.poolCounts[poolCountKey(mode, category, contentStyle)] || 0;
  function normalizeCount() {
    const parsed = Number(count);
    const limit = Math.max(1, Math.min(pool, 100));
    setCount(
      String(
        Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, limit)) : 1,
      ),
    );
  }
  useEffect(() => {
    const parsed = Number(count);
    if (parsed > Math.max(pool, 1)) setCount(String(Math.max(pool, 1)));
  }, [pool]);
  useEffect(() => {
    finishing.current = false;
    setLens("all");
    if (!attemptId) {
      setAttempt(null);
      return;
    }
    let live = true;
    setBusy(true);
    api<PublicAttempt>("attempts/" + attemptId)
      .then((a) => {
        if (live) {
          setAttempt(a);
          setIndex(a.completedAt ? 0 : a.cursor);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [attemptId]);
  const item = attempt?.items[index];
  useEffect(() => {
    setSelected(item?.selectedId || "");
    setGuessed(item?.guessed || false);
    setReport(false);
    setReportText("");
    setMessage("");
    setExplanationView("technical");
  }, [
    attempt?.id,
    attempt?.completedAt,
    index,
    item?.selectedId,
    item?.guessed,
  ]);
  useEffect(() => {
    const deadline = attempt?.deadline || attempt?.questionDeadline;
    if (!deadline || attempt.completedAt) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((Date.parse(deadline) - Date.now()) / 1000),
      );
      setRemaining(
        `${Math.floor(seconds / 60)
          .toString()
          .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`,
      );
      if (seconds === 0 && !finishing.current) {
        finishing.current = true;
        api<PublicAttempt>(
          `attempts/${attempt.id}/${attempt.timing === "per-question" ? "timer" : "finish"}`,
          {},
        )
          .then((a) => {
            setAttempt(a);
            setIndex(a.completedAt ? 0 : a.cursor);
            return refresh();
          })
          .catch((e) => {
            setError(e.message);
            finishing.current = false;
          });
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [
    attempt?.id,
    attempt?.deadline,
    attempt?.questionDeadline,
    attempt?.completedAt,
    attempt?.timing,
  ]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (
        !busy &&
        !confirmFinish &&
        !report &&
        item &&
        attempt &&
        !attempt.completedAt &&
        !(item.selectedId && attempt.mode !== "mock") &&
        /^[1-4]$/.test(e.key)
      ) {
        setSelected(item.choices[Number(e.key) - 1].id);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [item, attempt, busy, confirmFinish, report]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const saved = !!item?.selectedId;
  const locked = !!attempt?.completedAt || (saved && attempt?.mode !== "mock");
  const result = attempt?.completedAt;
  const dirty =
    !locked &&
    !!selected &&
    (selected !== item?.selectedId || guessed !== item?.guessed);
  const blocked = busy || dirty;
  function navigate(next: number) {
    setIndex(next);
    requestAnimationFrame(() => {
      const prompt = promptRef.current;
      if (window.matchMedia("(max-width: 760px)").matches) {
        prompt?.closest(".study-question")?.scrollIntoView({ block: "start" });
      } else window.scrollTo(0, 0);
      prompt?.focus({ preventScroll: true });
    });
  }
  const errorBox = error && (
    <div className="notice error" role="alert">
      {error}
      <button className="text-button" onClick={() => setError("")}>
        Dismiss
      </button>
    </div>
  );
  if (!attempt)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Practice</h1>
          </div>
          <span className="mono subtle">
            {dashboard.release?.label || "NO ACTIVE RELEASE"}
          </span>
        </div>
        {errorBox}
        <div className="setup-grid">
          <form
            className="setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                if (!requestId.current) requestId.current = crypto.randomUUID();
                const a = await api<PublicAttempt>("attempts", {
                  mode,
                  category,
                  contentStyle,
                  count: Number(count),
                  disclosure,
                  minutes,
                  timing: mode === "mock" ? "overall" : timing,
                  perQuestionSeconds,
                  preferUnseen: unseen,
                  requestId: requestId.current,
                });
                setAttempt(a);
                setIndex(0);
                onAttempt(a.id);
                window.scrollTo(0, 0);
                requestId.current = "";
              });
            }}
          >
            <div className="field-section">
              <span className="eyebrow">Mode</span>
              <div className="mode-grid">
                {(
                  [
                    "mixed",
                    "category",
                    "mistakes",
                    "bookmarks",
                    "due",
                    "mock",
                    "weighted",
                  ] as Mode[]
                ).map((m) => (
                  <button
                    type="button"
                    key={m}
                    className={"mode-option " + (mode === m ? "chosen" : "")}
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m);
                      setTiming(m === "mock" ? "overall" : "none");
                      setError("");
                      if (m !== "category") setCategory("");
                      if (m === "category" && !category)
                        setCategory(
                          dashboard.release?.categories[0]?.slug || "",
                        );
                    }}
                  >
                    <strong>{modeNames[m]}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="field-section">
              <span className="eyebrow">Question style</span>
              <label>
                Include
                <select
                  value={contentStyle}
                  onChange={(e) =>
                    setContentStyle(e.target.value as ContentStyle)
                  }
                >
                  <option value="mixed">Mixed</option>
                  <option value="scenario">Scenarios only</option>
                  <option value="definition">Definitions only</option>
                </select>
              </label>
            </div>
            <div className="field-section">
              <span className="eyebrow">Session</span>
              <div className="form-row">
                {mode === "category" && (
                  <label>
                    Category
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select a category
                      </option>
                      {dashboard.release?.categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Number of questions
                  <input
                    aria-describedby="pool-help"
                    type="number"
                    value={count}
                    min={1}
                    max={Math.min(pool || 100, 100)}
                    onChange={(e) => setCount(e.target.value)}
                    onBlur={normalizeCount}
                    required
                  />
                  <span id="pool-help" className="fine-print">
                    {`${pool} available in this set`}
                  </span>
                </label>
                <label>
                  Timed test
                  <select
                    value={mode === "mock" ? "overall" : timing}
                    disabled={mode === "mock"}
                    onChange={(e) => setTiming(e.target.value as Timing)}
                  >
                    <option value="none">No timer</option>
                    <option value="per-question">Time per question</option>
                    <option value="overall">Overall test time</option>
                  </select>
                </label>
                {(timing === "overall" || mode === "mock") && (
                  <label>
                    Overall time, minutes
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                  </label>
                )}
                {timing === "per-question" && mode !== "mock" && (
                  <label>
                    Time per question, seconds
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={perQuestionSeconds}
                      onChange={(e) =>
                        setPerQuestionSeconds(Number(e.target.value))
                      }
                    />
                  </label>
                )}
              </div>
              {mode !== "weighted" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={unseen}
                    onChange={(e) => setUnseen(e.target.checked)}
                  />
                  Prefer unseen
                </label>
              )}
            </div>
            <div className="field-section">
              <span className="eyebrow">Feedback</span>
              <label>
                Answer feedback
                <select
                  value={
                    mode === "mock" || timing !== "none"
                      ? "after-session"
                      : disclosure
                  }
                  disabled={mode === "mock" || timing !== "none"}
                  onChange={(e) => setDisclosure(e.target.value as Disclosure)}
                >
                  <option value="on-demand">On demand</option>
                  <option value="automatic">After each answer</option>
                  <option value="after-session">After session</option>
                </select>
              </label>
              <p className="fine-print">
                {mode === "mock" || timing !== "none"
                  ? "Timed sessions show answers and reasoning only in the final review."
                  : "Answers lock when submitted."}
              </p>
            </div>
            <button
              className="button primary wide"
              disabled={busy || !pool || !dashboard.release}
            >
              {busy
                ? "Preparing session…"
                : pool === 0
                  ? "No matching questions yet"
                  : "Start this session"}{" "}
              <span>→</span>
            </button>
          </form>
        </div>
      </>
    );
  if (!item) return <div role="status">Loading your question…</div>;
  const total = attempt.items.length;
  const answered = attempt.items.filter((q) => q.selectedId).length;
  const needsReview = (q: PublicAttempt["items"][number]) =>
    q.flagged || q.guessed || q.correct === false;
  const matches = (q: PublicAttempt["items"][number]) =>
    lens === "all" ||
    (lens === "unanswered" && !q.selectedId) ||
    (lens === "uncertain" && q.guessed) ||
    (lens === "flagged" && q.flagged) ||
    (lens === "missed" && q.correct === false) ||
    (lens === "review" && needsReview(q));
  const visibleItems = attempt.items
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => matches(q));
  const reviewCount = attempt.items.filter(needsReview).length;
  const bookmarked = dashboard.bookmarks.includes(item.question.external_id);
  const correctChoice = item.choices.find(
    (c) => c.id === item.solution?.correct_choice_id,
  );
  const feedbackChoice = item.selectedId || correctChoice?.id;
  const categoryName =
    dashboard.release?.categories.find(
      (c) => c.slug === item.question.category_slug,
    )?.name || item.question.category_slug;
  return (
    <>
      <header className="session-header">
        <button
          className="session-back"
          disabled={blocked}
          onClick={() =>
            run(async () => {
              await refresh();
              onExit();
            })
          }
        >
          <StudyIcon name="back" /> <span>Study desk</span>
        </button>
        <span className="session-title-label">
          {modeNames[attempt.mode]}
          <span>{attempt.releaseLabel}</span>
        </span>
        <div className="session-header-actions">
          {(attempt.deadline || attempt.questionDeadline) && !result && (
            <span className="session-clock" aria-label="Time remaining">
              <StudyIcon name="time" />
              {remaining}
            </span>
          )}
          {result ? (
            <button
              className="button primary"
              onClick={() => {
                setAttempt(null);
                onAttempt("");
                refresh().catch((e) => setError(e.message));
              }}
            >
              New session <StudyIcon name="next" />
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={blocked}
              onClick={() => setConfirmFinish(true)}
            >
              Finish session
            </button>
          )}
        </div>
      </header>
      {errorBox}
      {attempt.notice && (
        <div className="notice session-notice">{attempt.notice}</div>
      )}
      <div className="study-workspace">
        <aside className="session-rail" aria-label="Session tools">
          {result && (
            <section className="session-score" aria-label="Session results">
              <svg
                viewBox="0 0 80 80"
                className="score-ring"
                aria-hidden="true"
              >
                <circle cx="40" cy="40" r="33" className="score-track" />
                <circle
                  cx="40"
                  cy="40"
                  r="33"
                  className="score-fill"
                  pathLength="100"
                  strokeDasharray={`${((attempt.score || 0) / total) * 100} 100`}
                  transform="rotate(-90 40 40)"
                />
                <text x="40" y="45" textAnchor="middle">
                  {Math.round(((attempt.score || 0) / total) * 100)}%
                </text>
              </svg>
              <div>
                <h2>Results</h2>
                <strong>
                  {attempt.score} / {total} correct
                </strong>
                <span>{total - answered} unanswered</span>
              </div>
            </section>
          )}
          <div className="rail-heading">Question tools</div>
          <div className="rail-tools">
            <button
              className="rail-action"
              aria-pressed={bookmarked}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("bookmarks", {
                    attempt: attempt.id,
                    index,
                    saved: !bookmarked,
                  });
                  await refresh();
                })
              }
            >
              <StudyIcon name="bookmark" />
              <span>{bookmarked ? "Saved" : "Save"}</span>
            </button>
            <button
              className="rail-action"
              aria-pressed={item.flagged}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setAttempt(
                    await api<PublicAttempt>(`attempts/${attempt.id}/flag`, {
                      index,
                      flagged: !item.flagged,
                    }),
                  );
                })
              }
            >
              <StudyIcon name="flag" />
              <span>{item.flagged ? "Flagged" : "Flag"}</span>
            </button>
            <button
              className="rail-action"
              aria-pressed={lens === "review"}
              onClick={() => {
                setLens(lens === "review" ? "all" : "review");
                setMapOpen(true);
              }}
            >
              <StudyIcon name="review" />
              <span>Review</span>
              <span className="rail-count">{reviewCount}</span>
            </button>
          </div>
          <details
            className="session-map-panel"
            open={mapOpen}
            onToggle={(e) => setMapOpen(e.currentTarget.open)}
          >
            <summary>
              <span>Session map</span>
              <span className="mono">
                {answered}/{total}
              </span>
              <StudyIcon name="chevron" />
            </summary>
            <div className="map-content">
              <progress
                className="session-progress"
                value={answered}
                max={total}
                aria-label="Questions answered"
              />
              <label className="map-filter">
                <span className="sr-only">Show questions</span>
                <select value={lens} onChange={(e) => setLens(e.target.value)}>
                  <option value="all">All questions</option>
                  <option value="unanswered">Unanswered</option>
                  <option value="uncertain">Uncertain</option>
                  <option value="flagged">Flagged</option>
                  <option value="review">Needs review</option>
                  {result && <option value="missed">Incorrect</option>}
                </select>
                <span>{visibleItems.length}</span>
              </label>
              <nav className="session-map" aria-label="Question navigation">
                {visibleItems.map(({ q, i }) => (
                  <button
                    key={i}
                    aria-label={`Question ${i + 1}, ${q.correct === true ? "correct" : q.correct === false ? "incorrect" : q.selectedId ? "answered" : "unanswered"}${q.guessed ? ", uncertain" : ""}${q.flagged ? ", flagged" : ""}`}
                    aria-current={i === index ? "step" : undefined}
                    className={`${q.selectedId ? "answered" : ""} ${q.correct === true ? "right" : q.correct === false ? "wrong" : ""}`}
                    disabled={blocked}
                    onClick={() => navigate(i)}
                  >
                    <span className="map-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {q.flagged && (
                      <span className="map-flag">
                        <StudyIcon name="flag" />
                      </span>
                    )}
                    <span className="map-state">
                      {q.guessed ? (
                        <StudyIcon name="uncertain" />
                      ) : q.correct === false ? (
                        <StudyIcon name="close" />
                      ) : q.selectedId ? (
                        <StudyIcon name="check" />
                      ) : (
                        <span className="map-empty-dot" />
                      )}
                    </span>
                  </button>
                ))}
              </nav>
              {!visibleItems.length && (
                <p className="map-empty">No matching questions.</p>
              )}
              {lens !== "all" && (
                <button
                  className="rail-jump"
                  disabled={
                    blocked || !visibleItems.some(({ i }) => i !== index)
                  }
                  onClick={() => {
                    const next =
                      visibleItems.find(({ i }) => i > index) ||
                      visibleItems.find(({ i }) => i !== index);
                    if (next) navigate(next.i);
                  }}
                >
                  Next match <StudyIcon name="next" />
                </button>
              )}
              <div className="map-legend">
                <span>
                  <StudyIcon name="check" />
                  Answered
                </span>
                <span>
                  <StudyIcon name="uncertain" />
                  Uncertain
                </span>
                <span>
                  <StudyIcon name="flag" />
                  Flagged
                </span>
              </div>
            </div>
          </details>
          <details className="question-details">
            <summary>
              Question details <StudyIcon name="chevron" />
            </summary>
            <dl>
              <div>
                <dt>Objective</dt>
                <dd>{item.question.objective_code}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{item.question.revision}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>{item.question.difficulty}</dd>
              </div>
            </dl>
            <button className="rail-action" onClick={() => setReport(true)}>
              <StudyIcon name="report" />
              Report issue
            </button>
          </details>
          {!locked && (
            <div className="shortcut-hint">
              <kbd>1</kbd>–<kbd>4</kbd>
              <span>Select an answer</span>
            </div>
          )}
        </aside>
        <section className="study-question" aria-label="Current question">
          <nav
            className="question-toolbar"
            aria-label="Previous and next questions"
          >
            <span className="question-position">
              Question <strong>{String(index + 1).padStart(2, "0")}</strong>
              <span>/ {String(total).padStart(2, "0")}</span>
            </span>
            <div className="question-step-buttons">
              <button
                className="step-button"
                aria-label="Previous question"
                title="Previous question"
                disabled={
                  index === 0 || blocked || attempt.timing === "per-question"
                }
                onClick={() => navigate(index - 1)}
              >
                <StudyIcon name="back" />
                <span>Previous</span>
              </button>
              <button
                className="step-button"
                aria-label="Next question"
                title="Next question"
                disabled={
                  index === total - 1 ||
                  blocked ||
                  attempt.timing === "per-question"
                }
                onClick={() => navigate(index + 1)}
              >
                <span>Next</span>
                <StudyIcon name="next" />
              </button>
            </div>
          </nav>
          <div className="question-reading">
            <span className="question-category">{categoryName}</span>
            <h1 className="question-prompt" ref={promptRef} tabIndex={-1}>
              {item.question.prompt}
            </h1>
            <fieldset className="choices">
              <legend className="sr-only">Choose one answer</legend>
              {item.choices.map((choice, i) => {
                const correct = item.solution?.correct_choice_id === choice.id;
                const wrong =
                  item.correct === false && item.selectedId === choice.id;
                const showFeedback = choice.id === feedbackChoice;
                return (
                  <div className="answer-block" key={choice.id}>
                    <label
                      className={`choice ${selected === choice.id ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "incorrect" : ""} ${locked ? "locked" : ""}`}
                    >
                      <input
                        type="radio"
                        name="answer"
                        value={choice.id}
                        aria-label={`${choice.text}${correct ? ", correct answer" : wrong ? ", your answer, incorrect" : ""}`}
                        checked={selected === choice.id}
                        disabled={locked || busy}
                        onChange={() => setSelected(choice.id)}
                        aria-describedby={
                          showFeedback && item.solution
                            ? "answer-reasoning"
                            : undefined
                        }
                      />
                      <span className="choice-letter">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="choice-text">{choice.text}</span>
                      {correct ? (
                        <span className="choice-state">
                          <StudyIcon name="check" />
                          <span>Correct</span>
                        </span>
                      ) : wrong ? (
                        <span className="choice-state">
                          <StudyIcon name="close" />
                          <span>Your answer</span>
                        </span>
                      ) : selected === choice.id ? (
                        <span className="choice-state">
                          <span>Selected</span>
                        </span>
                      ) : null}
                    </label>
                    {showFeedback && item.solution && (
                      <section
                        className="inline-reasoning"
                        id="answer-reasoning"
                        tabIndex={-1}
                        aria-label="Answer reasoning"
                      >
                        {item.correct !== true && (
                          <div className="correct-answer-reference">
                            <StudyIcon name="check" />
                            <span>
                              Correct answer:{" "}
                              <strong>{correctChoice?.text}</strong>
                            </span>
                          </div>
                        )}
                        <div
                          className="reasoning-switch"
                          role="group"
                          aria-label="Explanation style"
                        >
                          <button
                            aria-pressed={explanationView === "technical"}
                            onClick={() => setExplanationView("technical")}
                          >
                            Technical
                          </button>
                          <button
                            aria-pressed={explanationView === "eli5"}
                            onClick={() => setExplanationView("eli5")}
                          >
                            ELI5
                          </button>
                        </div>
                        <h2 className="sr-only">
                          {explanationView === "technical"
                            ? "Technical explanation"
                            : "ELI5 explanation"}
                        </h2>
                        <p>
                          {explanationView === "technical"
                            ? item.solution.explanation_technical
                            : item.solution.explanation_eli5}
                        </p>
                        <details className="source-note">
                          <summary>Source</summary>
                          <p>{item.question.source_reference}</p>
                        </details>
                      </section>
                    )}
                    {showFeedback &&
                      saved &&
                      !item.solution &&
                      attempt.disclosure === "on-demand" && (
                        <div className="inline-reveal">
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                setAttempt(
                                  await api<PublicAttempt>(
                                    `attempts/${attempt.id}/reveal`,
                                    { index },
                                  ),
                                );
                                requestAnimationFrame(() =>
                                  document
                                    .getElementById("answer-reasoning")
                                    ?.focus({ preventScroll: true }),
                                );
                              })
                            }
                          >
                            <StudyIcon name="eye" />
                            Reveal reasoning
                          </button>
                        </div>
                      )}
                  </div>
                );
              })}
            </fieldset>
          </div>
          <footer className="answer-dock">
            <div className="answer-dock-status">
              {!result && !locked ? (
                <label className="confidence-control">
                  <input
                    type="checkbox"
                    checked={guessed}
                    disabled={busy}
                    onChange={(e) => setGuessed(e.target.checked)}
                  />
                  <StudyIcon name="uncertain" />
                  Uncertain
                </label>
              ) : (
                <span className="submitted-label">
                  <StudyIcon name="check" />
                  {result ? "Reviewing" : "Submitted"}
                  {item.guessed && <span> · Uncertain</span>}
                </span>
              )}
              <span role="status" className="dock-message">
                {dirty ? "Submit to continue" : message}
              </span>
            </div>
            {!result && !locked && (!saved || dirty) ? (
              <button
                className="button primary"
                disabled={!selected || busy}
                onClick={() =>
                  run(async () => {
                    const a = await api<PublicAttempt>(
                      `attempts/${attempt.id}/answer`,
                      { index, choice: selected, guessed },
                    );
                    setAttempt(a);
                    if (a.timing === "per-question" && !a.completedAt)
                      setIndex(a.cursor);
                    setMessage(a.completedAt ? "Time is up." : "");
                  })
                }
              >
                {busy ? "Saving…" : saved ? "Save change" : "Submit answer"}
                <StudyIcon name="next" />
              </button>
            ) : index < total - 1 ? (
              <button
                className="button primary"
                disabled={blocked}
                onClick={() => navigate(index + 1)}
                aria-label="Continue to next question"
              >
                Continue <StudyIcon name="next" />
              </button>
            ) : !result ? (
              <button
                className="button primary"
                disabled={blocked}
                onClick={() => setConfirmFinish(true)}
              >
                Finish & review <StudyIcon name="check" />
              </button>
            ) : (
              <button className="button secondary" onClick={onExit}>
                Study desk <StudyIcon name="next" />
              </button>
            )}
          </footer>
        </section>
      </div>
      {report && (
        <Modal titleId="report-title" onClose={() => setReport(false)}>
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("reports", {
                  attempt: attempt.id,
                  index,
                  message: reportText,
                });
                setReport(false);
                setReportText("");
                setMessage("Issue reported.");
              });
            }}
          >
            <h2 id="report-title">Report issue</h2>
            <label>
              What needs correcting?
              <textarea
                autoFocus
                minLength={5}
                maxLength={2000}
                required
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
              />
            </label>
            <div className="action-strip">
              <button
                type="button"
                className="button secondary"
                onClick={() => setReport(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                Send report
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmFinish && (
        <Modal titleId="finish-title" onClose={() => setConfirmFinish(false)}>
          <section className="modal">
            <p className="eyebrow">FINAL CHECK</p>
            <h2 id="finish-title">Finish this session?</h2>
            <p>
              {attempt.items.filter((i) => !i.selectedId).length} questions
              unanswered.{" "}
              {attempt.mode === "mock"
                ? "Unanswered questions count as incorrect."
                : "Unanswered questions will be shown separately."}{" "}
              Your saved answers will be locked.
            </p>
            <div className="action-strip">
              <button
                className="button secondary"
                autoFocus
                onClick={() => setConfirmFinish(false)}
              >
                Keep practicing
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setAttempt(
                      await api<PublicAttempt>(
                        `attempts/${attempt.id}/finish`,
                        {},
                      ),
                    );
                    setConfirmFinish(false);
                    await refresh();
                    window.scrollTo(0, 0);
                  })
                }
              >
                Finish & review
              </button>
            </div>
          </section>
        </Modal>
      )}
    </>
  );
}
