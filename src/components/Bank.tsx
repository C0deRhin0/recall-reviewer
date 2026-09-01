"use client";
import { useEffect, useState } from "react";
import type { ImportPayload } from "@/domain/content";
import { api, date, download, type Dashboard } from "./client";
import Modal from "./Modal";
type BankData = {
  activeId: string | null;
  releases: {
    id: string;
    label: string;
    edition: string;
    count: number;
    status: string;
    createdAt: string;
    parentId: string | null;
  }[];
  audit: { at: string; actor: string; action: string; target: string }[];
  active: ImportPayload | null;
};
type Preview = {
  input: ImportPayload;
  mode: "merge" | "replace";
  parentId: string | null;
  changes: {
    id: string;
    kind: string;
    before: string;
    after: string;
    fields: string[];
  }[];
  unchanged: boolean;
  count: number;
};
export default function Bank({
  dashboard,
  refresh,
}: {
  dashboard: Dashboard;
  refresh: () => Promise<Dashboard>;
}) {
  const [bank, setBank] = useState<BankData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [raw, setRaw] = useState(""),
    [format, setFormat] = useState<"json" | "csv">("json"),
    [mode, setMode] = useState<"merge" | "replace">("merge"),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [activate, setActivate] = useState<string | null>(null),
    [reports, setReports] = useState<
      {
        id: string;
        questionId: string;
        revision: number;
        message: string;
        at: string;
      }[]
    >([]);
  async function load() {
    setBank(await api<BankData>("bank"));
    setReports(await api<typeof reports>("reports"));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
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
          <h1>Question bank</h1>
        </div>
        {bank?.active && (
          <button
            className="button secondary"
            onClick={() =>
              download(bank.active!.release_label + ".json", bank.active)
            }
          >
            Export active release ↗
          </button>
        )}
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
      {!dashboard.user.aal2 && !dashboard.user.demo && (
        <p className="notice">
          Verify your authenticator in Settings to access question management.
        </p>
      )}
      <div className="bank-summary">
        <div>
          <span className="eyebrow">ACTIVE RELEASE</span>
          <h2>{bank?.active?.release_label || "No release published"}</h2>
          <span className="subtle">
            {bank?.active?.questions.length || 0} questions ·{" "}
            {bank?.active?.edition || "Choose an edition when importing"}
          </span>
        </div>
        <div className="mono subtle">
          {bank?.releases.length || 0} SAVED VERSIONS
        </div>
      </div>
      <section className="section-block import-panel">
        <div className="section-heading">
          <div>
            <h2>Import questions</h2>
          </div>
          <button
            className="text-button"
            onClick={() =>
              download(
                "questions-template.csv",
                "external_id,exam_code,edition,category_slug,objective_code,prompt,option_a,option_b,option_c,option_d,correct_option,explanation_technical,explanation_eli5,difficulty,tags,source_reference,change_note\n",
              )
            }
          >
            CSV template ↓
          </button>
        </div>
        <details className="import-help">
          <summary>Import help</summary>
          <p>
            Use JSON for a new bank; CSV inherits the active bank’s categories.
          </p>
        </details>
        <div className="form-row">
          <label>
            Import format
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as "json" | "csv");
                setPreview(null);
              }}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <label>
            Import behavior
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as "merge" | "replace");
                setPreview(null);
              }}
            >
              <option value="merge">Merge by question ID</option>
              <option value="replace">Replace the release</option>
            </select>
          </label>
          <label>
            Choose a file
            <input
              type="file"
              accept=".json,.csv"
              onChange={(e) =>
                run(async () => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024)
                    throw new Error(
                      "File exceeds 2 MiB. Split it into smaller imports.",
                    );
                  if (!/\.(json|csv)$/i.test(file.name))
                    throw new Error("Choose a CSV or JSON file.");
                  setFormat(
                    file.name.toLowerCase().endsWith(".csv") ? "csv" : "json",
                  );
                  setRaw(await file.text());
                  setPreview(null);
                })
              }
            />
          </label>
        </div>
        <label>
          Question data
          <textarea
            className="code-input"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setPreview(null);
            }}
            spellCheck={false}
            placeholder={
              "Paste your question-bank JSON or CSV here.\n\nNothing is published until you review and activate a release."
            }
          />
        </label>
        <div className="import-actions">
          <div className="action-strip">
            <button
              className="button primary"
              disabled={busy || !raw.trim()}
              onClick={() =>
                run(async () => {
                  setPreview(
                    await api<Preview>("bank/preview", { raw, format, mode }),
                  );
                })
              }
            >
              {busy ? "Checking…" : "Validate & preview"} →
            </button>
            {bank?.active && (
              <button
                className="button secondary"
                onClick={() => {
                  const copy = {
                    ...bank.active!,
                    release_label: bank.active!.release_label + ".next",
                  };
                  setRaw(JSON.stringify(copy, null, 2));
                  setFormat("json");
                  setPreview(null);
                }}
              >
                Edit active release
              </button>
            )}
          </div>
          <span className="fine-print">
            2 MiB maximum · 1,000 questions per import · Exactly four options
          </span>
        </div>
        {mode === "replace" && (
          <p className="notice">
            Replacement retires questions omitted from the incoming file.
            Existing sessions keep their original revisions.
          </p>
        )}
        {preview && (
          <section className="import-preview">
            <div className="section-heading">
              <h3>
                {preview.unchanged
                  ? "No content changes."
                  : "Review the changes"}
              </h3>
              <span className="mono">{preview.count} QUESTIONS IN RESULT</span>
            </div>
            <div className="change-totals">
              {["added", "changed", "unchanged", "retired"].map((kind) => (
                <span key={kind}>
                  <strong>
                    {preview.changes.filter((c) => c.kind === kind).length}
                  </strong>{" "}
                  {kind}
                </span>
              ))}
            </div>
            <div className="change-list">
              {preview.changes.map((c) => (
                <details key={c.id}>
                  <summary>
                    <span className={"change-kind " + c.kind}>{c.kind}</span>
                    <span className="mono">{c.id}</span>
                    <span>{c.after || c.before}</span>
                  </summary>
                  <div>
                    {c.before && (
                      <p>
                        <strong>Before:</strong> {c.before}
                      </p>
                    )}
                    {c.after && (
                      <p>
                        <strong>After:</strong> {c.after}
                      </p>
                    )}
                    {c.fields.length > 0 && (
                      <p>Changed fields: {c.fields.join(", ")}</p>
                    )}
                    {(() => {
                      const q = preview.input.questions.find(
                        (q) => q.external_id === c.id,
                      );
                      return q ? (
                        <div className="preview-question">
                          <ol type="A">
                            {q.choices.map((choice) => (
                              <li key={choice.id}>
                                {choice.text}
                                {choice.id === q.correct_choice_id
                                  ? " · Correct answer"
                                  : ""}
                              </li>
                            ))}
                          </ol>
                          <p>
                            <strong>Technical:</strong>{" "}
                            {q.explanation_technical}
                          </p>
                          <p>
                            <strong>ELI5:</strong> {q.explanation_eli5}
                          </p>
                          <p className="fine-print">
                            {q.objective_code} · {q.source_reference}
                          </p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </details>
              ))}
            </div>
            {!preview.unchanged && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await api<{
                      id: string;
                      unchanged: boolean;
                    }>("bank/stage", {
                      input: preview.input,
                      mode: preview.mode,
                      parentId: preview.parentId,
                    });
                    await load();
                    setMessage(
                      result.unchanged
                        ? "The active release already contains this content."
                        : "Draft saved. Activate it below after reviewing.",
                    );
                    setPreview(null);
                  })
                }
              >
                Save reviewed draft →
              </button>
            )}
          </section>
        )}
      </section>
      <section className="section-block">
        <div className="section-heading">
          <h2>Release history</h2>
          <span className="fine-print">
            Activate an older release to roll back.
          </span>
        </div>
        {bank?.releases.length ? (
          <div className="release-list">
            {[...bank.releases].reverse().map((r) => (
              <div className="release-row" key={r.id}>
                <span
                  className={
                    "release-status " +
                    (r.id === bank.activeId ? "positive" : "")
                  }
                >
                  {r.id === bank.activeId ? "● ACTIVE" : r.status.toUpperCase()}
                </span>
                <div>
                  <strong>{r.label}</strong>
                  <span className="subtle">
                    {r.count} questions · {r.edition} · {date(r.createdAt)}
                  </span>
                </div>
                {r.id !== bank.activeId && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setActivate(r.id)}
                  >
                    {r.status === "draft"
                      ? "Publish release"
                      : "Restore release"}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No releases</h3>
            <p>
              Validate a JSON bank, review its questions, then save and publish
              it.
            </p>
          </div>
        )}
      </section>
      <section className="section-block">
        <h2>Reported questions</h2>
        <p className="subtle">
          Your issue reports retain the question ID and revision that need
          review.
        </p>
        {reports.length ? (
          reports.map((r) => (
            <div className="report-row" key={r.id}>
              <span className="mono">
                {r.questionId} · REV {r.revision}
              </span>
              <p>{r.message}</p>
              <span className="fine-print">{date(r.at)}</span>
            </div>
          ))
        ) : (
          <p className="fine-print">No issues reported in this account.</p>
        )}
      </section>
      {bank?.audit.length ? (
        <details className="audit-details">
          <summary>Publication activity</summary>
          {bank.audit.map((e, i) => (
            <p className="mono fine-print" key={i}>
              {new Date(e.at).toLocaleString()} · {e.action} ·{" "}
              {e.target.slice(0, 8)}
            </p>
          ))}
        </details>
      ) : null}
      {activate && (
        <Modal titleId="publish-title" onClose={() => setActivate(null)}>
          <section className="modal">
            <p className="eyebrow">RELEASE CONTROL</p>
            <h2 id="publish-title">Activate this release?</h2>
            <p>
              New practice sessions will use{" "}
              <strong>
                {bank?.releases.find((r) => r.id === activate)?.label}
              </strong>
              . Saved sessions and their scores retain their original content.
            </p>
            <div className="action-strip">
              <button
                className="button secondary"
                autoFocus
                onClick={() => setActivate(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("bank/activate", {
                      id: activate,
                      expectedActiveId: bank!.activeId,
                    });
                    setActivate(null);
                    await load();
                    await refresh();
                    setMessage(
                      "Release activated. New sessions will use this question bank.",
                    );
                  })
                }
              >
                Activate release
              </button>
            </div>
          </section>
        </Modal>
      )}
    </>
  );
}
