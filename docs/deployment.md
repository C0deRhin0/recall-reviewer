# Vercel and managed services

The implementation is ready for managed configuration but has not been deployed. No credentials, provider projects or domain were supplied. Local sample mode is the runnable preview.

## Required configuration

| Value                      | Where it belongs                                            |
| -------------------------- | ----------------------------------------------------------- |
| `APP_MODE=managed`         | Vercel environment                                          |
| `APP_ORIGIN`               | Exact HTTPS origin for this deployment                      |
| `SUPABASE_URL`             | Vercel environment, separate per preview/production         |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel environment; no privileged permissions               |
| `SUPABASE_SECRET_KEY`      | Sensitive server environment value; never a public prefix   |
| `OWNER_EMAILS`             | Comma-separated verified owner email addresses              |
| `TURNSTILE_SITE_KEY`       | Application environment, intentionally returned to login UI |
| Turnstile secret           | Supabase Auth CAPTCHA provider settings                     |

Use separate Supabase projects and Auth settings for preview and production. Stable preview domains are simplest because Origin checks, email links and Turnstile hostname rules use exact configured origins. Never use wildcard production callbacks or point previews to the production bank.

## Database and identity setup

1. Apply `supabase/migrations/001_reviewer.sql` using an administrative migration credential.
2. Disable public signup. Create/invite the intended accounts through trusted provider administration. The application has no public enrollment endpoint.
3. Configure the Auth site URL and allowed redirects to the exact application origin and `/recover` path.
4. Enable email confirmation, strong password requirements, provider authentication rate limits, and short-lived recovery links.
5. Enable Cloudflare Turnstile in Supabase Auth, with the same widget whose public site key is in the app. Add the application hostname to the widget allowlist. Supabase validates each token; do not validate it twice.
6. Set up production SMTP and enable password/security notification emails.
7. Configure the recovery email template as below. Test it with a real account before launch.
8. Sign in as the configured owner, enroll and verify a TOTP authenticator in Settings, then import and publish a reviewed bank.

Recovery email link:

```html
<a href="{{ .SiteURL }}/recover?token_hash={{ .TokenHash }}"
  >Reset your password</a
>
```

This project uses a server-mediated recovery form. Do not use the stock fragment-token redirect template with this implementation. The token is exchanged only after the user submits the new-password form, avoiding link-scanner consumption on GET. The URL is cleared after a successful exchange. Invitation onboarding can use provider administration to create a confirmed account and then this reset flow; an app-specific invite-acceptance page is not implemented.

Supabase supports provider CAPTCHA on sign-in and recovery, and documents the email template variables used here. [CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

## Vercel settings

Use the Next.js framework preset, supported Node runtime, `npm ci`, and `npm run build`. The repository contains no project link or production identifiers. Set environment values through Vercel, mark secrets sensitive, and use the correct deployment-specific origin. This application does not create or migrate the database during a build.

`APP_MODE=demo` fails on every Vercel environment, including preview. Demo state uses local disk and must remain local. Managed mode uses Supabase and does not depend on a persistent Vercel filesystem.

Before connecting a Git repository, configure production deployment controls so an ordinary source push does not inadvertently promote a release. Source push authorization and production deployment authorization are separate. No commit, push or Git integration has been performed.

## Required hosted verification

- Real email/password sign-in, refresh, logout and a revoked/expired session.
- Save preferences during practice, reload, sign out/in, and verify the same account retains sessions, answers, bookmarks and activity; repeat with simultaneous writes from two tabs.
- Recovery email delivery, token expiry/replay and invalidation of previous sessions after password change.
- MFA setup, verification and denial of owner actions without MFA.
- Turnstile success/failure and direct Auth endpoint protection.
- Database migration grants on the real project, including no browser access to private data.
- CSP, HSTS, HTTPS redirects, callback allowlists and isolated preview data.
- Successful off-site backup and restore into an isolated project, with documented recovery of Auth users and configuration.
- Reviewed exam content, correct syllabus mapping, provider usage limits and alerting.

These depend on actual provider configuration and are not represented as locally verified.
<!-- Clarify implementation notes for deployment documentation -->
