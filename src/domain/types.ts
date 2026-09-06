export type Choice = { id: string; text: string };
export type Question = {
  external_id: string;
  category_slug: string;
  objective_code: string;
  prompt: string;
  choices: Choice[];
  correct_choice_id: string;
  explanation_technical: string;
  explanation_eli5: string;
  difficulty: "basic" | "intermediate" | "advanced";
  tags: string[];
  source_reference: string;
  change_note: string;
};
export type Revision = Question & { revision: number; fingerprint: string };
export type Category = { slug: string; name: string; weight: number };
export type Release = {
  id: string;
  label: string;
  examCode: string;
  edition: string;
  createdAt: string;
  questions: Revision[];
  categories: Category[];
  hash: string;
  parentId: string | null;
  status: "draft" | "published";
};
export type Audit = {
  at: string;
  actor: string;
  action: string;
  target: string;
};
export type Bank = {
  activeId: string | null;
  releases: Release[];
  audit: Audit[];
};
export type Disclosure = "automatic" | "on-demand" | "after-session";
export type Mode =
  "mixed" | "category" | "mistakes" | "bookmarks" | "due" | "mock" | "weighted";
export type Item = {
  question: Revision;
  choices: Choice[];
  selectedId: string | null;
  answeredAt: string | null;
  activityDate: string | null;
  guessed: boolean;
  flagged: boolean;
  revealed: boolean;
};
export type Attempt = {
  id: string;
  releaseId: string;
  releaseLabel: string;
  edition: string;
  examCode: string;
  mode: Mode;
  disclosure: Disclosure;
  startedAt: string;
  deadline: string | null;
  completedAt: string | null;
  items: Item[];
  notice: string;
  cursor: number;
};
export type Review = { due: string; step: number; fingerprint: string };
export type Profile = {
  name: string;
  timezone: string;
  timezoneChangedAt: string | null;
  dailyTarget: number;
  examDate: string;
  disclosure: Disclosure;
};
export type UserState = {
  profile: Profile;
  attempts: Attempt[];
  bookmarks: string[];
  reports: {
    id: string;
    questionId: string;
    revision: number;
    message: string;
    at: string;
  }[];
  activity: Record<string, string[]>;
  reviews: Record<string, Review>;
};
export const initialUser = (): UserState => ({
  profile: {
    name: "",
    timezone: "Asia/Manila",
    timezoneChangedAt: null,
    dailyTarget: 5,
    examDate: "",
    disclosure: "on-demand",
  },
  attempts: [],
  bookmarks: [],
  reports: [],
  activity: {},
  reviews: {},
});
export type PublicItem = Omit<Item, "question"> & {
  question: Omit<
    Revision,
    | "correct_choice_id"
    | "explanation_technical"
    | "explanation_eli5"
    | "fingerprint"
    | "choices"
    | "change_note"
  >;
  correct: boolean | null;
  solution: {
    correct_choice_id: string;
    explanation_technical: string;
    explanation_eli5: string;
  } | null;
};
export type PublicAttempt = Omit<Attempt, "items"> & {
  items: PublicItem[];
  score: number | null;
};
// Review follow-up details for types module
