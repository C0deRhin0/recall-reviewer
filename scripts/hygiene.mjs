import { mkdtemp, readFile, lstat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = resolve(process.argv[2] || process.cwd());
const temporary = await mkdtemp(join(tmpdir(), "recall-source-audit-"));
const leaks = [];
function git(args, options = {}) {
  const result = spawnSync(
    "git",
    ["-c", "core.excludesFile=/dev/null", ...args],
    {
      cwd: root,
      encoding: "utf8",
      ...options,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1)
    throw new Error("Unable to inspect Git's publishable file list.");
  return result;
}
const entries = (text) => text.split("\0").filter(Boolean);
const requiredExclusions = [
  ".env.local",
  ".env.production",
  ".vercel/project.json",
  ".supabase/config.json",
  "supabase/.temp/project-ref",
  "supabase/.branches/current",
  "private/runtime/progress.json",
  "content/private/bank.json",
  "content/production/bank.json",
  "backups/exam.backup",
  "imports/questions.csv",
  "exports/progress.json",
  "node_modules/package/index.js",
  ".next/server/app.js",
  "test-results/session.png",
  "playwright-report/index.html",
  "credentials.pem",
  "credentials.key",
  "credentials.p12",
  ".npmrc",
  ".netrc",
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/,
  /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/,
  /sk_(?:live|proj)_[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/,
  /https:\/\/[a-z0-9]{20}\.supabase\.co\b/,
];
try {
  git(["init", "--quiet", temporary]);
  const isolated = [
    "--git-dir=" + join(temporary, ".git"),
    "--work-tree=" + root,
  ];
  const ignored = new Set(
    entries(
      git([...isolated, "check-ignore", "--no-index", "-z", "--stdin"], {
        input: requiredExclusions.join("\0") + "\0",
      }).stdout,
    ),
  );
  for (const path of requiredExclusions)
    if (!ignored.has(path)) leaks.push(".gitignore does not exclude " + path);

  const publicFiles = entries(
    git([...isolated, "ls-files", "--others", "--exclude-standard", "-z"])
      .stdout,
  );
  const probe = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  });
  const tracked =
    probe.status === 0
      ? entries(git(["ls-files", "--cached", "-z", "--", "."]).stdout)
      : [];
  if (tracked.length) {
    const trackedPrivate = entries(
      git([...isolated, "check-ignore", "--no-index", "-z", "--stdin"], {
        input: tracked.join("\0") + "\0",
      }).stdout,
    );
    for (const path of trackedPrivate)
      leaks.push("Ignored file is already tracked: " + path);
    for (const path of tracked) {
      const staged = git(["show", ":./" + path]).stdout;
      if (secretPatterns.some((pattern) => pattern.test(staged)))
        leaks.push("Possible credential in staged content: " + path);
    }
  }
  const candidates = [...new Set([...publicFiles, ...tracked])];
  for (const path of candidates) {
    const file = join(root, path);
    let stat;
    try {
      stat = await lstat(file);
    } catch (error) {
      if (error.code === "ENOENT") {
        leaks.push("Tracked file missing from working tree: " + path);
        continue;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      leaks.push("Review symbolic link before publishing: " + path);
      continue;
    }
    if (!stat.isFile()) continue;
    const content = await readFile(file, "utf8");
    if (secretPatterns.some((pattern) => pattern.test(content)))
      leaks.push("Possible credential or live project reference: " + path);
  }
  if (!candidates.includes(".env.example"))
    leaks.push("Missing publishable .env.example");
  if (leaks.length) {
    console.error("Repository hygiene failed:\n" + leaks.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Source hygiene passed: ${candidates.length} publishable files checked; private paths excluded. No matching credentials or live project references found.`,
    );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
