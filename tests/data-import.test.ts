import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";

// Disposable files only.
const dir = "tests/.data/import-test";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const { runPendingDataImport } = await import("../server/data-import");
let count = 0;
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
function makeDb(path: string, customers: number, users: number, importId?: string) {
  const db = new Database(path);
  db.exec("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE auth_users (id TEXT)");
  for (let i = 0; i < customers; i++) db.prepare("INSERT INTO customers (name) VALUES (?)").run(`C${i}`);
  for (let i = 0; i < users; i++) db.prepare("INSERT INTO auth_users VALUES (?)").run(`u${i}`);
  if (importId) { db.exec("CREATE TABLE data_imports (id TEXT PRIMARY KEY, created_at TEXT)"); db.prepare("INSERT INTO data_imports VALUES (?,?)").run(importId, new Date().toISOString()); }
  db.close();
}
const n = (path: string) => { const db = new Database(path, { readonly: true }); const v = (db.prepare("SELECT count(*) n FROM customers").get() as any).n; db.close(); return v; };
const live = `${dir}/data.db`, file = `${dir}/incoming.sqlite-import`;
makeDb(live, 13, 0);
makeDb(file, 11, 2, "imp-1");
check("no import file means nothing happens", runPendingDataImport(live, `${dir}/missing`) === null && n(live) === 13);
check("an unused live database is replaced", runPendingDataImport(live, file) === "imp-1" && n(live) === 11);
const backups = readdirSync(`${dir}/backups`);
check("the old database is saved first", backups.length === 1 && backups[0].startsWith("before-import-") && n(`${dir}/backups/${backups[0]}`) === 13);
// Simulate new work after the move, then a later restart / republish with the file still there.
const db = new Database(live); db.prepare("INSERT INTO customers (name) VALUES ('new')").run(); db.close();
check("it never runs twice", runPendingDataImport(live, file) === null && n(live) === 12);
const other = `${dir}/other.db`;
makeDb(other, 5, 1);
makeDb(`${dir}/second.sqlite-import`, 1, 0, "imp-2");
check("a database with accounts is never replaced", runPendingDataImport(other, `${dir}/second.sqlite-import`) === null && n(other) === 5);
makeDb(`${dir}/noid.sqlite-import`, 1, 0);
const fresh = `${dir}/fresh.db`; makeDb(fresh, 2, 0);
check("a file without an import id is ignored", runPendingDataImport(fresh, `${dir}/noid.sqlite-import`) === null && n(fresh) === 2);
console.log(`${count} data-import checks passed.`);
