import { randomInt, randomUUID } from "node:crypto";
import type {
  Attempt,
  Bank,
  Mode,
  ContentStyle,
  Disclosure,
  PublicAttempt,
  Release,
  UserState,
} from "./types";
import { poolCountKey } from "./types";
import { publicError } from "./errors";
export function shuffle<T>(
  items: T[],
  random: (n: number) => number = randomInt,
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function localDate(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
function offsetDay(day: string, delta: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export function streak(state: UserState, now = new Date()) {
  const today = localDate(now, state.profile.timezone);
  const days = Object.keys(state.activity)
    .filter((d) => state.activity[d].length >= 5)
    .sort();
  const set = new Set(days);
  let cursor = set.has(today) ? today : offsetDay(today, -1),
    current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = offsetDay(cursor, -1);
  }
  let longest = 0,
    run = 0,
    last = "";
  for (const day of days) {
    run = last === offsetDay(day, -1) ? run + 1 : 1;
    longest = Math.max(longest, run);
    last = day;
  }
  return {
    today,
    current,
    longest,
    todayCount: state.activity[today]?.length || 0,
    days,
  };
}
export function activeRelease(bank: Bank) {
  const release = bank.releases.find((r) => r.id === bank.activeId);
  if (!release)
    throw publicError("Publish a question release before starting practice.");
  return release;
}
export function questionKey(exam: string, edition: string, id: string) {
  return `${exam}:${edition}:${id}`;
}
export function eligibleQuestions(
  release: Release,
  state: UserState,
  mode: Mode,
  category: string,
  contentStyle: ContentStyle = "mixed",
  now = new Date(),
) {
  return release.questions.filter((q) => {
    const definition = q.tags.includes("definition");
    if (contentStyle === "definition" && !definition) return false;
    if (contentStyle === "scenario" && definition) return false;
    if (category && q.category_slug !== category) return false;
    if (mode === "bookmarks")
      return state.bookmarks.includes(
        questionKey(release.examCode, release.edition, q.external_id),
      );
    if (mode === "due") {
      const review =
        state.reviews[
          questionKey(release.examCode, release.edition, q.external_id)
        ];
      return (
        review &&
        (new Date(review.due) <= now || review.fingerprint !== q.fingerprint)
      );
    }
    if (mode === "mistakes")
      return state.attempts.some(
        (a) =>
          a.examCode === release.examCode &&
          a.edition === release.edition &&
          a.completedAt &&
          a.items.some(
            (i) =>
              i.question.external_id === q.external_id &&
              (i.guessed ||
                (i.selectedId &&
                  i.selectedId !== i.question.correct_choice_id)),
          ),
      );
    return true;
  });
}
export function availablePoolCounts(release: Release, state: UserState) {
  const counts: Record<string, number> = {};
  const modes: Mode[] = [
    "mixed",
    "category",
    "mistakes",
    "bookmarks",
    "due",
    "mock",
    "weighted",
  ];
  const categories = [
    "",
    ...release.categories.map((category) => category.slug),
  ];
  const styles: ContentStyle[] = ["mixed", "scenario", "definition"];
  for (const mode of modes)
    for (const category of categories)
      for (const contentStyle of styles)
        counts[poolCountKey(mode, category, contentStyle)] = eligibleQuestions(
          release,
          state,
          mode,
          category,
          contentStyle,
        ).length;
  return counts;
}
export function startAttempt(
  bank: Bank,
  state: UserState,
  config: {
    mode: Mode;
    contentStyle?: ContentStyle;
    category: string;
    count: number;
    disclosure: Disclosure;
    minutes: number;
    preferUnseen: boolean;
    requestId: string;
  },
  now = new Date(),
) {
  const existing = state.attempts.find((a) => a.id === config.requestId);
  if (existing) return existing;
  if (state.attempts.filter((a) => !a.completedAt).length >= 5)
    throw publicError("Finish an existing session before starting another.");
  const release = activeRelease(bank),
    pool = eligibleQuestions(
      release,
      state,
      config.mode,
      config.category,
      config.contentStyle,
      now,
    );
  if (!pool.length)
    throw publicError("No questions match this practice set yet.");
  if (config.count > pool.length)
    throw publicError(
      `Only ${pool.length} questions are available. Choose ${pool.length} or fewer.`,
    );
  let selected = shuffle(pool),
    notice = "";
  if (config.mode === "weighted") {
    if (config.category)
      throw publicError("Weighted practice requires all categories.");
    const total = release.categories.reduce((s, c) => s + c.weight, 0);
    if (total <= 0)
      throw publicError("Configure domain weights before weighted practice.");
    const quotas = release.categories.map((c) => ({
      c,
      raw: (config.count * c.weight) / total,
      n: Math.floor((config.count * c.weight) / total),
    }));
    let left = config.count - quotas.reduce((s, x) => s + x.n, 0);
    for (const q of [...quotas].sort((a, b) => b.raw - b.n - (a.raw - a.n))) {
      if (left-- > 0) q.n++;
    }
    selected = [];
    for (const { c, n } of quotas) {
      const list = shuffle(pool.filter((q) => q.category_slug === c.slug));
      if (list.length < n)
        throw publicError(
          `${c.name} needs ${n} questions for this weighted set; only ${list.length} are available.`,
        );
      selected.push(...list.slice(0, n));
    }
    selected = shuffle(selected);
  } else if (config.preferUnseen) {
    const seen = new Set(
      state.attempts
        .filter(
          (a) =>
            a.examCode === release.examCode && a.edition === release.edition,
        )
        .flatMap((a) =>
          a.items
            .filter((i) => i.selectedId)
            .map((i) => i.question.external_id),
        ),
    );
    selected = [
      ...selected.filter((q) => !seen.has(q.external_id)),
      ...selected.filter((q) => seen.has(q.external_id)),
    ];
    const unseen = pool.filter((q) => !seen.has(q.external_id)).length;
    if (unseen < config.count)
      notice = `${unseen} unseen questions available; this set includes ${config.count - unseen} previously seen questions.`;
  }
  const attempt: Attempt = {
    id: config.requestId || randomUUID(),
    releaseId: release.id,
    releaseLabel: release.label,
    edition: release.edition,
    examCode: release.examCode,
    mode: config.mode,
    contentStyle: config.contentStyle || "mixed",
    disclosure: config.mode === "mock" ? "after-session" : config.disclosure,
    startedAt: now.toISOString(),
    deadline:
      config.mode === "mock"
        ? new Date(+now + config.minutes * 60000).toISOString()
        : null,
    completedAt: null,
    cursor: 0,
    notice,
    items: selected.slice(0, config.count).map((q) => ({
      question: q,
      choices: shuffle(q.choices),
      selectedId: null,
      answeredAt: null,
      activityDate: null,
      guessed: false,
      flagged: false,
      revealed: false,
    })),
  };
  state.attempts.unshift(attempt);
  return attempt;
}
function credit(
  state: UserState,
  item: Attempt["items"][number],
  attempt: Attempt,
) {
  if (!item.selectedId || !item.activityDate) return;
  const ids = (state.activity[item.activityDate] ??= []);
  const key = questionKey(
    attempt.examCode,
    attempt.edition,
    item.question.external_id,
  );
  if (!ids.includes(key)) ids.push(key);
}
export function finishAttempt(
  state: UserState,
  attempt: Attempt,
  now = new Date(),
) {
  if (attempt.completedAt) return;
  attempt.completedAt = now.toISOString();
  for (const item of attempt.items) {
    credit(state, item, attempt);
    if (!item.selectedId) continue;
    const key = questionKey(
      attempt.examCode,
      attempt.edition,
      item.question.external_id,
    );
    const old = state.reviews[key];
    const right =
      item.selectedId === item.question.correct_choice_id && !item.guessed;
    const step = right ? Math.min((old?.step ?? -1) + 1, 3) : 0;
    state.reviews[key] = {
      step,
      due: new Date(+now + [1, 3, 7, 14][step] * 86400000).toISOString(),
      fingerprint: item.question.fingerprint,
    };
  }
}
export function expireAttempts(state: UserState, now = new Date()) {
  for (const a of state.attempts)
    if (!a.completedAt && a.deadline && new Date(a.deadline) <= now)
      finishAttempt(state, a, now);
}
export function answer(
  state: UserState,
  id: string,
  index: number,
  choice: string,
  guessed: boolean,
  now = new Date(),
) {
  const a = state.attempts.find((a) => a.id === id);
  if (!a) throw publicError("Session not found.");
  if (a.completedAt) throw publicError("This session has ended.");
  if (a.deadline && new Date(a.deadline) <= now) {
    finishAttempt(state, a, now);
    return a;
  }
  const item = a.items[index];
  if (!item || !item.choices.some((c) => c.id === choice))
    throw publicError("Invalid answer choice.");
  if (item.selectedId && a.mode !== "mock") {
    if (item.selectedId === choice) return a;
    throw publicError("This answer is already locked.");
  }
  item.selectedId = choice;
  item.guessed = guessed;
  item.answeredAt = now.toISOString();
  item.activityDate = localDate(now, state.profile.timezone);
  if (a.disclosure === "automatic") item.revealed = true;
  if (a.mode !== "mock") credit(state, item, a);
  a.cursor = index;
  return a;
}
export function publicAttempt(a: Attempt): PublicAttempt {
  return {
    ...a,
    score: a.completedAt
      ? a.items.filter((i) => i.selectedId === i.question.correct_choice_id)
          .length
      : null,
    items: a.items.map(({ question: q, ...item }) => {
      const {
        correct_choice_id,
        explanation_technical,
        explanation_eli5,
        fingerprint: _hash,
        choices: _choices,
        change_note: _note,
        ...safe
      } = q;
      void _hash;
      void _choices;
      void _note;
      const canShow =
        !!a.completedAt ||
        (a.disclosure !== "after-session" &&
          !!item.selectedId &&
          item.revealed);
      return {
        ...item,
        question: safe,
        correct:
          !!item.selectedId &&
          (a.disclosure !== "after-session" || !!a.completedAt)
            ? item.selectedId === correct_choice_id
            : null,
        solution: canShow
          ? { correct_choice_id, explanation_technical, explanation_eli5 }
          : null,
      };
    }),
  };
}
export function summary(state: UserState, release?: Release) {
  const completed = state.attempts.filter(
    (a) =>
      a.completedAt &&
      (!release ||
        (a.examCode === release.examCode && a.edition === release.edition)),
  );
  const items = completed.flatMap((a) => a.items).filter((i) => i.selectedId);
  const first = new Map<string, (typeof items)[number]>();
  for (const item of [...items].sort((a, b) =>
    a.answeredAt!.localeCompare(b.answeredAt!),
  ))
    if (!first.has(item.question.external_id))
      first.set(item.question.external_id, item);
  const right = items.filter(
    (i) => i.selectedId === i.question.correct_choice_id,
  ).length;
  return {
    answered: items.length,
    correct: right,
    accuracy: items.length ? Math.round((100 * right) / items.length) : null,
    unique: first.size,
    firstAccuracy: first.size
      ? Math.round(
          (100 *
            [...first.values()].filter(
              (i) => i.selectedId === i.question.correct_choice_id,
            ).length) /
            first.size,
        )
      : null,
    completed: completed.length,
    categories:
      release?.categories.map((c) => {
        const relevant = items.filter(
          (i) => i.question.category_slug === c.slug,
        );
        const seen = new Set(relevant.map((i) => i.question.external_id));
        const bank = release.questions.filter(
          (q) => q.category_slug === c.slug,
        );
        return {
          ...c,
          count: bank.length,
          seen: bank.filter((q) => seen.has(q.external_id)).length,
          answered: relevant.length,
          accuracy: relevant.length
            ? Math.round(
                (100 *
                  relevant.filter(
                    (i) => i.selectedId === i.question.correct_choice_id,
                  ).length) /
                  relevant.length,
              )
            : null,
        };
      }) || [],
    objectives: release
      ? [...new Set(release.questions.map((q) => q.objective_code))].map(
          (code) => {
            const qs = release.questions.filter(
              (q) => q.objective_code === code,
            );
            const seen = qs.filter((q) => first.has(q.external_id)).length;
            return { code, total: qs.length, seen };
          },
        )
      : [],
  };
}
