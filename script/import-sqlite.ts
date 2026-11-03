/**
 * Moves a Mad River SQLite database into Postgres (Neon), with photos and receipts.
 *
 *   npx tsx script/import-sqlite.ts <backup.zip | database.sqlite> [--replace]
 *
 * Reads DATABASE_URL (target Postgres) and, for files, BLOB_READ_WRITE_TOKEN (Vercel Blob)
 * or PHOTO_DIR / RECEIPT_DIR (local folders). The zip is the owner's "full backup" from the
 * old app (database.sqlite + job-photos/ + expense-receipts/ + manifest.json).
 *
 * Safe by default: refuses to touch a database that already has business data unless
 * --replace is given. Everything is copied in ONE transaction (all links checked at commit),
 * then row counts, money totals and every file's SHA-256 are checked against the source and
 * the backup's manifest. Any mismatch exits non-zero.
 */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import { db, closePool } from "../server/db";
import { migrate, LATEST_MIGRATION } from "../server/migrations";
import { TABLES } from "../server/pg-schema";
import { saveFile, loadFile, SAFE_NAME, type Bucket } from "../server/files";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const BUSINESS = ["customers", "properties", "jobs", "invoices", "payments", "expenses", "auth_users"];
const MONEY: [string, string, string][] = [
  ["invoices", "total", "invoiceTotal"], ["invoices", "amount_paid", ""], ["payments", "amount", "paymentsTotal"],
  ["expenses", "amount", "expensesTotal"], ["subcontractor_payments", "amount", ""], ["job_subcontractors", "pay", ""],
];

export type ImportReport = { tables: Record<string, number>; files: number; problems: string[] };

/** Copies the SQLite database at `sqlitePath` into the Postgres at DATABASE_URL. */
export async function importSqlite(sqlitePath: string, opts: { replace?: boolean; fileSource?: (folder: Bucket, name: string) => Buffer | null; manifest?: any; log?: (s: string) => void } = {}): Promise<ImportReport> {
  const log = opts.log ?? console.log;
  const problems: string[] = [];
  const src = new Database(sqlitePath, { readonly: true });
  try {
    const srcTables = new Set((src.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map(r => r.name));
    const srcVersion = Number((src.prepare("SELECT coalesce(max(version),0) v FROM schema_migrations").get() as any).v);
    if (srcVersion !== LATEST_MIGRATION) throw new Error(`The SQLite database is at schema version ${srcVersion}; this app expects ${LATEST_MIGRATION}. Update one side first.`);
    const unknown = Array.from(srcTables).filter(t => t !== "schema_migrations" && !t.startsWith("sqlite_") && !(TABLES as readonly string[]).includes(t));
    if (unknown.length) throw new Error(`The SQLite database has tables this app doesn't know: ${unknown.join(", ")}. Nothing was copied.`);

    await migrate();
    const busy = [];
    for (const t of BUSINESS) if (Number((await db.get(`SELECT count(*) n FROM ${t}`))!.n) > 0) busy.push(t);
    if (busy.length && !opts.replace) throw new Error(`The target database already has data (${busy.join(", ")}). Re-run with --replace to overwrite it. Nothing was copied.`);

    const counts: Record<string, number> = {};
    await db.tx(async () => {
      await db.exec("SET CONSTRAINTS ALL DEFERRED");
      for (const t of [...TABLES].reverse()) await db.run(`DELETE FROM ${t}`);
      for (const t of TABLES) {
        if (!srcTables.has(t)) { counts[t] = 0; continue; }
        const pgCols = new Set((await db.all("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?", t)).map(r => r.column_name));
        const srcCols = (src.prepare(`PRAGMA table_info("${t}")`).all() as any[]).map(c => c.name as string);
        const lost = srcCols.filter(c => !pgCols.has(c));
        if (lost.length) throw new Error(`${t} has columns Postgres doesn't: ${lost.join(", ")}. Nothing was copied.`);
        const rows = src.prepare(`SELECT ${srcCols.map(c => `"${c}"`).join(",")} FROM "${t}"`).raw().all() as any[][];
        // Batches stay well under Postgres's 65,535-parameter limit.
        const per = Math.max(1, Math.floor(30000 / srcCols.length));
        for (let i = 0; i < rows.length; i += per) {
          const batch = rows.slice(i, i + per);
          const values = batch.map(() => `(${srcCols.map(() => "?").join(",")})`).join(",");
          await db.run(`INSERT INTO ${t} (${srcCols.join(",")}) OVERRIDING SYSTEM VALUE VALUES ${values}`, ...batch.flat());
        }
        counts[t] = rows.length;
        if (pgCols.has("id") && srcCols.includes("id")) {
          const seq = (await db.get("SELECT pg_get_serial_sequence(?, 'id') s", t))?.s;
          if (seq) await db.get(`SELECT setval(?, GREATEST((SELECT max(id) FROM ${t}), 1), (SELECT max(id) FROM ${t}) IS NOT NULL)`, seq);
        }
      }
    });
    log(`Copied ${Object.values(counts).reduce((a, b) => a + b, 0)} rows across ${TABLES.length} tables.`);

    // ---- Verify against the source and the manifest ----
    for (const t of TABLES) {
      const pgCount = Number((await db.get(`SELECT count(*) n FROM ${t}`))!.n);
      if (pgCount !== counts[t]) problems.push(`${t}: ${counts[t]} rows in the backup but ${pgCount} in Postgres`);
      const listed = opts.manifest?.tables?.[t];
      if (listed !== undefined && Number(listed) !== pgCount) problems.push(`${t}: manifest says ${listed} rows, Postgres has ${pgCount}`);
    }
    for (const [t, col, key] of MONEY) {
      if (!srcTables.has(t)) continue;
      const a = Math.round(Number((src.prepare(`SELECT coalesce(sum(${col}),0) v FROM ${t}`).get() as any).v) * 100);
      const b = Math.round(Number((await db.get(`SELECT coalesce(sum(${col}),0) v FROM ${t}`))!.v) * 100);
      if (a !== b) problems.push(`${t}.${col}: $${a / 100} in the backup but $${b / 100} in Postgres`);
      if (key && opts.manifest?.totals?.[key] !== undefined && Math.round(Number(opts.manifest.totals[key]) * 100) !== b)
        problems.push(`${t}.${col}: manifest says $${opts.manifest.totals[key]}, Postgres has $${b / 100}`);
    }

    // ---- Photos and receipts ----
    let files = 0;
    const want = new Map<string, string>((opts.manifest?.files ?? []).map((f: any) => [f.path, f.sha256]));
    for (const [table, bucket] of [["job_photos", "job-photos"], ["expense_receipts", "expense-receipts"]] as [string, Bucket][]) {
      if (!srcTables.has(table)) continue;
      for (const { file_name } of src.prepare(`SELECT file_name FROM ${table}`).all() as any[]) {
        const name = String(file_name);
        if (!SAFE_NAME.test(name)) { problems.push(`${bucket}/${name}: unsafe file name, skipped`); continue; }
        const body = opts.fileSource?.(bucket, name) ?? null;
        if (!body) { problems.push(`${bucket}/${name}: missing from the backup`); continue; }
        const expected = want.get(`${bucket}/${name}`);
        if (expected && expected !== sha256(body)) { problems.push(`${bucket}/${name}: damaged (checksum doesn't match the manifest)`); continue; }
        const existing = await loadFile(bucket, name);
        if (existing) { if (sha256(existing) !== sha256(body)) problems.push(`${bucket}/${name}: a different file with this name is already stored`); }
        else await saveFile(bucket, name, body);
        const stored = await loadFile(bucket, name);
        if (!stored || sha256(stored) !== sha256(body)) problems.push(`${bucket}/${name}: didn't read back correctly after upload`);
        else files++;
      }
    }
    for (const m of opts.manifest?.missingFiles ?? []) problems.push(`${m}: was already missing on the old host`);
    log(`Stored ${files} photos and receipts.`);
    return { tables: counts, files, problems };
  } finally {
    src.close();
  }
}

// ---- Command line ----
async function main() {
  const args = process.argv.slice(2);
  const input = args.find(a => !a.startsWith("--"));
  if (!input) { console.error("Usage: npx tsx script/import-sqlite.ts <backup.zip | database.sqlite> [--replace]"); process.exit(2); }
  const path = resolve(input);
  let sqlitePath = path, manifest: any, fileSource: ((f: Bucket, n: string) => Buffer | null) | undefined, work = "";
  if (path.toLowerCase().endsWith(".zip")) {
    console.log(`Reading ${path} (${Math.round(statSync(path).size / 1048576)} MB)...`);
    const entries = unzipSync(readFileSync(path));
    if (!entries["database.sqlite"] || !entries["manifest.json"]) throw new Error("This zip isn't a Mad River full backup (no database.sqlite / manifest.json).");
    manifest = JSON.parse(Buffer.from(entries["manifest.json"]).toString("utf8"));
    if (manifest.database?.sha256 && manifest.database.sha256 !== sha256(entries["database.sqlite"])) throw new Error("database.sqlite doesn't match the manifest's checksum; the zip is damaged.");
    work = mkdtempSync(join(tmpdir(), "mrcc-import-"));
    sqlitePath = join(work, "database.sqlite");
    writeFileSync(sqlitePath, entries["database.sqlite"]);
    fileSource = (folder, name) => (entries[`${folder}/${name}`] ? Buffer.from(entries[`${folder}/${name}`]) : null);
    console.log(`Backup made ${manifest.createdAt}, schema version ${manifest.schemaVersion}.`);
  } else {
    // A bare database: look for photos next to it (old uploads/ layout).
    const base = resolve(path, "..");
    fileSource = (folder, name) => { const f = join(base, "uploads", folder, name); return existsSync(f) ? readFileSync(f) : null; };
  }
  console.log(`Target: ${new URL(process.env.DATABASE_URL || "postgres://unset").host} | files: ${process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "local folders"}`);
  try {
    const report = await importSqlite(sqlitePath, { replace: args.includes("--replace"), manifest, fileSource });
    if (report.problems.length) {
      console.error(`\n${report.problems.length} problem(s):\n - ${report.problems.join("\n - ")}`);
      process.exitCode = 1;
    } else console.log("\nAll rows, money totals and files match the backup.");
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
    await closePool();
  }
}

if (process.argv[1] && /import-sqlite\.ts$/.test(process.argv[1])) main().catch(async (err) => { console.error(err.message || err); await closePool(); process.exit(1); });
