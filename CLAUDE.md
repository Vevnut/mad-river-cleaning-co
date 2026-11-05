# Mad River Cleaning Co. — guide for AI coding assistants

Property-cleaning, scheduling and invoicing app for a small business. React + TypeScript frontend (Vite, Tailwind, shadcn/ui), Express backend, Postgres (Neon) via `pg` and Drizzle, photos/receipts in a private Vercel Blob store. Hosted on Vercel: `api/index.js` → `dist/server.mjs` (built from `server/vercel.ts`), static site from `dist/public`. See PORT-STATUS.md for the move off SQLite.

- `DATABASE_URL` (Postgres) is required; `BLOB_READ_WRITE_TOKEN` switches file storage to Vercel Blob (otherwise `uploads/`). Raw SQL goes through `server/db.ts` (`db.get/all/run/insertId`, `db.tx`), always `await`ed.
- Tests need no database: each starts an in-process Postgres (PGlite, `tests/pg.ts`) with the demo seed. `script/seed.ts` refuses non-local databases.
- Moving data from the old SQLite app: `npx tsx script/import-sqlite.ts <full-backup.zip>` (refuses a non-empty target without `--replace`; verifies rows, money totals and file checksums).

## Commands

```sh
npm ci            # install
npm run dev       # dev server on port 5000
npm run check     # TypeScript check — must pass before committing
npm run build     # production build to dist/
npx tsx tests/common-services.test.ts   # service catalog / invoice regression tests
npx tsx tests/providers.test.ts         # auth, Stripe and email tests (all mocked)
npx tsx tests/job-photos.test.ts        # Damage / Final Walkthrough photo uploads
npx tsx tests/revenue.test.ts           # monthly and weekly revenue totals
npx tsx tests/invoice-delete.test.ts    # three-step invoice deletion rules
npx tsx tests/invoice-photos.test.ts    # photos on invoices: customer link, PDF, limits, sign-in
npx tsx tests/quotes.test.ts            # rate-sheet quotes: customer link, templates, prospects, invoices and jobs
npx tsx tests/expenses.test.ts          # mileage, supply costs and receipt photos
npx tsx tests/subcontractors.test.ts    # subcontractors, job pay, payments, bed counts
npx tsx tests/upgrade-backup.test.ts    # full DB copy before any pending migration
npx tsx tests/calendar.test.ts          # Google Calendar jobs link + Google events import (no network)
npx tsx tests/data-import.test.ts       # one-time database move (import/data-import.sqlite-import)
npx tsx tests/request-guards.test.ts    # sign-in rate limits, requests with no body, error messages, $ in printed invoices
npx tsx tests/cleaner.test.ts           # cleaner logins: what they can and can't see or change
```

## Layout

- `client/src/` — pages, components, hooks
- `server/` — `routes.ts` (API), `auth.ts` (sign-in, sessions), `billing.ts` (invoices, payments, services), `storage.ts` (database access), `migrations.ts` (schema changes)
- `shared/schema.ts` — database tables and validation shared by client and server
- `script/` — seed and maintenance scripts (the `seed-*` scripts add demo data; do not run them against the real database)

## Rules

- **Business data is not in this repository.** `data.db`, backups, `uploads/` (job photos) and `.env` are ignored and must never be committed.
- **Database changes are additive only.** Add a new numbered block to `server/migrations.ts`. Never drop tables, rebuild tables or run `drizzle-kit push` against real data.
- **Every `/api` route except sign-in, public invoice links and the Stripe webhook requires sign-in.** Keep new private routes behind the `protect()` gate in `server/auth.ts`.
- **Cleaner logins see only their own jobs.** Accounts are `owner` (full access) or `cleaner` (linked to one staff member or one subcontractor; migration 11). `protect()` lets cleaner accounts reach only `/api/cleaner/*` and `/api/logout`, so new private routes are owner-only by default. Cleaner routes live in `server/cleaner.ts`, must check the job is theirs (assigned staff or job subcontractor), and must never return prices, invoices, customer contact details, internal notes, guest names/phones or other cleaners' jobs. Owners manage logins in Settings → Cleaner Logins (`/api/team/cleaners`). Cleaners sign in at `#/crew` (also the home-screen start page, `client/public/manifest.webmanifest`); only cleaner logins may "Keep me signed in" (30-day session, token in localStorage `mrcc.cleaner-session`, resumed via `GET /api/session`). Owner sessions are never saved in the browser.
- **Secrets stay server-side.** Stripe and email keys come from environment variables only (see `.env.example`).
- **API URLs in the frontend use the `__PORT_5000__` placeholder.** The hosting platform rewrites it; don't replace it with a hard-coded URL.
- Expenses (`server/expenses.ts`, `shared/expenses.ts`): mileage uses the IRS business rate for the trip date from `IRS_MILEAGE_RATES` (add new rates there); receipts live in `uploads/expense-receipts`. Profit = revenue minus expenses.
- Subcontractors (`server/subcontractors.ts`, `shared/subcontractors.ts`): one per job via `job_subcontractors`; owed = pay on completed/invoiced jobs minus `subcontractor_payments`. 1099-NEC thresholds live in `NEC_THRESHOLDS` (add a row each year from 2027). Payments count as costs in profit.
- Invoice photos (`server/invoice-photos.ts`, `client/src/components/invoices/invoice-photos.tsx`): shown to the customer on the invoice, PDF and public link, unlike job photos, which stay private. Each photo can carry a note (up to 200 characters) that the customer sees as a caption. Limits are per invoice (6 photos, 3 MB) because the PDF carries them and a Vercel response is capped at 4.5 MB.
- Quotes (`server/quotes.ts`, `client/src/pages/quote*.tsx`, `public-quote.tsx`) are rate sheets: sections of services with text prices ("$25/30 mins") and no total, stored as JSON in `quotes.sections`. Draft, sent, accepted or declined; a sent quote past `valid_until` reads as expired (never stored). Customers answer at `#/quote/<token>`. Editing a sent quote returns it to draft and turns the link off. One accepted quote can make many invoices and jobs: the owner ticks which services apply. A prospect's details live on the quote until the first invoice or job creates the customer (and, for a job, the property). Reusable wording lives in `quote_templates` in the database, not in this public repo. The old `quote_items` table and `quotes` money columns are unused.
- Properties have bed counts by type (`bed_king` … `bed_sofa`); helpers in `shared/beds.ts`.
- Photo/receipt uploads must pass `isJpeg` (server/jpeg.ts, full marker walk) and are served with `IMAGE_HEADERS` (nosniff + sandbox CSP). Test fixture: tests/fixtures/tiny.jpg.
- Migrations: bump `LATEST_MIGRATION` in `server/migrations.ts` with each new one. On startup, any pending upgrade first saves `backups/before-upgrade-v<from>-to-v<to>-<time>.db` (git-ignored).
- Google Calendar (`server/calendar.ts`, `client/src/components/scheduling/google-calendar.tsx`): (1) jobs → Google via a private iCal link `/api/calendar/feed/<48-hex>.ics`, registered BEFORE `protect()`; the token is the only key, reset revokes it; the feed leaves out prices, notes and canceled jobs; times are America/New_York. (2) Google → app by pasting a calendar's "Secret address in iCal format"; only `https://calendar.google.com/calendar/ical/...` is fetched (no redirects, 8 MB / 20 s limits), parsed with ical.js (repeats expanded, 60 days back to 400 ahead) into `calendar_events`, refreshed when older than 15 minutes. Read-only: nothing is written to Google. The published app must stay Public for Google to read the jobs link.
- Revenue is invoice totals by issue date, excluding canceled invoices; weeks run Monday to Sunday (`client/src/lib/revenue.ts`).
- Deleting an invoice takes three steps (review, "I understand", type the invoice number) and saves a full copy in `deleted_invoices`. Invoices with Stripe card payments cannot be deleted.
- Invoices keep the prices saved on them. Changing a service or property price must never change existing invoices.

## Where the app runs

The live app at mad-river-cleaning-co.pplx.app is published from Perplexity Computer, not from this repository. Changes pushed here reach the live app only after they are pulled into Computer, tested in its preview, and published.

More detail: `BILLING-UPGRADE.md`, `COMMON-JOBS.md`, `SOURCE-RECOVERY.md`.
