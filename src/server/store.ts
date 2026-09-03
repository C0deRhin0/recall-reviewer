import "server-only";
import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { config } from "./config";
export function privileged() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export type Envelope<T> = { revision: number; value: T };
export interface Store {
  read<T>(key: string): Promise<Envelope<T> | null>;
  cas<T>(key: string, expected: number, value: T): Promise<boolean>;
}
export class LocalStore implements Store {
  constructor(private directory = join(process.cwd(), "private", "runtime")) {}
  private file(key: string) {
    return join(
      this.directory,
      createHash("sha256").update(key).digest("hex") + ".json",
    );
  }
  async read<T>(key: string): Promise<Envelope<T> | null> {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async cas<T>(key: string, expected: number, value: T) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = this.file(key),
      lock = file + ".lock";
    try {
      await mkdir(lock);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw e;
    }
    try {
      const old = await this.read(key);
      if ((old?.revision ?? 0) !== expected) return false;
      const tmp = file + "." + randomUUID();
      await writeFile(tmp, JSON.stringify({ revision: expected + 1, value }), {
        mode: 0o600,
      });
      await rename(tmp, file);
      return true;
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}
export class ManagedStore implements Store {
  async read<T>(key: string): Promise<Envelope<T> | null> {
    const { data, error } = await privileged().rpc("reviewer_read", {
      document_key: key,
    });
    if (error) throw new Error("Storage unavailable. Please retry.");
    return data as Envelope<T> | null;
  }
  async cas<T>(key: string, expected: number, value: T) {
    const { data, error } = await privileged().rpc("reviewer_write", {
      document_key: key,
      expected_revision: expected,
      document_value: value,
    });
    if (error) throw new Error("Storage unavailable. Please retry.");
    return data === true;
  }
}
export function store(): Store {
  return config().mode === "demo" ? new LocalStore() : new ManagedStore();
}
export async function mutate<T, R>(
  key: string,
  initial: () => T,
  fn: (state: T) => R,
  backend: Store = store(),
): Promise<R> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const record = await backend.read<T>(key);
    const state = record?.value ?? initial();
    const result = fn(state);
    if (await backend.cas(key, record?.revision ?? 0, state)) return result;
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 35));
  }
  throw new Error("This record changed in another request. Please retry.");
}
