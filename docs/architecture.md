# Architecture

## Execution path

Browser → same-origin Next.js endpoints → authenticated domain operations → local or managed document repository.

`src/domain/` implements content validation, revisioning, selection, scoring, disclosure, streaks and progress. It has no Next.js or Supabase dependency. `src/server/` owns configuration, auth, storage and response construction. `src/components/` contains the UI. The catch-all API router validates each operation using strict schemas. The stylesheet defines a shared token system and responsive component classes.

## Storage decision

This first personal-use implementation uses PostgreSQL JSONB documents and compare-and-swap revisions, rather than the roadmap's proposed fully normalized relational schema. A user's complete study state is one transaction boundary, so concurrent answer submissions, activity credit and finalization cannot partially update different records. Bank releases are another document with immutable revision snapshots. The local adapter implements the same contract through atomic file replacement and per-document lock directories.

Every write includes an expected storage revision. A conflict reloads and reruns a synchronous, side-effect-free state transition. Question selection and creation are idempotent by a client request UUID. Practice answers lock; retries of an already accepted choice do not create extra activity. External auth calls occur outside these retryable domain transitions.

Tradeoffs: writes and reads scale with document size. The database enforces a 16 MB limit per document. Import batches allow 1,000 questions, resulting releases at most 10,000 questions, and sessions at most 100 questions. The aggregate document limit may be reached earlier due to long explanations and retained revisions. This design is for personal/small controlled use. Before large shared banks or substantial multiuser usage, normalize immutable question revisions, attempts and activity into indexed tables, and retain the repository/domain contracts. No claim of a 10,000-question production benchmark is made.

## Managed authorization decision

The delivered implementation uses a server-controlled API, with no browser database access. This supersedes the draft plan's browser-identity RLS query path. RLS is enabled and browser roles have no grants, policies or function execution privileges. The application verifies identity with Supabase Auth and checks that the provider session still exists before every protected request. Owner email membership comes only from trusted environment configuration. Content administration additionally requires an MFA-authenticated session.

The server secret calls three narrow security-definer functions with fixed empty search paths: document read, conditional write and provider-session existence check. The underlying private table grants no direct runtime access. Supabase's service credential is nevertheless a powerful credential at the provider level; it remains in one server adapter and external environment storage. Never prefix it with `NEXT_PUBLIC_` or give it to the browser. The API, not a client-provided owner ID, selects the document key. Tests verify denial for anonymous/authenticated roles and cross-account API requests.

If runtime credentials are compromised, this BFF boundary is compromised. For a larger deployment, move the data adapter to a dedicated PostgreSQL role limited to these operations or normalized per-user functions. Do not simply enable browser reads of these documents: they contain answer keys and session snapshots.

## Answer privacy

Private attempts pin complete question revisions for reliable historical grading. Public DTOs explicitly remove the correct choice ID, both explanations, the content fingerprint, choice metadata duplication and internal change notes. They add a solution only when the recorded disclosure policy allows it. In mock/deferred mode, even correctness stays absent until finalization. Progress exports use the same public serializer.

An owner can deliberately export the complete bank for authoring. This is an administrative privilege, distinct from the study UI. Explanations are static reviewed text. The renderer treats all question content as text, with whitespace preserved; Markdown/HTML execution is not enabled in this release.

## Sessions and request protection

Browsers receive an opaque, random HttpOnly cookie. Only its digest is used as a database key. Provider access/refresh tokens remain server-side in private session records and never enter browser JSON or localStorage. Production cookies require HTTPS and use Secure, SameSite=Lax and a seven-day maximum application session. Provider session revocation is checked independently of JWT signature/expiry.

Mutations require the configured Origin, a custom request header, JSON content type, and a per-session CSRF token for authenticated operations. No application state changes on GET except server maintenance of expired attempt/session state and rate counters. Recovery email links present a form; only an explicit POST consumes the token. Authenticated responses use private/no-store, and request-specific auth clients are never reused globally.

The provider verifies Turnstile tokens exactly once. Do not additionally call Turnstile Siteverify in the app with the same token: tokens are single-use. Enable CAPTCHA in Supabase itself so direct Auth endpoint requests remain protected.

## Edition boundaries

Attempts store exam code, syllabus edition and release ID. Bookmarks, due reviews and study progress are namespaced by exam + edition + stable question ID. Revisions retain their original answers; rollbacks change only the active pointer for future sessions. No historical automatic regrading occurs. Changing the answer key will cause a previously scheduled question to become due again.

## Local portability

No real project IDs, domains, credentials or bank content are embedded in source. `APP_MODE=demo` requires a loopback origin and is rejected whenever `VERCEL` is set. Managed mode requires explicit provider configuration and stores data remotely. `.env.example` contains placeholders, while `.env.local`, `.vercel/`, private records and generated output are ignored.
<!-- Refine the surrounding context for architecture documentation -->
<!-- Align local documentation for architecture documentation -->
