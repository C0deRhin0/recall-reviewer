import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const roots: string[] = [];
const auditScript = resolve("scripts/hygiene.mjs");
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "recall-hygiene-test-"));
  roots.push(root);
  await copyFile(".gitignore", join(root, ".gitignore"));
  await writeFile(join(root, ".env.example"), "APP_MODE=demo\n");
  return root;
}
function audit(root: string) {
  return spawnSync(process.execPath, [auditScript, root], { encoding: "utf8" });
}
function git(root: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}
const fakeToken = "sb_" + "secret_" + "x".repeat(30);
it("scans publishable content while excluding local environment values", async () => {
  const root = await fixture();
  await writeFile(join(root, ".env.local"), "TOKEN=" + fakeToken);
  expect(audit(root).status).toBe(0);
  await writeFile(join(root, "accidental-secret.txt"), fakeToken);
  const result = audit(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("accidental-secret.txt");
  expect(result.stderr).not.toContain(fakeToken);
});
it("rejects force-tracked private files and credentials left in the index", async () => {
  const root = await fixture();
  git(root, "init", "--quiet");
  await writeFile(join(root, ".env.local"), "LOCAL_SETTING=private");
  git(root, "add", "-f", ".env.local");
  expect(audit(root).stderr).toContain(
    "Ignored file is already tracked: .env.local",
  );
  await writeFile(join(root, "settings.txt"), fakeToken);
  git(root, "add", "settings.txt");
  await writeFile(join(root, "settings.txt"), "Working tree is now clean.");
  const result = audit(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Possible credential in staged content: settings.txt",
  );
  expect(result.stderr).not.toContain(fakeToken);
});
it("fails when private-content ignore rules are removed", async () => {
  const root = await fixture();
  const ignore = await readFile(join(root, ".gitignore"), "utf8");
  await writeFile(
    join(root, ".gitignore"),
    ignore.replace("content/production/", ""),
  );
  const result = audit(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    ".gitignore does not exclude content/production/bank.json",
  );
});
// Review follow-up details for hygiene test module
// Refine the surrounding context for hygiene test module
