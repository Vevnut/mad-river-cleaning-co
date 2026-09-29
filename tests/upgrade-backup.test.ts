import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";

// Upgrading an older database must first save a full copy of it. Never touches real data.
const dir = "tests/.data/upgrade-backup";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.DATABASE_PATH = `${dir}/data.db`;
const src = new Database("data.db", { readonly: true });
await src.backup(process.env.DATABASE_PATH);
src.close();
// Pretend it is an older version: drop the newest migration markers (tables stay; migrations are idempotent).
const old = new Database(process.env.DATABASE_PATH);
old.prepare("DELETE FROM schema_migrations WHERE version>=8").run();
const customers = (old.prepare("SELECT count(*) n FROM customers").get() as any).n;
old.close();
const { migrate, backupBeforeUpgrade, LATEST_MIGRATION } = await import("../server/migrations");
let n = 0;
const check = (m: string, ok: boolean) => { assert(ok, m); n++; console.log(`PASS ${m}`); };
const db = new Database(process.env.DATABASE_PATH);
migrate(db);
const files = readdirSync(`${dir}/backups`).filter(f => f.startsWith("before-upgrade-v7-to-v"));
check("an older database is copied before upgrading", files.length === 1);
const copy = new Database(`${dir}/backups/${files[0]}`, { readonly: true });
check("the copy has every customer and the old version", (copy.prepare("SELECT count(*) n FROM customers").get() as any).n === customers && (copy.prepare("SELECT max(version) v FROM schema_migrations").get() as any).v === 7);
copy.close();
check("the database is then upgraded", (db.prepare("SELECT max(version) v FROM schema_migrations").get() as any).v === LATEST_MIGRATION);
check("no extra copy when already up to date", backupBeforeUpgrade(db) === null);
const fresh = new Database(":memory:");
fresh.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
check("brand-new empty databases are not copied", backupBeforeUpgrade(fresh) === null);
db.close();
rmSync(dir, { recursive: true, force: true });
console.log(`${n} upgrade-backup checks passed.`);
