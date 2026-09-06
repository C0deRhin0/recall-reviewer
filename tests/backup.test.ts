import { it, expect } from "vitest";
import { encrypt, decrypt } from "../scripts/backup.mjs";
import { randomBytes } from "node:crypto";
it("encrypts, authenticates and restores backup payloads without exposing clear text", () => {
  const key = randomBytes(32),
    payload = {
      kind: "local-reviewer-documents",
      files: {
        sample: {
          revision: 2,
          value: { privateQuestion: "A confidential question", score: 4 },
        },
      },
    };
  const encrypted = encrypt(payload, key);
  expect(encrypted).not.toContain("confidential");
  expect(decrypt(encrypted, key)).toEqual(payload);
  expect(() => decrypt(encrypted, randomBytes(32))).toThrow();
  const tampered = JSON.parse(encrypted);
  tampered.data = Buffer.from("tampered").toString("base64");
  expect(() => decrypt(JSON.stringify(tampered), key)).toThrow();
});

it("restores an encrypted archive into a fresh directory and excludes session credentials", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, readdir, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const root = await mkdtemp(join(tmpdir(), "recall-restore-"));
  try {
    const source = join(root, "source");
    await mkdir(source);
    const filename = "a".repeat(64) + ".json";
    const record = {
      revision: 7,
      value: { score: 4, attempts: ["synthetic"] },
    };
    await writeFile(join(source, filename), JSON.stringify(record));
    await writeFile(
      join(source, "b".repeat(64) + ".json"),
      JSON.stringify({
        revision: 1,
        value: { accessToken: "synthetic-session-secret" },
      }),
    );
    const archive = join(root, "archive.backup");
    const env = {
      ...process.env,
      REVIEWER_BACKUP_KEY: randomBytes(32).toString("base64"),
    };
    const created = spawnSync(
      process.execPath,
      ["scripts/backup.mjs", "create", source, archive],
      { env, encoding: "utf8" },
    );
    expect(created.status, created.stderr).toBe(0);
    const restored = join(root, "restored");
    const result = spawnSync(
      process.execPath,
      ["scripts/backup.mjs", "restore", archive, restored],
      { env, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(await readdir(restored)).toEqual([filename]);
    expect(
      JSON.parse(await readFile(join(restored, filename), "utf8")),
    ).toEqual(record);
    const overwrite = spawnSync(
      process.execPath,
      ["scripts/backup.mjs", "restore", archive, restored],
      { env, encoding: "utf8" },
    );
    expect(overwrite.status).not.toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
// Align local documentation for backup test module
