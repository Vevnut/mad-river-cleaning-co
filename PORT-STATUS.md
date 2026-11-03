# Vercel + Neon port — status (branch `vercel-neon`)

Goal: run on Vercel with Neon Postgres and Vercel Blob, then move the live data from the
Perplexity-hosted SQLite app (Settings → full backup zip) with a verified cutover.

## Done
- `server/db.ts` — async Postgres layer (`?`/`@name` placeholders, `db.tx` via AsyncLocalStorage,
  PG errors mapped to the old SQLITE_CONSTRAINT_* codes).
- `server/pg-schema.ts` — 1:1 Postgres version of the SQLite layout after migration 11; `TABLES` in FK order.
- `server/migrations.ts` — Postgres runner (baseline = v11, advisory lock, `ensureMigrated()`).
- `shared/schema.ts` — Drizzle pg-core; 1/0 flags via `flag()` custom type.
- `server/storage.ts` — Drizzle node-postgres.
- `server/auth.ts`, `server/billing.ts`, `cleaner`, `subcontractors`, `expenses`, `job-photos`, `calendar`, `routes` — async; `tsc` clean.
- `server/errors.ts` maps raw PG / Drizzle-wrapped errors. `server/full-backup.ts` → 501 (Neon keeps backups).
- `server/files.ts` — private Vercel Blob in production, local folders otherwise; uploads ≤ 4 MB.
- `server/app.ts` + `server/index.ts` (local) + `server/vercel.ts` → `dist/server.mjs` + `api/index.js` + `vercel.json`. `npm run build` OK.
- `script/import-sqlite.ts` — verified end to end on PGlite (rows, FKs at commit, money totals, refuses without --replace).
- Removed demo-cleanup.ts, data-import.ts.

## To do
- Seed script (`script/seed.ts`) to async drizzle; refuse non-local targets.
- Tests: `tests/pg.ts` harness (PGlite socket + migrate + seed); port each test's direct SQL to async;
  drop upgrade-backup / data-import / full-backup tests (SQLite-only).
- Deploy: Vercel project (Hobby for testing), Neon + Blob via Vercel Storage (owner does this), env vars (owner), import, verify, cutover.
