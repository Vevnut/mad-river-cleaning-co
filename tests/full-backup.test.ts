import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { errorHandler } from "../server/errors";

// Disposable copy of the database. Never touches real data.
mkdirSync("tests/.data/p", { recursive: true }); mkdirSync("tests/.data/r", { recursive: true });
process.env.DATABASE_PATH = "tests/.data/full-backup.db";
process.env.PHOTO_DIR = "tests/.data/p"; process.env.RECEIPT_DIR = "tests/.data/r";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("backup-test-setup").digest("hex");
const original = new Database("data.db", { readonly: true });
await original.backup(process.env.DATABASE_PATH);
original.close();
const { registerRoutes } = await import("../server/routes");
const { sqlite: db } = await import("../server/storage");
db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use(errorHandler);
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let count = 0;
const check = (m: string, ok: boolean) => { assert(ok, m); count++; console.log(`PASS ${m}`); };
const post = (path: string, body: any, token = "") => fetch(base + path, { method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

try {
  const pw = "Backup-test-only-123";
  const owner = (await (await post("/api/auth/setup", { email: "owner@example.test", password: pw, setupToken: "backup-test-setup" })).json()).token;
  check("owner signs in", !!owner);

  // A stored photo, plus one row pointing at a missing file.
  const job = (db.prepare("SELECT id FROM jobs LIMIT 1").get() as any).id;
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("photo-bytes")]);
  writeFileSync("tests/.data/p/" + "a".repeat(32) + ".jpg", jpg);
  const ins = db.prepare("INSERT INTO job_photos (job_id,section,file_name,original_name,size,created_at,created_by) VALUES (?,?,?,?,?,?,?)");
  ins.run(job, "damage", "a".repeat(32) + ".jpg", "a.jpg", jpg.length, "2026-11-01", "test");
  ins.run(job, "damage", "b".repeat(32) + ".jpg", "b.jpg", 1, "2026-11-01", "test");
  ins.run(job, "damage", "../../etc/passwd", "x.jpg", 1, "2026-11-01", "test");

  check("signed out is refused", (await post("/api/backup/full", { password: pw })).status === 401);
  check("wrong password is refused without signing out", (await post("/api/backup/full", { password: "nope-nope-nope" }, owner)).status === 400);
  check("missing password is refused", (await post("/api/backup/full", {}, owner)).status === 400);

  const staff = (db.prepare("SELECT id FROM staff WHERE active=1 LIMIT 1").get() as any).id;
  const made = await post("/api/team/cleaners", { email: "crew@example.test", password: "Cleaner-test-only-123", staffId: staff }, owner);
  check("cleaner login created", made.status < 300);
  const crew = (await (await post("/api/auth/login", { email: "crew@example.test", password: "Cleaner-test-only-123" })).json()).token;
  check("a cleaner can't download the backup", (await post("/api/backup/full", { password: "Cleaner-test-only-123" }, crew)).status === 403);

  const res = await post("/api/backup/full", { password: pw }, owner);
  check("owner gets a zip", res.status === 200 && res.headers.get("content-type") === "application/zip");
  check("file has a proper name", /^attachment; filename="Mad River Cleaning Co\. - Full Backup \d{4}-\d\d-\d\d \d\d-\d\d UTC\.zip"$/.test(res.headers.get("content-disposition") || ""));
  check("not cached", (res.headers.get("cache-control") || "").includes("no-store"));
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
  check("photo is inside with matching checksum", Buffer.from(zip["job-photos/" + "a".repeat(32) + ".jpg"]).equals(jpg)
    && manifest.files[0].sha256 === createHash("sha256").update(jpg).digest("hex"));
  check("missing file is reported", manifest.missingFiles.includes("job-photos/" + "b".repeat(32) + ".jpg"));
  check("unsafe file names are never read", !Object.keys(zip).some(k => k.includes("..")) && manifest.missingFiles.some((m: string) => m.includes("passwd")));
  check("database checksum matches", createHash("sha256").update(zip["database.sqlite"]).digest("hex") === manifest.database.sha256);

  writeFileSync("tests/.data/out.db", zip["database.sqlite"]);
  const out = new Database("tests/.data/out.db", { readonly: true });
  check("snapshot is healthy", out.pragma("integrity_check", { simple: true }) === "ok");
  check("snapshot has no sign-in sessions", (out.prepare("SELECT count(*) n FROM auth_sessions").get() as any).n === 0);
  check("snapshot keeps the accounts", (out.prepare("SELECT count(*) n FROM auth_users").get() as any).n === 2);
  const live = (t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as any).n;
  for (const t of ["customers", "properties", "jobs", "invoices", "invoice_items", "payments", "expenses", "staff", "job_photos"])
    check(`${t} count matches (${live(t)})`, (out.prepare(`SELECT count(*) n FROM ${t}`).get() as any).n === live(t) && manifest.tables[t] === live(t));
  out.close();
  check("live sessions untouched", live("auth_sessions") >= 2);

  for (let i = 0; i < 10; i++) await post("/api/backup/full", { password: "wrong-wrong-wrong" }, owner);
  check("password guessing is limited", (await post("/api/backup/full", { password: pw }, owner)).status === 429);
  console.log(`\n${count} checks passed`);
} finally { server.close(); }
