import type { Express } from "express";
import { existsSync, readFileSync, mkdtempSync, statSync, readdirSync, rmSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { zipSync, strToU8 } from "fflate";
import { sqlite } from "./storage";
import { confirmPassword } from "./auth";

const PHOTO_DIR = () => resolve(process.env.PHOTO_DIR || "uploads/job-photos");
const RECEIPT_DIR = () => resolve(process.env.RECEIPT_DIR || "uploads/expense-receipts");
// Stored names are always random hex made by the server; anything else is skipped (never a path).
const SAFE_FILE = /^[a-f0-9]{16,64}\.[a-z0-9]{2,5}$/;
const MAX_BYTES = 750 * 1048576; // keeps memory use bounded on the host
const COOLDOWN_MS = 60000;
let busy = false, lastDone = 0;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * One owner-only zip with everything needed to move the business to new hosting:
 *  - database.sqlite: a consistent snapshot (sign-in sessions and rate-limit counters removed;
 *    accounts and their password hashes kept so everyone signs in with the same password),
 *  - job-photos/ and expense-receipts/: every stored file the database points to,
 *  - manifest.json: row counts, money totals and a SHA-256 for every file, used to prove the move is complete.
 * Nothing in the live database is changed.
 */
/** Removes temp folders left behind if the server was stopped mid-backup. */
function reapStale() {
  for (const n of readdirSync(tmpdir())) {
    if (!n.startsWith("mrcc-backup-")) continue;
    const full = join(tmpdir(), n);
    try { if (Date.now() - statSync(full).mtimeMs > 3600000) rmSync(full, { recursive: true, force: true }); } catch { /* skip */ }
  }
}

export function buildFullBackup(now = new Date()) {
  reapStale();
  const work = mkdtempSync(join(tmpdir(), "mrcc-backup-"));
  const snap = join(work, "database.sqlite");
  try {
    sqlite.prepare("VACUUM INTO ?").run(snap);
    const copy = new Database(snap);
    let dbBytes: Buffer, tables: Record<string, number>, totals: Record<string, number>, photos: any[], receipts: any[], schemaVersion: number;
    try {
      copy.exec("DELETE FROM auth_sessions; DELETE FROM auth_rate_limits;");
      const names = (copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as any[]).map(r => r.name as string);
      tables = Object.fromEntries(names.map(n => [n, (copy.prepare(`SELECT count(*) n FROM "${n.replace(/"/g, '""')}"`).get() as any).n]));
      const one = (q: string) => Number((copy.prepare(q).get() as any)?.v ?? 0);
      totals = {
        invoiceTotal: one("SELECT round(coalesce(sum(total),0),2) v FROM invoices"),
        paymentsTotal: one("SELECT round(coalesce(sum(amount),0),2) v FROM payments"),
        expensesTotal: one("SELECT round(coalesce(sum(amount),0),2) v FROM expenses"),
      };
      schemaVersion = one("SELECT coalesce(max(version),0) v FROM schema_migrations");
      photos = copy.prepare("SELECT file_name FROM job_photos").all() as any[];
      receipts = copy.prepare("SELECT file_name FROM expense_receipts").all() as any[];
      copy.exec("VACUUM");
    } finally { copy.close(); }
    dbBytes = readFileSync(snap);

    const files: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]> = {};
    const fileList: { path: string; size: number; sha256: string }[] = [];
    const missing: string[] = [];
    let total = dbBytes.length;
    const add = (folder: string, dir: string, rows: any[]) => {
      for (const { file_name } of rows) {
        const name = String(file_name);
        if (!SAFE_FILE.test(name)) { missing.push(`${folder}/${name.slice(0, 80)}`); continue; }
        const full = join(dir, name);
        if (!existsSync(full) || !lstatSync(full).isFile()) { missing.push(`${folder}/${name}`); continue; }
        total += lstatSync(full).size;
        if (total > MAX_BYTES) throw Object.assign(new Error("The backup is too large to build in one download."), { status: 413 });
        const body = readFileSync(full);
        files[`${folder}/${name}`] = [body, { level: 0 }]; // photos are already compressed
        fileList.push({ path: `${folder}/${name}`, size: body.length, sha256: sha256(body) });
      }
    };
    add("job-photos", PHOTO_DIR(), photos);
    add("expense-receipts", RECEIPT_DIR(), receipts);

    const manifest = {
      format: "mad-river-full-backup", formatVersion: 1, createdAt: now.toISOString(), schemaVersion,
      database: { path: "database.sqlite", size: dbBytes.length, sha256: sha256(dbBytes) },
      tables, totals, files: fileList, missingFiles: missing,
      note: "Sign-in sessions are not included. Password hashes are included so accounts keep the same passwords; keep this file private.",
    };
    files["database.sqlite"] = [dbBytes, { level: 6 }];
    files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    const iso = now.toISOString(), stamp = `${iso.slice(0, 10)} ${iso.slice(11, 13)}-${iso.slice(14, 16)} UTC`;
    return { zip: Buffer.from(zipSync(files)), filename: `Mad River Cleaning Co. - Full Backup ${stamp}.zip`, manifest };
  } finally {
    try { rmSync(work, { recursive: true, force: true }); } catch { /* reaped next time */ }
  }
}

export function registerFullBackup(app: Express) {
  // Owner only (cleaners are stopped by protect()), and the password is asked again.
  app.post("/api/backup/full", (req, res) => {
    const user = res.locals.user;
    if (user?.role !== "owner") return res.status(403).json({ message: "Only the owner can download a full backup." });
    const check = confirmPassword(user.id, req.body?.password, "full-backup");
    if (check === "limited") return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    if (check !== "ok") return res.status(400).json({ message: "That password isn't right." });
    if (busy) return res.status(429).json({ message: "A backup is already being prepared. Try again in a moment." });
    if (Date.now() - lastDone < COOLDOWN_MS) return res.status(429).json({ message: "A backup was just downloaded. Wait a minute before making another." });
    busy = true;
    let built;
    try { built = buildFullBackup(); lastDone = Date.now(); } finally { busy = false; }
    const { zip, filename } = built;
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    });
    res.end(zip);
  });
}
