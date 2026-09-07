# Backup and restore

## Local demo

`scripts/backup.mjs` creates an authenticated AES-256-GCM archive of local document records. Session credentials are excluded. Keep the base64-encoded 32-byte encryption key in a password manager, supplied to the process as `REVIEWER_BACKUP_KEY`. Never put it in source, commands saved to shared transcripts, or the backup directory.

```sh
node scripts/backup.mjs create private/runtime backups/local.backup
node scripts/backup.mjs restore backups/local.backup private/restore-check
```

The output backup uses exclusive creation and private file permissions. Restore requires a new target directory and never overwrites the active runtime. Keep a private record of the demo identity if you intend to reconnect restored progress; login cookies/session tokens are deliberately not restored.

Tests verify that the encrypted payload restores exactly, rejects the wrong key and detects tampering. A local isolated-directory round trip is also part of implementation verification. This does not prove hosted Auth recovery.

## Managed production

Use the selected provider's managed backup feature and encrypted off-site logical backups. Include the `reviewer_private` schema and all application functions/grants. An application-level progress export is useful to a learner but is not a complete database backup. Likewise, a question-bank JSON export does not contain accounts or attempts.

Auth users, provider session behavior, SMTP/CAPTCHA settings and environment configuration need their own documented recovery procedure. Never assume an application-table dump recreates the entire identity service. Use the provider's supported project backup/restore workflow and test it in isolation. Reauthenticate users after a restore; do not depend on restored access/refresh tokens remaining valid.

Configure and verify an automated daily off-site backup before production use. Keep a copy before migrations or major content changes. Initial retention target: 30 days. Rotate old session/rate records separately; do not let private token records persist indefinitely. Production backup automation and provider restore verification remain external setup tasks because no managed account was connected.

Supabase documents paid managed backups and recommends off-site exports for free projects. Storage objects, if later introduced, need separate backup handling. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)
<!-- Document the next adjustment for backup restore documentation -->
<!-- Capture a cleanup item for backup restore documentation -->
