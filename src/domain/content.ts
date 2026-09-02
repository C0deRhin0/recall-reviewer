import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import type { Bank, Category, Release } from "./types";
const text = (max: number) => z.string().trim().min(1).max(max);
const slug = text(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const questionSchema = z
  .object({
    external_id: slug,
    category_slug: slug,
    objective_code: text(80),
    prompt: text(6000),
    choices: z
      .array(z.object({ id: slug, text: text(2000) }).strict())
      .length(4),
    correct_choice_id: slug,
    explanation_technical: text(6000),
    explanation_eli5: text(3000),
    difficulty: z
      .enum(["basic", "intermediate", "advanced"])
      .default("intermediate"),
    tags: z.array(text(60)).max(20).default([]),
    source_reference: text(1000),
    change_note: text(500).default("Imported revision"),
  })
  .strict()
  .superRefine((q, c) => {
    if (
      new Set(q.choices.map((x) => x.id)).size !== 4 ||
      new Set(q.choices.map((x) => x.text.toLowerCase())).size !== 4
    )
      c.addIssue({
        code: "custom",
        message: "All four choices must have distinct IDs and text.",
      });
    if (!q.choices.some((x) => x.id === q.correct_choice_id))
      c.addIssue({
        code: "custom",
        message: "Correct choice must match one choice ID.",
      });
    if (
      q.choices.some((x) =>
        /all of the above|both [a-d] and [a-d]|option [a-d]/i.test(x.text),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Position-dependent choices cannot be safely shuffled.",
      });
  });
export const bankSchema = z
  .object({
    schema_version: z.literal(1),
    exam_code: slug,
    edition: slug,
    release_label: text(100),
    categories: z
      .array(
        z
          .object({ slug, name: text(160), weight: z.number().min(0).max(100) })
          .strict(),
      )
      .min(1)
      .max(40),
    questions: z.array(questionSchema).min(1).max(1000),
  })
  .strict()
  .superRefine((b, c) => {
    if (
      new Set(b.questions.map((q) => q.external_id)).size !== b.questions.length
    )
      c.addIssue({
        code: "custom",
        message: "Duplicate external_id in import.",
      });
    if (new Set(b.categories.map((q) => q.slug)).size !== b.categories.length)
      c.addIssue({ code: "custom", message: "Duplicate category slug." });
    for (const q of b.questions)
      if (!b.categories.some((x) => x.slug === q.category_slug))
        c.addIssue({
          code: "custom",
          message: `${q.external_id}: unknown category ${q.category_slug}.`,
        });
    if (
      new Set(
        b.questions.map((q) => q.prompt.toLowerCase().replace(/\s+/g, " ")),
      ).size !== b.questions.length
    )
      c.addIssue({
        code: "custom",
        message: "Duplicate question prompts in import.",
      });
  });
export type ImportPayload = z.infer<typeof bankSchema>;
export function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function parseImport(
  raw: string,
  format: "json" | "csv",
  metadata?: {
    exam_code: string;
    edition: string;
    release_label: string;
    categories: Category[];
  },
): ImportPayload {
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
    throw new Error(
      "Import exceeds the 2 MiB limit. Split the bank into smaller batches.",
    );
  if (format === "json")
    return bankSchema.parse(JSON.parse(raw.replace(/^\uFEFF/, "")));
  if (!metadata)
    throw new Error("CSV imports require exam, edition and category metadata.");
  const rows = parse(raw, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    max_record_size: 32000,
    trim: true,
  }) as Record<string, string>[];
  const questions = rows.map((r, i) => {
    if (
      (r.exam_code && r.exam_code !== metadata.exam_code) ||
      (r.edition && r.edition !== metadata.edition)
    )
      throw new Error(
        `Row ${i + 2}: edition or exam does not match this bank.`,
      );
    return {
      external_id: r.external_id,
      category_slug: r.category_slug,
      objective_code: r.objective_code,
      prompt: r.prompt,
      choices: ["a", "b", "c", "d"].map((id) => ({
        id,
        text: r[`option_${id}`],
      })),
      correct_choice_id: r.correct_option?.toLowerCase(),
      explanation_technical: r.explanation_technical,
      explanation_eli5: r.explanation_eli5,
      difficulty: r.difficulty || "intermediate",
      tags: r.tags
        ? r.tags
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      source_reference: r.source_reference,
      change_note: r.change_note || "Imported revision",
    };
  });
  return bankSchema.parse({ schema_version: 1, ...metadata, questions });
}
export function prepareRelease(
  bank: Bank,
  input: ImportPayload,
  mode: "merge" | "replace",
) {
  const active = bank.releases.find((r) => r.id === bank.activeId);
  if (
    active &&
    (active.edition !== input.edition || active.examCode !== input.exam_code) &&
    mode === "merge"
  )
    throw new Error(
      "Use replace to start a different edition. Editions cannot be merged.",
    );
  const baseline =
    active?.edition === input.edition && active?.examCode === input.exam_code
      ? active
      : undefined;
  const changes: {
    id: string;
    kind: "added" | "changed" | "unchanged" | "retired";
    before: string;
    after: string;
    fields: string[];
  }[] = [];
  const incoming = input.questions.map((q) => {
    const before = baseline?.questions.find(
      (x) => x.external_id === q.external_id,
    );
    const { change_note: _note, ...core } = q;
    void _note;
    const fingerprint = hash(core);
    const same = before?.fingerprint === fingerprint;
    changes.push({
      id: q.external_id,
      kind: !before ? "added" : same ? "unchanged" : "changed",
      before: before?.prompt || "",
      after: q.prompt,
      fields: before
        ? Object.keys(core).filter(
            (k) =>
              JSON.stringify(before[k as keyof typeof before]) !==
              JSON.stringify(core[k as keyof typeof core]),
          )
        : [],
    });
    const max = Math.max(
      0,
      ...bank.releases
        .filter(
          (r) => r.edition === input.edition && r.examCode === input.exam_code,
        )
        .flatMap((r) =>
          r.questions
            .filter((x) => x.external_id === q.external_id)
            .map((x) => x.revision),
        ),
    );
    return same ? before! : { ...q, fingerprint, revision: max + 1 };
  });
  const omitted =
    baseline?.questions.filter(
      (q) => !incoming.some((x) => x.external_id === q.external_id),
    ) || [];
  if (mode === "replace")
    for (const q of omitted)
      changes.push({
        id: q.external_id,
        kind: "retired",
        before: q.prompt,
        after: "",
        fields: [],
      });
  const questions = mode === "merge" ? [...incoming, ...omitted] : incoming;
  if (
    new Set(questions.map((q) => q.prompt.toLowerCase().replace(/\s+/g, " ")))
      .size !== questions.length
  )
    throw new Error(
      "This import duplicates a question retained in the release.",
    );
  if (questions.length > 10000)
    throw new Error("A release may contain at most 10,000 questions.");
  const categories = input.categories;
  if (
    questions.some((q) => !categories.some((c) => c.slug === q.category_slug))
  )
    throw new Error("The category list must cover retained questions too.");
  const releaseHash = hash({
    exam: input.exam_code,
    edition: input.edition,
    categories,
    questions: questions
      .map((q) => ({ id: q.external_id, hash: q.fingerprint }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  const release: Release = {
    id: randomUUID(),
    label: input.release_label,
    examCode: input.exam_code,
    edition: input.edition,
    createdAt: new Date().toISOString(),
    questions,
    categories,
    hash: releaseHash,
    parentId: bank.activeId,
    status: "draft",
  };
  return { release, changes, unchanged: active?.hash === releaseHash };
}
export function exportRelease(release: Release): ImportPayload {
  return {
    schema_version: 1,
    exam_code: release.examCode,
    edition: release.edition,
    release_label: release.label,
    categories: release.categories,
    questions: release.questions.map(
      ({ revision: _r, fingerprint: _f, ...q }) => {
        void _r;
        void _f;
        return q;
      },
    ),
  };
}
