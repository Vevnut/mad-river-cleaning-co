# Ridgeline — Cleaning Ops

Operations software for a White Mountains, NH turnover-cleaning company
serving Airbnb hosts, vacation-rental managers, and recurring residential
clients. This is **Phase 1 of 3** — see `ROADMAP.md` for what's next.

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
│       │   ├── logo.tsx           # Inline SVG ridge-line mark
│       │   ├── status-badge.tsx   # Shared job/invoice status badge
│       │   ├── notes-panel.tsx    # Reusable notes list + add-note form
│       │   ├── theme-provider.tsx # Light/dark context (no localStorage)
│       │   ├── customers/         # Customer-domain forms
│       │   ├── properties/        # Property-domain forms
│       │   └── ui/                # shadcn/ui primitives (do not hand-edit)
│       ├── pages/
│       │   ├── dashboard.tsx
│       │   ├── customers-list.tsx
│       │   ├── customer-detail.tsx
│       │   ├── properties-list.tsx
│       │   ├── property-detail.tsx
│       │   └── coming-soon.tsx    # Stub for Scheduling/Jobs/Invoices/Reports/Settings
│       └── lib/                   # queryClient, cn(), format helpers
├── server/
│   ├── index.ts                   # Express bootstrap (do not modify)
│   ├── routes.ts                  # All /api/* routes
│   ├── storage.ts                 # IStorage interface + SQLite implementation
│   └── vite.ts                    # Dev/prod static serving (do not modify)
├── shared/
│   └── schema.ts                  # Drizzle tables + drizzle-zod schemas + types
├── script/
│   ├── seed.ts                    # Sample data seed script
│   └── build.ts                   # Production build script
├── SCHEMA.md                      # Full table plan (markdown)
├── postgres_migration.sql         # Postgres/Supabase target DDL
├── ROADMAP.md                     # Phase 2/3 + future features
└── data.db                        # SQLite database file (gitignored data, schema tracked via drizzle-kit)
```

## Running locally

```bash
npm install
npx drizzle-kit push       # create/sync SQLite tables from shared/schema.ts
npx tsx script/seed.ts      # populate sample customers/properties/staff/job templates
npm run dev                 # starts Express + Vite on port 5000
```

Open `http://localhost:5000`. The app uses hash-based routing
(`http://localhost:5000/#/customers`) so it works correctly inside sandboxed
iframe previews.

Re-running `npx tsx script/seed.ts` is safe — it clears and re-inserts
customers/contacts/properties/staff/job_templates each time (idempotent for
Phase 1 tables).

## Tech stack

- **Frontend**: React 18, Vite, Tailwind CSS v3, shadcn/ui, wouter (hash
  routing), TanStack Query v5, react-hook-form + zod, recharts, lucide-react.
- **Backend**: Express 5, Drizzle ORM, better-sqlite3 (SQLite for local dev).
- **Validation**: `drizzle-zod` generates insert schemas directly from the
  Drizzle table definitions in `shared/schema.ts`, shared by both frontend
  forms and backend route validation.

## Data model → Postgres/Supabase (Phase 2/3)

The schema in `shared/schema.ts` was designed to migrate cleanly to Postgres:

- SQLite `integer` autoincrement PKs → Postgres `uuid` with
  `gen_random_uuid()` (see `postgres_migration.sql`).
- SQLite `integer` boolean columns (`{ mode: "boolean" }`) → native Postgres
  `boolean`.
- SQLite `text` JSON-array columns (`defaultChecklist`, `beforePhotos`,
  `afterPhotos`) → native Postgres `text[]` / `jsonb`.
- SQLite `real` money columns → Postgres `numeric(10,2)` for exact currency
  math.
- All foreign keys, which are only enforced at the application/storage layer
  in SQLite today, become real `REFERENCES ... ON DELETE ...` constraints in
  Postgres.

Full column-by-column mapping lives in `SCHEMA.md`; the runnable target DDL
is `postgres_migration.sql`. See `ROADMAP.md` → "Migration path to
Postgres/Supabase" for the step-by-step cutover plan.

## What's implemented vs. scaffolded (Phase 1)

**Full CRUD (routes + storage + UI):** customers, contacts, properties,
notes.

**Storage layer scaffolded, routes minimal/read-only, no dedicated page
yet:** staff, job_templates, service_checklists, schedules, jobs, invoices,
invoice_items, payments, attachments. `server/storage.ts`'s `IStorage`
interface already defines full CRUD method signatures for every table so
Phase 2/3 can implement the remaining routes and pages without refactoring
the storage layer or `shared/schema.ts`.

**Sidebar stubs (no 404s, not yet built):** Scheduling, Jobs, Invoices,
Reports, Settings — each renders a "Coming soon" placeholder page.
