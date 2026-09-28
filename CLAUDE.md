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
- Revenue is invoice totals by issue date, excluding canceled invoices; weeks run Monday to Sunday (`client/src/lib/revenue.ts`).
- Invoices keep the prices saved on them. Changing a service or property price must never change existing invoices.

## Where the app runs

The live app at mad-river-cleaning-co.pplx.app is published from Perplexity Computer, not from this repository. Changes pushed here reach the live app only after they are pulled into Computer, tested in its preview, and published.

More detail: `BILLING-UPGRADE.md`, `COMMON-JOBS.md`, `SOURCE-RECOVERY.md`.
