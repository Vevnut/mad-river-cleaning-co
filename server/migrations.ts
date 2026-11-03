import { randomUUID } from "node:crypto";
import { db } from "./db";
import { BASELINE_SQL, BASELINE_VERSION } from "./pg-schema";

/** Highest migration version below. Bump when adding a migration. */
export const LATEST_MIGRATION = 11;

/**
 * Additive Postgres migrations. Versions 1–11 were the SQLite migrations; a new database
 * gets their combined result in one step (server/pg-schema.ts) and records them as applied.
 * Add new changes as `{ version: 12, sql: "ALTER TABLE ... ADD COLUMN ..." }` and bump
 * LATEST_MIGRATION. Never drop or rebuild tables against real data.
 *
 * Backups: Neon keeps point-in-time history, so a bad migration is undone by restoring the
 * database to just before it (Neon console → Branches → Restore). Take a named branch first
 * for anything risky.
 */
const MIGRATIONS: { version: number; sql: string }[] = [];

// Any number for the advisory lock, as long as it's always the same one.
const LOCK = 4711_2026;

export async function migrate() {
  await db.tx(async () => {
    // Two cold-starting server instances must not migrate at the same time.
    await db.get("SELECT pg_advisory_xact_lock(?)", LOCK);
    await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version bigint PRIMARY KEY, applied_at text NOT NULL)");
    const current = Number((await db.get("SELECT coalesce(max(version),0) v FROM schema_migrations"))!.v);
    if (current < BASELINE_VERSION) {
      const existing = await db.get("SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='customers'");
      if (existing) throw new Error("Database has tables but no migration record. Refusing to touch it; check DATABASE_URL.");
      await db.exec(BASELINE_SQL);
      for (let v = 1; v <= BASELINE_VERSION; v++) await db.run("INSERT INTO schema_migrations VALUES (?,?)", v, new Date().toISOString());
    }
    for (const m of MIGRATIONS.filter((m) => m.version > Math.max(current, BASELINE_VERSION)).sort((a, b) => a.version - b.version)) {
      await db.exec(m.sql);
      await db.run("INSERT INTO schema_migrations VALUES (?,?)", m.version, new Date().toISOString());
    }
    if (!(await db.get("SELECT 1 FROM organization"))) await db.run("INSERT INTO organization VALUES (?,1)", randomUUID());
  });
}

let ready: Promise<void> | null = null;
/** Migrates once per server instance; later calls wait on the same run. Retries after a failure. */
export function ensureMigrated(): Promise<void> {
  return (ready ??= migrate().catch((err) => { ready = null; throw err; }));
}
