import Database from "better-sqlite3";
import { existsSync, mkdirSync, copyFileSync, unlinkSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * One-time move of a full database onto this server (used to bring the preview's
 * real data onto the live app). Runs BEFORE the database is opened.
 *
 * It only happens when ALL of these hold:
 *  - `import/data-import.sqlite-import` exists next to the app,
 *  - that file is a healthy database carrying a `data_imports` row (its import id),
 *  - the current database has NO sign-in accounts (so a database in use is never replaced),
 *  - the current database has not already received that import id.
 * Before replacing anything it saves a full copy to backups/before-import-<time>.db;
 * if that copy fails, nothing changes.
 */
export function runPendingDataImport(dbPath = process.env.DATABASE_PATH || "data.db", importFile = join(process.cwd(), "import", "data-import.sqlite-import")) {
  if (!existsSync(importFile)) return null;
  const incoming = new Database(importFile, { readonly: true, fileMustExist: true });
  let importId: string | undefined;
  try {
    if ((incoming.pragma("integrity_check", { simple: true }) as string) !== "ok") { console.log("Data import skipped: import file failed its integrity check."); return null; }
    importId = (incoming.prepare("SELECT id FROM data_imports ORDER BY created_at DESC LIMIT 1").get() as any)?.id;
  } catch { console.log("Data import skipped: import file has no import id."); return null; }
  finally { incoming.close(); }
  if (!importId) return null;

  if (existsSync(dbPath)) {
    const current = new Database(dbPath, { fileMustExist: true });
    try {
      const has = (t: string) => !!current.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (has("data_imports") && current.prepare("SELECT 1 FROM data_imports WHERE id=?").get(importId)) return null; // already done
      if (has("auth_users") && current.prepare("SELECT 1 FROM auth_users LIMIT 1").get()) {
        console.log("Data import skipped: this database already has sign-in accounts, so it is in use.");
        return null;
      }
      const dir = join(dirname(dbPath), "backups");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const backup = join(dir, `before-import-${Date.now()}.db`);
      current.prepare("VACUUM INTO ?").run(backup);
      console.log(`Saved a full database backup before importing: ${backup}`);
    } finally { current.close(); }
    for (const ext of ["-wal", "-shm", "-journal"]) if (existsSync(dbPath + ext)) unlinkSync(dbPath + ext);
  }
  copyFileSync(importFile, dbPath);
  try { chmodSync(dbPath, 0o600); } catch { /* best effort */ }
  console.log(`Imported database ${importId}.`);
  return importId;
}

runPendingDataImport();
