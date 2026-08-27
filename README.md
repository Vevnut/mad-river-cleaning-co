# Mad River Cleaning Co.

Operations software for a White Mountains, NH turnover-cleaning company
serving Airbnb hosts, vacation-rental managers, and recurring residential
clients. **Phases 1-3 are complete** — every page and table in the master
spec is built and wired end-to-end. See `ROADMAP.md` for what's *next*
(Phase 2 of the business, not of this build): SMS/email reminders, Stripe
payments, a cleaner/customer portal, real auth, etc.

## Folder structure

```
cleanops-app/
├── client/                       # React frontend (Vite)
│   ├── index.html                # Fontshare font links, meta tags
│   └── src/
│       ├── App.tsx                # Router + sidebar/header shell
│       ├── index.css              # Brand palette (HSL vars), base styles
│       ├── components/
│       │   ├── app-sidebar.tsx    # shadcn Sidebar, all 8 nav sections
│       │   ├── app-header.tsx     # Global search, theme toggle, quick actions
│       │   ├── global-search.tsx  # Cross-entity search (customers/properties/jobs/invoices)
│       │   ├── logo.tsx           # Inline SVG ridge-line mark
│       │   ├── status-badge.tsx   # Shared job/invoice status badge (color-coded)
│       │   ├── notes-panel.tsx    # Reusable notes list + add-note form
│       │   ├── theme-provider.tsx # Light/dark context (no localStorage)
│       │   ├── customers/         # Customer-domain forms (create/edit dialog)
│       │   ├── properties/        # Property-domain forms
│       │   ├── jobs/              # Job create/edit dialog (template, checklist, staff)
│       │   ├── scheduling/        # Calendar job chip + job detail popover
│       │   ├── invoices/          # Line-items editor, record-payment dialog
│       │   ├── settings/          # Job-template dialog, staff dialog
│       │   └── ui/                # shadcn/ui primitives (do not hand-edit)
│       ├── pages/
│       │   ├── dashboard.tsx      # KPI cards, today's jobs, revenue chart
│       │   ├── customers-list.tsx / customer-detail.tsx
│       │   ├── properties-list.tsx / property-detail.tsx
│       │   ├── scheduling.tsx     # Day/Week/Month calendar views
│       │   ├── jobs-list.tsx / job-detail.tsx
│       │   ├── invoices-list.tsx / invoice-detail.tsx / invoice-new.tsx
│       │   ├── reports.tsx        # Revenue, jobs-by-property, overdue, top customers
│       │   ├── settings.tsx       # Business info, invoice defaults, templates, staff, notifications
│       │   ├── coming-soon.tsx    # Generic stub (unused now; kept for future sections)
│       │   └── not-found.tsx
│       └── lib/                   # queryClient, cn(), format helpers, csv-export
├── server/
│   ├── index.ts                   # Express bootstrap (do not modify)
│   ├── routes.ts                  # All /api/* routes (full CRUD, all 14 tables)
│   ├── storage.ts                 # IStorage interface + SQLite (Drizzle) implementation
│   ├── invoice-utils.ts           # Invoice-number generation, totals/status recompute
│   ├── invoice-print-template.ts  # Print-ready payload (invoice + items + business info)
│   └── vite.ts                    # Dev/prod static serving (do not modify)
├── shared/
│   └── schema.ts                  # Drizzle tables (14) + drizzle-zod schemas + types
├── script/
│   ├── seed.ts                    # Sample data seed script (idempotent)
│   └── build.ts                   # Production build script
├── SCHEMA.md                      # Full table plan, all 14 tables (markdown)
├── postgres_migration.sql         # Postgres/Supabase target DDL, all 14 tables
├── ROADMAP.md                     # Phase 1-3 history + forward-looking roadmap
└── data.db                        # SQLite database file (gitignored data, schema tracked via drizzle-kit)
```

## Running locally

```bash
npm install
npx drizzle-kit push       # create/sync SQLite tables from shared/schema.ts
npx tsx script/seed.ts      # populate sample customers/properties/jobs/invoices/etc.
npm run dev                 # starts Express + Vite on port 5000
```

In this sandboxed environment, start the dev server with the `start_server`
tool pointed at `npm run dev` on port 5000 instead of a raw background
shell — it handles port conflicts and waits for the server to be ready.

Open `http://localhost:5000`. The app uses hash-based routing
(`http://localhost:5000/#/customers`) so it works correctly inside sandboxed
iframe previews.

Re-running `npx tsx script/seed.ts` is safe — it clears and re-inserts every
table (children first, in FK order) each time.

## Tech stack

- **Frontend**: React 18, Vite, Tailwind CSS v3, shadcn/ui, wouter (hash
  routing), TanStack Query v5, react-hook-form + zod, recharts, lucide-react,
  date-fns.
- **Backend**: Express 5, Drizzle ORM, better-sqlite3 (SQLite for local dev).
- **Validation**: `drizzle-zod` generates insert schemas directly from the
  Drizzle table definitions in `shared/schema.ts`, shared by both frontend
  forms and backend route validation.

## Data model → Postgres/Supabase (Phase 2 of the business)

The schema in `shared/schema.ts` (14 tables) was designed to migrate cleanly
to Postgres:

- SQLite `integer` autoincrement PKs → Postgres `uuid` with
  `gen_random_uuid()` (see `postgres_migration.sql`).
- SQLite `integer` boolean columns (`{ mode: "boolean" }`) → native Postgres
  `boolean`.
- SQLite `text` JSON-array columns (`defaultChecklist`, `beforePhotos`,
  `afterPhotos`) → native Postgres `text[]` / `jsonb`.
- SQLite `real` money columns → Postgres `numeric(10,2)` for exact currency
  math; `taxRate` maps to `numeric(5,4)`.
- All foreign keys, which are only enforced at the application/storage layer
  in SQLite today, become real `REFERENCES ... ON DELETE ...` constraints in
  Postgres, with indexes on every FK column and on `jobs.status` /
  `invoices.status` / `jobs.scheduled_date` for dashboard/report queries.
- `app_settings` (singleton row) gets a unique partial index to enforce
  "exactly one row" at the DB level once it's no longer pinned to integer
  `id = 1`.

Full column-by-column mapping lives in `SCHEMA.md`; the runnable target DDL
is `postgres_migration.sql`. See `ROADMAP.md` → "Migration path to
Postgres/Supabase" for the step-by-step cutover plan, and the "Phase 2 of the
business roadmap" section for what real Supabase Auth / role enforcement
looks like on top of this schema.

## What's implemented (Phases 1-3, all complete)

**Full CRUD (routes + storage + dedicated UI), all 14 tables:** customers,
contacts, properties, notes, staff, job_templates, service_checklists,
schedules, jobs, invoices, invoice_items, payments, attachments,
app_settings.

**Pages:** Dashboard, Customers (list + detail with 5 tabs), Properties
(list + detail), Scheduling (Day/Week/Month calendar), Jobs (list +
detail/builder with checklist and status stepper), Invoices (list + create +
detail/print view + record-payment), Reports (5 report tables/charts + CSV
export), Settings (Business Info, Invoice Settings, Job Type Templates,
Staff & Roles, Notifications).

**End-to-end workflow confirmed working:** add customer → add property →
schedule job on calendar → open job detail → define scope (checklist/notes)
→ mark complete → generate invoice from job → record payment → status
updates flow back through customer's Job History / Invoice History tabs via
TanStack Query cache invalidation.

**Seed data:** 8 customers, ~14 properties, 5 staff, 5 job templates, jobs
spanning the last/next 2 weeks in every status (scheduled, in_progress,
completed, invoiced, canceled), and invoices covering paid, overdue,
partial, and draft states — all realistic White Mountains, NH sample data.

**Not yet built** (see `ROADMAP.md` → "Phase 2 of the business roadmap"):
automated SMS/email reminders, Stripe online payments, cleaner mobile
app/customer portal, real Supabase Auth with server-enforced roles, real
photo upload wiring (photo grids are placeholder tiles today), drag-and-drop
calendar rescheduling, staff route optimization, QuickBooks/accounting
export.
