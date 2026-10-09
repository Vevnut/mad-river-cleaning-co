# Mad River Cleaning Co. — guide for AI coding assistants

Property-cleaning, scheduling and invoicing app for a small business. React + TypeScript frontend (Vite, Tailwind, shadcn/ui), Express backend, SQLite via better-sqlite3 and Drizzle.

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
npx tsx tests/expenses.test.ts          # mileage, supply costs and receipt photos
npx tsx tests/subcontractors.test.ts    # subcontractors, job pay, payments, bed counts
npx tsx tests/upgrade-backup.test.ts    # full DB copy before any pending migration
npx tsx tests/calendar.test.ts          # Google Calendar jobs link + Google events import (no network)
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
- **Secrets stay server-side.** Stripe and email keys come from environment variables only (see `.env.example`).
- **API URLs in the frontend use the `__PORT_5000__` placeholder.** The hosting platform rewrites it; don't replace it with a hard-coded URL.
- Expenses (`server/expenses.ts`, `shared/expenses.ts`): mileage uses the IRS business rate for the trip date from `IRS_MILEAGE_RATES` (add new rates there); receipts live in `uploads/expense-receipts`. Profit = revenue minus expenses.
- Subcontractors (`server/subcontractors.ts`, `shared/subcontractors.ts`): one per job via `job_subcontractors`; owed = pay on completed/invoiced jobs minus `subcontractor_payments`. 1099-NEC thresholds live in `NEC_THRESHOLDS` (add a row each year from 2027). Payments count as costs in profit.
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
