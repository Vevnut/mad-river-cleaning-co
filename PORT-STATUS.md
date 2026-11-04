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

- `script/seed.ts` is async and refuses non-local targets. Tests run on PGlite (`tests/pg.ts`): 288 checks pass; `providers.test.ts` fails as it did before the port.

## Deployment
- Vercel project `mad-river-cleaning-co`, team Bradleys Boat Care, Hobby plan, production branch `vercel-neon`.
- Address: https://mad-river-cleaning-co.vercel.app
- Database: new Neon `mad-river-db` (long-lab-11925291), connected as `DATABASE_URL`. Live data imported 2026-11-04 from the 05:01 UTC backup: 997 rows, 12,701 values compared against the backup with 0 differences.
- Files: private Blob store `mad-river-cleaning-co-blob` (store_vN32GbyprSNdCdKZ, iad1), connected as `BLOB_READ_WRITE_TOKEN`.
- Do not connect this project to `neon-pink-window`: that is the Parts Room live database.

## To do
1. Owner enters secrets in Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `INVOICE_FROM_EMAIL`.
2. Owner keeps the old app frozen until cutover, then tests sign-in on the live address. A later re-import needs a fresh backup and `--replace`, which erases anything entered on the new site.
3. Cutover: Stripe webhook URL, re-add the Google Calendar link, send cleaners the new link, handle old invoice links.
4. Upgrade to Vercel Pro before real business use (Hobby is non-commercial).
5. Decide on merging to `master`. After that, Perplexity Computer can't publish it (no `DATABASE_URL`).
