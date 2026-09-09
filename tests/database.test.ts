import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
it("PostgreSQL denies browser roles, protects private tables, and atomically rejects stale writes", async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.sessions(id uuid, user_id uuid);",
  );
  await db.exec(await readFile("supabase/migrations/001_reviewer.sql", "utf8"));
  await db.exec("set role anon");
  await expect(
    db.query("select public.reviewer_read('bank:production')"),
  ).rejects.toThrow(/permission denied/);
  await db.exec("reset role; set role authenticated");
  await expect(
    db.query("select public.reviewer_write('user:another-user',0,'{}')"),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query("select * from reviewer_private.documents"),
  ).rejects.toThrow(/permission denied/);
  await db.exec("reset role; set role service_role");
  const first = await db.query<{ reviewer_write: boolean }>(
    "select public.reviewer_write('user:test',0,'{\"score\":1}')",
  );
  expect(first.rows[0].reviewer_write).toBe(true);
  const stale = await db.query<{ reviewer_write: boolean }>(
    "select public.reviewer_write('user:test',0,'{\"score\":99}')",
  );
  expect(stale.rows[0].reviewer_write).toBe(false);
  const value = await db.query<{
    reviewer_read: { revision: number; value: { score: number } };
  }>("select public.reviewer_read('user:test')");
  expect(value.rows[0].reviewer_read.value.score).toBe(1);
  await expect(
    db.query("select * from reviewer_private.documents"),
  ).rejects.toThrow(/permission denied/);
  await db.close();
}, 20000);
// Refine the surrounding context for database test module
// Align local documentation for database test module
