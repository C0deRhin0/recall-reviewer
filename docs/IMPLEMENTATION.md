# Implementation status

The local application is implemented and usable. Development dates and timeline estimates have been removed from the roadmap. Source remains uncommitted and unpushed.

## UI refinement

The Study Desk now starts practice directly with compact category/count controls, optional feedback preferences, resumable sessions, inline progress and recent activity. Marketing copy, oversized sections and repeated metadata were removed across the application. See `ui-guidelines.md` for the persistent design constraints.

## Delivered

- Custom Recall interface: study desk, practice setup/player, results, progress, history, versioned question workbench and settings, with responsive dark styling and self-hosted fonts.
- Thirty original synthetic questions with four options, technical reasoning and ELI5 explanations.
- Seven practice modes, stable shuffled choices, no within-session duplicates, explicit small-bank limits, saved attempts, immutable historical questions and server-authoritative mock deadlines.
- Three disclosure policies, score and export privacy, guesses, bookmarks, flags, revision-bound issue reports and simple scheduled reviews.
- Calendar streaks, configurable daily target/timezone, optional exam-date storage, first-encounter and overall accuracy, category/objective coverage.
- CSV/JSON import validation, unique IDs, dry-run changes and question previews, immutable draft/published releases, atomic activation and rollback.
- Explicit local and managed storage adapters, Supabase migration, managed email/password/recovery/MFA integration and protected server endpoints.
- Strict validation, shared rate counters, CSRF checks, security headers, private sessions and production/demo separation.
- Authoring contract/schema, placeholder environment template, private-path exclusions, hygiene checks, encrypted local backup tools and deployment documentation.

## Verification

Latest verification: 48 automated tests and nine browser workflow tests pass. TypeScript checks, the optimized production build, source hygiene, and formatting checks pass. The dependency advisory scan reports zero known vulnerabilities. Browser checks include desktop/mobile screenshots, axe accessibility checks, mobile settings and sign-out. Authentication adapter tests simulate provider responses; live provider verification remains separate.

See the test sources for executable evidence. The browser suite covers a complete five-question session through disclosure, completion, refresh and streak credit; publication/rollback; cross-user and forged-field denial; deferred-answer export privacy; concurrent saves; and desktop/mobile accessibility/layout.

PostgreSQL permissions and compare-and-swap behavior are exercised in an embedded PostgreSQL-compatible engine using the actual migration, with synthetic Auth roles/tables. This validates SQL behavior but does not substitute for applying and testing the migration on Supabase.

## External inputs and limits

- Supabase/Vercel projects, credentials, owner accounts, SMTP, Turnstile, final origins and backups have not been provisioned. Managed auth integration is implemented but cannot be end-to-end validated against a real account yet.
- Actual v7 question content and the exact booked exam code/objectives remain to be supplied. The synthetic bank is clearly labeled and cannot be mistaken for published official material.
- The initial storage model is transactional JSONB documents, not the originally proposed normalized relational model. This prioritizes consistent personal-use state and preserves portable repository interfaces; see architecture.md for limits and security tradeoffs.
- No production performance claim or 10,000-question benchmark is made. Large banks/many users require normalization and measured capacity planning.
- Plain-text authoring is supported. Native XLSX, OCR, rendered Markdown, full offline sync, runtime AI tutoring, payments, multiuser issue-report aggregation, self-service account deletion and automated correction notices are not implemented.
- Exam date is stored as a preference; a full study-calendar planner is not implemented.
- Production backup scheduling, centralized audit retention/alerting, and full provider recovery checks remain launch gates.

## Next concrete step

Use the local workspace to review the interface and import format. For managed use, follow deployment.md with separate preview and production configuration, then publish reviewed content. No additional implementation timeline is needed.

## Preference persistence and local identity

Preference-save/reload regression tests preserve identity, sessions, selected answers, flags, bookmarks, activity, and question releases. Concurrent preference and progress writes are tested through both LocalStore and ManagedStore, with managed RPCs backed by the actual SQL migration in PGlite. A database read error must fail without writing default state. Managed reauthentication retains the same account UUID.

Local sign-out revokes the session but now retains an opaque, HTTP-only workspace cookie, valid for one year, that permits the local-only demo entry point to reopen the same workspace. Active older sessions adopt this cookie on bootstrap. This does not restore previously signed-out workspaces whose browser credentials were already deleted. Different browser contexts remain separate, and managed mode rejects demo entry even if a local workspace cookie exists.

Loopback page navigation redirects to APP_ORIGIN so localhost and 127.0.0.1 do not silently select separate cookie stores. Clearing browser data still removes the local workspace association; it does not erase server-side records. Existing records were preserved during this change, with no automatic merging of workspaces.
<!-- Capture a cleanup item for implementation documentation -->
<!-- Clarify implementation notes for implementation documentation -->
<!-- Document the next adjustment for implementation documentation -->
