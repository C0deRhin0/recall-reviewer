# Security implementation evidence

The full 40-item requirement mapping remains in ROADMAP.md. This file distinguishes implemented code from checks that require a live provider.

| Area                  | Implemented evidence                                                                                          | Hosted verification still required                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Secrets               | Server-only provider adapter, ignored environment/private paths, placeholder template and hygiene script      | Provider secret scoping, access control and rotation                       |
| Identity              | Opaque HttpOnly cookies, server Auth verification, explicit provider-session existence checks                 | Real login/refresh/revocation and recovery replay tests                    |
| Authorization         | Server-derived user document keys, environment owner allowlist, MFA gate                                      | Real-project grants and owner MFA                                          |
| Database              | Private schema, RLS enabled, no browser grants, narrowly exposed functions, atomic expected revisions         | Installed migration and provider configuration                             |
| Answer privacy        | Public serializer omits keys/explanations/change notes until disclosure; progress export uses same serializer | Deployed CDN/cache behavior                                                |
| CSRF/CORS             | Exact Origin, custom header, JSON-only mutations, per-session CSRF token; no CORS grants                      | Final origin/callback configuration                                        |
| Inputs                | Strict schemas, bound RPC arguments, size/row/field limits, plain-text rendering                              | Real content quality review                                                |
| Uploads               | Owner-only CSV/JSON parsing, no executable file storage or arbitrary URL fetching                             | Private source retention policy                                            |
| Sessions              | Secure cookies on HTTPS, SameSite=Lax, session expiry, server-held provider tokens                            | Password-change/revocation behavior on actual provider                     |
| Abuse                 | Shared durable counters; account/IP rate limits; provider Turnstile token forwarding                          | CAPTCHA enablement, provider rate limits and trustworthy proxy IP behavior |
| Headers               | Nonce CSP, frame denial, nosniff, Referrer-Policy, Permissions-Policy; HSTS for HTTPS origins                 | Vercel redirects, headers and domain checks                                |
| Audit                 | Redacted structured request-failure logs and publication audit history                                        | Log retention, alerts and centralized security monitoring                  |
| Dependencies          | Lockfile and advisory scan, patched CSV parser                                                                | Recurring updates/advisory monitoring                                      |
| Backup                | Encrypted local archive tooling, tamper/wrong-key checks, isolated restoration                                | Automated managed/off-site backup and provider restore drill               |
| Payments / runtime AI | Neither capability nor endpoints are present                                                                  | Reassess if introduced                                                     |

The app deliberately does not claim that all launch checks have passed. SQL permissions and browser workflows are tested locally, including cross-user isolation, score-field tampering, CSRF denial and deferred export secrecy. Real-provider auth, email, MFA, CAPTCHA and operational controls must be verified with the configured project.

Progressive temporary account/IP limits are used rather than permanent attacker-triggerable account lockouts. Reset responses avoid reporting whether the account exists. Sensitive provider errors and credentials are not written to application logs. Source text is rendered inert and no runtime model receives imported content.

Before any future source push, review the actual candidate file list and run a full secret scanner such as Gitleaks in addition to `npm run hygiene`. The included hygiene check is an extra guard, not a complete credential detector or a Git history purge tool. If a credential is exposed, revoke/rotate it before cleaning history.
<!-- Align local documentation for security checklist documentation -->
<!-- Review follow-up details for security checklist documentation -->
