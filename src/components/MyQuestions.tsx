"use client";
import { useEffect, useState } from "react";
import type { Revision } from "@/domain/types";
import { api, type Dashboard } from "./client";

type SharedQuestion = {
  id: string;
  author: string;
  sharedAt: string;
  question: Revision;
};
const blank = {
  category_slug: "",
  objective_code: "",
  prompt: "",
  choices: ["", "", "", ""],
  correct_choice_id: "a",
  explanation_technical: "",
  explanation_eli5: "",
  difficulty: "intermediate" as const,
  tags: "",
};
export default function MyQuestions({
  dashboard,
  refresh,
}: {
  dashboard: Dashboard;
  refresh: () => Promise<Dashboard>;
}) {
  const [personal, setPersonal] = useState<Revision[]>([]),
    [community, setCommunity] = useState<SharedQuestion[]>([]),
    [form, setForm] = useState(blank),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const [mine, shared] = await Promise.all([
      api<Revision[]>("personal/questions"),
      api<SharedQuestion[]>("community/questions"),
    ]);
    setPersonal(mine);
    setCommunity(shared);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
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
          <p className="subtle">
            Personal questions stay in your own bank. Share a copy when you want
            other learners to reuse it.
          </p>
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
      <section className="section-block import-panel">
        <div className="section-heading">
          <div>
            <h2>Add a personal question</h2>
            <p className="subtle">
              It becomes available in your practice sessions immediately.
            </p>
          </div>
          <span className="mono subtle">{personal.length} PERSONAL</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await api("personal/questions", {
                ...form,
                choices: form.choices.map((text, index) => ({
                  id: ["a", "b", "c", "d"][index],
                  text,
                })),
                tags: form.tags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              });
              setForm({ ...blank, category_slug: form.category_slug });
              await load();
              await refresh();
              setMessage("Personal question added to your practice pool.");
            });
          }}
        >
          <div className="form-row">
            <label>
              Category
              <select
                required
                value={form.category_slug}
                onChange={(event) =>
                  setForm({ ...form, category_slug: event.target.value })
                }
              >
                <option value="" disabled>
                  Select a category
                </option>
                {dashboard.release?.categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Security+ objective
              <input
                required
                maxLength={80}
                value={form.objective_code}
                placeholder="SY0-701-2.1"
                onChange={(event) =>
                  setForm({ ...form, objective_code: event.target.value })
                }
              />
            </label>
            <label>
              Difficulty
              <select
                value={form.difficulty}
                onChange={(event) =>
                  setForm({
                    ...form,
                    difficulty: event.target.value as typeof form.difficulty,
                  })
                }
              >
                <option value="basic">Basic</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
          </div>
          <label>
            Question
            <textarea
              required
              value={form.prompt}
              onChange={(event) =>
                setForm({ ...form, prompt: event.target.value })
              }
            />
          </label>
          <div className="form-row">
            {form.choices.map((choice, index) => (
              <label key={index}>
                Option {String.fromCharCode(65 + index)}
                <input
                  required
                  value={choice}
                  onChange={(event) => {
                    const choices = [...form.choices];
                    choices[index] = event.target.value;
                    setForm({ ...form, choices });
                  }}
                />
              </label>
            ))}
          </div>
          <div className="form-row">
            <label>
              Correct option
              <select
                value={form.correct_choice_id}
                onChange={(event) =>
                  setForm({ ...form, correct_choice_id: event.target.value })
                }
              >
                {["a", "b", "c", "d"].map((id, index) => (
                  <option key={id} value={id}>
                    Option {String.fromCharCode(65 + index)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tags, comma-separated
              <input
                value={form.tags}
                onChange={(event) =>
                  setForm({ ...form, tags: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            Technical explanation
            <textarea
              required
              value={form.explanation_technical}
              onChange={(event) =>
                setForm({ ...form, explanation_technical: event.target.value })
              }
            />
          </label>
          <label>
            ELI5 explanation
            <textarea
              required
              value={form.explanation_eli5}
              onChange={(event) =>
                setForm({ ...form, explanation_eli5: event.target.value })
              }
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !dashboard.release}
          >
            {busy ? "Saving…" : "Add to my question bank"} →
          </button>
        </form>
      </section>
      <section className="section-block">
        <h2>My questions</h2>
        {personal.length ? (
          personal
            .slice()
            .reverse()
            .map((question) => (
              <article className="report-row" key={question.external_id}>
                <strong>{question.prompt}</strong>
                <span className="fine-print">
                  {question.category_slug} · {question.objective_code}
                </span>
                <div className="action-strip">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(
                          `personal/questions/${question.external_id}/share`,
                          {},
                        );
                        await load();
                        setMessage("Shared with the community library.");
                      })
                    }
                  >
                    Share
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(
                          `personal/questions/${question.external_id}/delete`,
                          {},
                        );
                        await load();
                        await refresh();
                        setMessage("Personal question deleted.");
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
        ) : (
          <p className="fine-print">No personal questions yet.</p>
        )}
      </section>
      <section className="section-block">
        <h2>Community library</h2>
        <p className="subtle">
          Copies remain independent, so later edits or deletions never affect
          another learner’s bank.
        </p>
        {community.length ? (
          community.map((entry) => (
            <article className="report-row" key={entry.id}>
              <strong>{entry.question.prompt}</strong>
              <span className="fine-print">
                Shared by {entry.author} · {entry.question.category_slug}
              </span>
              <p>{entry.question.explanation_technical}</p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api(`community/questions/${entry.id}/copy`, {});
                    await load();
                    await refresh();
                    setMessage("Copied into your personal question bank.");
                  })
                }
              >
                Copy to my bank
              </button>
            </article>
          ))
        ) : (
          <p className="fine-print">No shared questions yet.</p>
        )}
      </section>
    </>
  );
}
