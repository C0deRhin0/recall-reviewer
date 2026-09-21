import { describe, it, expect } from "vitest";
import {
  bankSchema,
  parseImport,
  prepareRelease,
  exportRelease,
} from "../src/domain/content";
import {
  activeRelease,
  answer,
  availablePoolCounts,
  finishAttempt,
  publicAttempt,
  eligibleQuestions,
  shuffle,
  startAttempt,
  streak,
  summary,
  localDate,
} from "../src/domain/engine";
import { initialUser, poolCountKey, type Bank } from "../src/domain/types";
import sample from "../content/examples/sample-bank.json";
const initialBank = (): Bank => {
  const b: Bank = { activeId: null, releases: [], audit: [] };
  const r = prepareRelease(b, bankSchema.parse(sample), "replace").release;
  r.status = "published";
  b.activeId = r.id;
  b.releases.push(r);
  return b;
};
const setup = (
  disclosure: "automatic" | "on-demand" | "after-session" = "on-demand",
  mode: "mixed" | "mock" = "mixed",
) => {
  const bank = initialBank(),
    state = initialUser();
  const attempt = startAttempt(
    bank,
    state,
    {
      mode,
      category: "",
      count: 5,
      disclosure,
      minutes: 1,
      preferUnseen: false,
      requestId: crypto.randomUUID(),
    },
    new Date("2026-09-09T00:00:00Z"),
  );
  return { bank, state, attempt };
};
describe("question import and publication", () => {
  it("accepts the synthetic bank and exports losslessly", () => {
    const b = initialBank();
    expect(
      bankSchema.parse(exportRelease(activeRelease(b))).questions,
    ).toHaveLength(30);
  });
  it("rejects a missing explanation or a fifth choice", () => {
    const s = structuredClone(sample);
    s.questions[0].explanation_eli5 = "";
    expect(() => bankSchema.parse(s)).toThrow();
    s.questions[0].explanation_eli5 = "Why";
    s.questions[0].choices.push({ id: "fifth", text: "Fifth" });
    expect(() => bankSchema.parse(s)).toThrow();
  });
  it("rejects duplicate choice IDs and unknown correct answers", () => {
    const s = structuredClone(sample);
    s.questions[0].choices[1].id = s.questions[0].choices[0].id;
    expect(() => bankSchema.parse(s)).toThrow();
    s.questions[0].choices[1].id = "other";
    s.questions[0].correct_choice_id = "missing";
    expect(() => bankSchema.parse(s)).toThrow();
  });
  it("rejects duplicate question IDs, categories and prompts", () => {
    const s = structuredClone(sample);
    s.questions[1].external_id = s.questions[0].external_id;
    expect(() => bankSchema.parse(s)).toThrow();
  });
  it("detects an unchanged reimport and preserves revision numbers", () => {
    const b = initialBank();
    const r = prepareRelease(b, bankSchema.parse(sample), "merge");
    expect(r.unchanged).toBe(true);
    expect(r.release.questions.every((q) => q.revision === 1)).toBe(true);
  });
  it("revises a changed answer without altering original attempts", () => {
    const { bank, state, attempt } = setup();
    const original = attempt.items[0].question.correct_choice_id;
    const next = exportRelease(activeRelease(bank));
    next.release_label = "v7-edited";
    next.questions.find(
      (q) => q.external_id === attempt.items[0].question.external_id,
    )!.correct_choice_id = attempt.items[0].question.choices.find(
      (c) => c.id !== original,
    )!.id;
    const r = prepareRelease(bank, next, "merge").release;
    bank.releases.push(r);
    bank.activeId = r.id;
    expect(attempt.items[0].question.correct_choice_id).toBe(original);
    expect(
      activeRelease(bank).questions.find(
        (q) => q.external_id === attempt.items[0].question.external_id,
      )!.revision,
    ).toBe(2);
    expect(state.attempts[0].releaseId).not.toBe(bank.activeId);
  });
  it("retains omitted IDs for merge and retires them only for replacement", () => {
    const b = initialBank();
    const s = bankSchema.parse(sample);
    s.questions = s.questions.slice(0, 1);
    expect(prepareRelease(b, s, "merge").release.questions).toHaveLength(30);
    expect(
      prepareRelease(b, s, "replace").changes.filter(
        (c) => c.kind === "retired",
      ),
    ).toHaveLength(29);
  });
  it("refuses to merge editions", () => {
    const b = initialBank();
    const s = bankSchema.parse(sample);
    s.edition = "v8";
    expect(() => prepareRelease(b, s, "merge")).toThrow(
      "Editions cannot be merged",
    );
  });
  it("parses quoted CSV, commas and embedded newlines", () => {
    const raw =
      'external_id,category_slug,objective_code,prompt,option_a,option_b,option_c,option_d,correct_option,explanation_technical,explanation_eli5,source_reference\nq1,general-concepts,1,"A prompt, with a comma?",One,Two,Three,Four,A,"First line\nsecond line",Simple,Original';
    const q = parseImport(raw, "csv", {
      exam_code: sample.exam_code,
      edition: "v7",
      release_label: "csv",
      categories: sample.categories,
    }).questions[0];
    expect(q.choices).toHaveLength(4);
    expect(q.explanation_technical).toContain("\n");
    expect(q.correct_choice_id).toBe("a");
  });
  it("rejects oversized imports before parsing", () =>
    expect(() => parseImport("x".repeat(2 * 1024 * 1024 + 1), "json")).toThrow(
      "2 MiB",
    ));
});

describe("question content styles", () => {
  it("precalculates style and category availability for the initial workspace load", () => {
    const bank = initialBank();
    const release = activeRelease(bank);
    release.questions[0].tags.push("definition");
    const counts = availablePoolCounts(release, initialUser());
    expect(counts[poolCountKey("mixed", "", "mixed")]).toBe(30);
    expect(counts[poolCountKey("mixed", "", "definition")]).toBe(1);
    expect(counts[poolCountKey("mixed", "", "scenario")]).toBe(29);
    expect(
      counts[poolCountKey("category", release.categories[0].slug, "mixed")],
    ).toBeGreaterThan(0);
  });
  it("filters scenario and definition questions before session selection", () => {
    const bank = initialBank();
    const release = activeRelease(bank);
    release.questions[0].tags.push("definition");
    const state = initialUser();
    expect(
      eligibleQuestions(release, state, "mixed", "", "definition"),
    ).toHaveLength(1);
    expect(
      eligibleQuestions(release, state, "mixed", "", "scenario"),
    ).toHaveLength(release.questions.length - 1);
    const attempt = startAttempt(bank, state, {
      mode: "mixed",
      category: "",
      contentStyle: "definition",
      count: 1,
      disclosure: "on-demand",
      minutes: 30,
      preferUnseen: false,
      requestId: crypto.randomUUID(),
    });
    expect(attempt.contentStyle).toBe("definition");
    expect(attempt.items[0].question.tags).toContain("definition");
  });
});
describe("practice integrity", () => {
  it("shuffles without loss or duplicates", () => {
    const values = [1, 2, 3, 4];
    expect(shuffle(values, () => 0)).not.toEqual(values);
    expect(shuffle(values).sort()).toEqual(values);
    expect(values).toEqual([1, 2, 3, 4]);
  });
  it("selects unique questions and resumes an idempotent start", () => {
    const { state, attempt, bank } = setup();
    expect(new Set(attempt.items.map((i) => i.question.external_id)).size).toBe(
      5,
    );
    startAttempt(bank, state, {
      mode: "mixed",
      category: "",
      count: 5,
      disclosure: "automatic",
      minutes: 1,
      preferUnseen: false,
      requestId: attempt.id,
    });
    expect(state.attempts).toHaveLength(1);
  });
  it("does not disclose answers in the initial browser payload", () => {
    const { attempt } = setup();
    const serialized = JSON.stringify(publicAttempt(attempt));
    expect(serialized).not.toContain("correct_choice_id");
    expect(serialized).not.toContain("explanation_technical");
    expect(serialized).not.toContain("fingerprint");
    expect(publicAttempt(attempt).items.every((i) => i.correct === null)).toBe(
      true,
    );
  });
  it("grades by choice identity, locks practice answers and credits only once", () => {
    const { state, attempt } = setup();
    const item = attempt.items[0];
    answer(state, attempt.id, 0, item.question.correct_choice_id, false);
    answer(state, attempt.id, 0, item.question.correct_choice_id, false);
    expect(publicAttempt(attempt).items[0].correct).toBe(true);
    expect(publicAttempt(attempt).items[0].solution).toBeNull();
    expect(Object.values(state.activity).flat()).toHaveLength(1);
    expect(() =>
      answer(
        state,
        attempt.id,
        0,
        item.choices.find((c) => c.id !== item.selectedId)!.id,
        false,
      ),
    ).toThrow("locked");
  });
  it("automatically reveals when that policy was selected", () => {
    const { state, attempt } = setup("automatic");
    answer(state, attempt.id, 0, attempt.items[0].choices[0].id, false);
    expect(publicAttempt(attempt).items[0].solution).not.toBeNull();
  });
  it("withholds all feedback in a mock even if a reveal flag is tampered", () => {
    const { state, attempt } = setup("automatic", "mock");
    answer(
      state,
      attempt.id,
      0,
      attempt.items[0].question.correct_choice_id,
      false,
      new Date("2026-09-09T00:00:10Z"),
    );
    attempt.items[0].revealed = true;
    expect(publicAttempt(attempt).items[0].correct).toBeNull();
    expect(publicAttempt(attempt).items[0].solution).toBeNull();
    expect(state.activity).toEqual({});
  });
  it("allows a mock change, then uses the deadline and counts unanswered items", () => {
    const { state, attempt } = setup("automatic", "mock");
    answer(
      state,
      attempt.id,
      0,
      attempt.items[0].choices[1].id,
      false,
      new Date("2026-09-09T00:00:10Z"),
    );
    answer(
      state,
      attempt.id,
      0,
      attempt.items[0].question.correct_choice_id,
      false,
      new Date("2026-09-09T00:00:20Z"),
    );
    answer(
      state,
      attempt.id,
      1,
      attempt.items[1].question.correct_choice_id,
      false,
      new Date("2026-09-09T00:02:00Z"),
    );
    expect(attempt.completedAt).not.toBeNull();
    expect(attempt.items[1].selectedId).toBeNull();
    expect(publicAttempt(attempt).score).toBe(1);
  });
  it("finalization and review scheduling are idempotent", () => {
    const { state, attempt } = setup();
    answer(
      state,
      attempt.id,
      0,
      attempt.items[0].question.correct_choice_id,
      false,
    );
    finishAttempt(state, attempt);
    const before = structuredClone(state);
    finishAttempt(state, attempt);
    expect(state).toEqual(before);
    expect(Object.keys(state.reviews)).toHaveLength(1);
  });
  it("rejects oversized sets instead of silently duplicating", () => {
    const { bank, state } = setup();
    expect(() =>
      startAttempt(bank, state, {
        mode: "mixed",
        category: "",
        count: 100,
        disclosure: "on-demand",
        minutes: 1,
        preferUnseen: false,
        requestId: crypto.randomUUID(),
      }),
    ).toThrow("Only 30");
  });
  it("allocates weighted quotas exactly and reports shortages", () => {
    const b = initialBank(),
      s = initialUser();
    const a = startAttempt(b, s, {
      mode: "weighted",
      category: "",
      count: 10,
      disclosure: "on-demand",
      minutes: 1,
      preferUnseen: false,
      requestId: crypto.randomUUID(),
    });
    expect(a.items).toHaveLength(10);
    expect(
      a.items.filter((i) => i.question.category_slug === "operations"),
    ).toHaveLength(3);
    expect(() =>
      startAttempt(b, s, {
        mode: "weighted",
        category: "",
        count: 30,
        disclosure: "on-demand",
        minutes: 1,
        preferUnseen: false,
        requestId: crypto.randomUUID(),
      }),
    ).toThrow("needs");
  });
  it("separates first-attempt accuracy from repeated practice", () => {
    const { state, attempt, bank } = setup();
    answer(
      state,
      attempt.id,
      0,
      attempt.items[0].choices.find(
        (c) => c.id !== attempt.items[0].question.correct_choice_id,
      )!.id,
      false,
      new Date("2026-09-09T00:00:00Z"),
    );
    finishAttempt(state, attempt);
    const copy = structuredClone(attempt);
    copy.id = crypto.randomUUID();
    copy.items[0].selectedId = copy.items[0].question.correct_choice_id;
    copy.items[0].answeredAt = "2026-09-10T00:00:00Z";
    state.attempts.unshift(copy);
    const result = summary(state, activeRelease(bank));
    expect(result.firstAccuracy).toBe(0);
    expect(result.accuracy).toBe(50);
  });
});
describe("calendar streaks", () => {
  it("uses Manila midnight rather than UTC midnight", () => {
    expect(localDate(new Date("2026-09-09T16:00:00Z"), "Asia/Manila")).toBe(
      "2026-09-10",
    );
  });
  it("retains yesterday’s streak while today is still in progress", () => {
    const s = initialUser();
    s.activity = {
      "2026-09-08": ["1", "2", "3", "4", "5"],
      "2026-09-09": ["1"],
    };
    expect(streak(s, new Date("2026-09-09T02:00:00Z")).current).toBe(1);
  });
  it("breaks across a missed day and preserves the longest streak", () => {
    const s = initialUser();
    s.activity = {
      "2026-09-06": ["1", "2", "3", "4", "5"],
      "2026-09-07": ["1", "2", "3", "4", "5"],
    };
    const r = streak(s, new Date("2026-09-09T02:00:00Z"));
    expect(r.current).toBe(0);
    expect(r.longest).toBe(2);
  });
  it("handles a daylight saving transition by calendar date", () => {
    const s = initialUser();
    s.profile.timezone = "America/New_York";
    s.activity = {
      "2026-03-07": ["1", "2", "3", "4", "5"],
      "2026-03-08": ["1", "2", "3", "4", "5"],
    };
    expect(streak(s, new Date("2026-03-09T03:30:00Z")).current).toBe(2);
  });
});
