# Recall

A personal exam-review workspace built with Next.js, TypeScript and Supabase, designed for Vercel without a VPS.

## Run locally

Use Node.js 22 or newer, npm, and Git.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:3000` and choose **Open sample workspace**. The local mode contains 30 original illustrative questions and saves progress under ignored `private/runtime/`. An HTTP-only cookie remembers this browser's workspace across sign-out and session expiry. Clearing browser data removes that association, while the records remain on disk. Localhost navigation redirects to the configured address.

The sample taxonomy is provisional. It is not an official bank or a representation of the booked exam. Your v7 content can replace it through the question-bank workbench.

## Implemented

- Mixed/category practice, mistakes and guesses, saved questions, due reviews, weighted sets and timed mocks.
- Four shuffled options with stable answer IDs, server grading, immutable session snapshots and saved progress.
- Automatic, on-demand and end-of-session disclosure, with technical and ELI5 explanations.
- Calendar streaks, daily targets, first-encounter accuracy, category/objective coverage and session history.
- CSV/JSON validation, import previews, draft releases, publish/restore, question revisions and issue reports.
- Managed email/password sign-in, password recovery, TOTP MFA and server-held sessions. Real provider flows require the configuration below before use.
- A custom dark interface with responsive layouts, keyboard controls and accessibility checks.

## Verification

```sh
npm run check
npm run build
# Keep the local server running in another terminal:
npm run test:browser
```

Browser tests use a fresh isolated browser, synthetic data and local demo identities. Install their browser once with `npx playwright install chromium`. They cover desktop/mobile study, accessibility, imports, rollback, cross-user isolation, CSRF, answer disclosure and concurrent saves. Unit tests cover question validation, edition/version rules, grading, streaks, PostgreSQL permissions and encrypted backups.

## Connect managed services

Read [deployment instructions](docs/deployment.md). Copy placeholders into provider environment settings, switch to `APP_MODE=managed`, apply the migration, configure controlled enrollment, email recovery and CAPTCHA, and set the owner email allowlist. The owner then enrolls/verifies MFA before publishing questions.

Vercel previews and production must have separate Supabase projects and origins. Demo mode is refused on every Vercel environment. The app never writes to the deployed filesystem in managed mode.

No cloud resources were provisioned and no deployment, commit or push was performed during this implementation.

## Documentation

- [Implementation status and limits](docs/IMPLEMENTATION.md)
- [Architecture and security boundaries](docs/architecture.md)
- [Question authoring and import contract](docs/content-authoring.md)
- [Vercel and Supabase deployment](docs/deployment.md)
- [Security evidence and launch checks](docs/security-checklist.md)
- [Backup and restore](docs/backup-restore.md)
- [Roadmap without a timeline](ROADMAP.md)

## Publishing the source

The repository is portable: it contains application source, a lockfile, database migrations, documentation, an empty question template and synthetic examples. Managed deployment configuration remains external.

| Include in GitHub                                  | Keep outside Git                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `.env.example` with placeholders                   | `.env.local`, `.env.production`, credentials                             |
| `src/`, `scripts/`, tests and configuration        | `node_modules/`, `.next/`, test output                                   |
| `supabase/migrations/`                             | `.vercel/`, `.supabase/`, Supabase CLI links                             |
| Question schemas, templates and synthetic examples | `private/`, private/production question banks, imports, exports, backups |

Run `npm run hygiene` before publishing. It checks Git's actual candidate files, verifies private-path exclusions, detects common credential formats, and fails if an ignored file is already tracked. The check does not initialize, stage or commit files in this project. Keep real content in the ignored directories or the managed database; `.gitignore` cannot identify private content copied into arbitrary source files.

Publish this directory as its own repository. Review the staged file list before the first commit. Do not force-add ignored files or upload a ZIP of the entire working folder. Publishing source does not deploy the app; configure Vercel deployment controls separately before connecting GitHub. Live Supabase/Vercel verification remains required before a production launch.

The project has not been initialized as a Git repository. No commits, pushes or deployment connections have been created.
