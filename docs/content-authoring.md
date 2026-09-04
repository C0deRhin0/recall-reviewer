# Authoring questions

Use the **Question bank** workbench. A connected owner must verify MFA in Settings first. The local sample owner can exercise the same publication flow immediately.

## Start a bank

Use `content/examples/sample-bank.json` as a structural example or export the active release. Replace its illustrative questions and taxonomy with reviewed material. Set a real `exam_code`, syllabus `edition`, unique `release_label`, categories and their weights. Each question needs its actual objective code. The initial sample uses `SAMPLE-*` objective labels intentionally.

The machine-readable contract is `content/schemas/question-bank.schema.json`. Runtime validation adds cross-field checks that JSON Schema alone cannot express.

Each question needs a stable external ID, prompt, exactly four distinct choices, one correct choice ID, technical explanation, ELI5 explanation, category, objective and source reference. Difficulty is basic/intermediate/advanced. Tags are optional. Content is plain text; line breaks and code indentation are preserved, while HTML is displayed as text. Do not write explanations in an internal change note: only the actual explanation fields are disclosed during review.

Keep external IDs stable through corrections. Change the release label when publishing a revision. Changes to content create a new revision; changing only an import note does not create a content revision.

## Spreadsheet workflow

Download the CSV template from the app or use `content/templates/questions.csv`. Export UTF-8 CSV from your spreadsheet. Quote values that contain commas or newlines. Tags use a `|` separator. `correct_option` accepts A/B/C/D, case insensitive. The importer assigns stable internal choice IDs before shuffling.

CSV imports inherit the active bank's category metadata, exam and edition; optional row exam/edition fields must agree. Start a new edition with JSON. The generated CSV release label may need a unique suffix if you already saved another import with that label; the preview's normalized JSON can be reused with a new label.

## Publication flow

1. Choose merge or replace and paste/upload CSV or JSON.
2. Validate and inspect the row/field errors and question preview.
3. Review added, changed, unchanged and retired IDs. Expand an item to inspect its options, correct answer, technical explanation and ELI5.
4. Save the reviewed draft.
5. Publish the draft through the activation confirmation.

Merge retains IDs omitted from the incoming file. Replace retires them for future sessions. An import cannot silently mix editions. An exact reimport is a no-op. If the active bank changes while a draft is prepared, the owner must preview it again. Draft and published release labels are unique.

An older published release can be activated to roll back. Attempts retain complete original revisions and scores. The bank workbench includes revision-bound issue reports submitted by the current account.

## Import limits and quality

Maximum input: 2 MiB and 1,000 questions per batch. Duplicate IDs/prompts, missing explanations, invalid correct choices, unknown categories, duplicate options and common position-dependent choices are rejected. The complete resulting bank must also remain within storage limits described in architecture.md.

The importer checks structure, not truth. Review factual correctness and the objective mapping before publication. Original source material stays in ignored `private/` or an external private content store. OCR/native XLSX parsing and automatic explanation generation are not part of this implementation.
<!-- Review follow-up details for content authoring documentation -->
