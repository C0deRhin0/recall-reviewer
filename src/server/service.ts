import "server-only";
import sample from "../../content/examples/sample-bank.json";
import { bankSchema, prepareRelease } from "../domain/content";
import { type Bank, initialUser, type UserState } from "../domain/types";
import {
  activeRelease,
  expireAttempts,
  publicAttempt,
  streak,
  summary,
  questionKey,
} from "../domain/engine";
import { mutate, store } from "./store";
import type { Identity } from "./auth";
export function bankKey(user: Identity) {
  return user.demo ? "bank:demo:" + user.id : "bank:production";
}
export function emptyBank(): Bank {
  return { activeId: null, releases: [], audit: [] };
}
export async function getBank(user: Identity): Promise<Bank> {
  const key = bankKey(user),
    record = await store().read<Bank>(key);
  if (record) return record.value;
  return mutate(key, emptyBank, (bank) => {
    if (user.demo && !bank.activeId) {
      const { release } = prepareRelease(
        bank,
        bankSchema.parse(sample),
        "replace",
      );
      release.status = "published";
      bank.releases.push(release);
      bank.activeId = release.id;
    }
    return bank;
  });
}
export async function getUserState(user: Identity) {
  return mutate("user:" + user.id, initialUser, (state) => {
    expireAttempts(state);
    return state;
  });
}
export function dashboard(user: Identity, bank: Bank, state: UserState) {
  const release = bank.activeId ? activeRelease(bank) : undefined;
  return {
    user,
    profile: state.profile,
    streak: streak(state),
    stats: summary(state, release),
    bookmarks:
      release?.questions
        .filter((q) =>
          state.bookmarks.includes(
            questionKey(release.examCode, release.edition, q.external_id),
          ),
        )
        .map((q) => q.external_id) || [],
    due:
      release?.questions.filter(
        (q) =>
          state.reviews[
            questionKey(release.examCode, release.edition, q.external_id)
          ] &&
          (new Date(
            state.reviews[
              questionKey(release.examCode, release.edition, q.external_id)
            ].due,
          ) <= new Date() ||
            state.reviews[
              questionKey(release.examCode, release.edition, q.external_id)
            ].fingerprint !== q.fingerprint),
      ).length || 0,
    release: release
      ? {
          id: release.id,
          label: release.label,
          edition: release.edition,
          examCode: release.examCode,
          count: release.questions.length,
          categories: release.categories,
        }
      : null,
    attempts: state.attempts.map((a) => ({
      id: a.id,
      mode: a.mode,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      total: a.items.length,
      answered: a.items.filter((i) => i.selectedId).length,
      score: a.completedAt ? publicAttempt(a).score : null,
      releaseLabel: a.releaseLabel,
    })),
    activity: state.activity,
  };
}
// Refine the surrounding context for service module
