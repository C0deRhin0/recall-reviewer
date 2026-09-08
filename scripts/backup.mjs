import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
export function encrypt(payload, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload)),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
export function decrypt(raw, key) {
  const value = JSON.parse(raw);
  if (value.version !== 1) throw new Error("Unsupported backup version");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64"),
  );
  cipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(value.data, "base64")),
      cipher.final(),
    ]).toString(),
  );
}
async function main() {
  const [action, input, output] = process.argv.slice(2);
  const key = Buffer.from(process.env.REVIEWER_BACKUP_KEY || "", "base64");
  if (key.length !== 32)
    throw new Error(
      "Set REVIEWER_BACKUP_KEY to a private base64-encoded 32-byte key.",
    );
  if (action === "create") {
    if (!input || !output)
      throw new Error(
        "Usage: node scripts/backup.mjs create private/runtime backups/local.backup",
      );
    const files = {};
    for (const name of await readdir(input)) {
      if (/^[a-f0-9]{64}\.json$/.test(name)) {
        const record = JSON.parse(await readFile(resolve(input, name), "utf8"));
        if (record.value?.accessToken !== undefined) continue;
        files[name] = record;
      }
    }
    const archive = encrypt(
      {
        createdAt: new Date().toISOString(),
        kind: "local-reviewer-documents",
        files,
      },
      key,
    );
    await mkdir(resolve(output, ".."), { recursive: true, mode: 0o700 });
    await writeFile(output, archive, { flag: "wx", mode: 0o600 });
    console.log("Encrypted backup created. Session credentials excluded.");
  } else if (action === "restore") {
    if (!input || !output)
      throw new Error(
        "Usage: node scripts/backup.mjs restore backups/local.backup private/restore-check",
      );
    const payload = decrypt(await readFile(input, "utf8"), key);
    if (payload.kind !== "local-reviewer-documents")
      throw new Error("Unexpected archive kind.");
    await mkdir(output, { recursive: false, mode: 0o700 });
    for (const [name, value] of Object.entries(payload.files)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name) || basename(name) !== name)
        throw new Error("Invalid archive path.");
      await writeFile(resolve(output, name), JSON.stringify(value), {
        flag: "wx",
        mode: 0o600,
      });
    }
    console.log(
      "Restored into a new isolated directory. Existing runtime data was not overwritten.",
    );
  } else throw new Error("Choose create or restore.");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });


