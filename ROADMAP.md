# Ridgeline — Roadmap

Phases 1-3 below are complete and shipped in this build. "Phase 2 of the
business roadmap" (last section) is the forward-looking list — the features
not yet built.

## Phase 1 — Foundation

- Brand system, logo, Fontshare typography, teal/slate palette with full
  status color coding.
- Complete 14-table data model (`shared/schema.ts`), SQLite dev database.
- Full CRUD for **customers, contacts, properties, notes**.
- App shell: sidebar (all 8 sections), header (global search, theme toggle,
  quick-action dropdown, role selector).
- Dashboard with KPI cards, today's jobs, recent customers, overdue invoices
  table, revenue chart — all wired to real (currently empty) `jobs`/
  `invoices` endpoints with correct empty states.
- Customers: list + detail (tabs: Overview, Properties, Job History,
  Invoice History, Contacts) + create/edit modal with zod validation.
- Properties: list + detail (sensitive entry-instructions callout, photo
  placeholder grid, job history stub) + create/edit modal with zod
  validation.
- Seed data: 8 customers, 16 properties, 5 staff, 5 job templates —
  realistic White Mountains, NH sample data.
- Scheduling / Jobs / Invoices / Reports / Settings launched as "Coming
  soon" stub pages in Phase 1 (no 404s), storage layer scaffolded for all
  remaining tables — replaced by full implementations in Phase 2/3 below.

## Phase 2 — Scheduling & Jobs (complete)

- Scheduling page: day/week/month calendar, color-coded job chips by
  status, click-to-create job flow, staff/job-type/property filters.
- Jobs list + detail/builder: template selector, checklist (service_checklists
  CRUD), before/after photo placeholder grids, internal vs. customer-visible
  notes, status stepper (scheduled → in progress → completed → invoiced).
- Recurring schedules (`schedules` table) generating job instances.
- Seed realistic job data across the last/next 2 weeks in every status.

Not yet built (carried to "Phase 2 of the business roadmap" below):
drag-and-drop calendar rescheduling, route optimization for staff.

## Phase 3 — Invoicing & Settings (complete)

- Invoices list + create (from completed job or fully manual) + printable
  detail view + record-payment flow updating `amountPaid`/status.
- Reports: revenue by month, jobs by property, unpaid/overdue invoices,
  top customers by revenue, recurring jobs summary, CSV export on every
  table.
- Settings: Business Info, Invoice Settings (tax rate, terms, invoice
  number prefix), Job Type Templates CRUD, Staff & Roles CRUD,
  Notifications (static toggles).
- Seed realistic invoice data (paid, overdue, partial, draft) tied to
  completed jobs.
- Wrap-up pass: full schema docs (incl. `app_settings`), clean
  `tsc --noEmit` and reproducible `npm run build`, dark-mode/375px mobile QA
  across Customers/Properties/Scheduling/Jobs.

## Phase 2 of the business roadmap — Future Enhancements

Everything below is **not yet built**. This is the actual "what's next"
list referenced from the README.

- **Real authentication** — Supabase Auth with admin/office/cleaner roles
  enforced server-side (replacing the static role selector in the header).
- **Automated reminders** — SMS/email reminders for upcoming jobs and
  overdue invoices.
- **Online payment collection** — Stripe Checkout / Payment Links wired to
  the invoice detail page's "Record Payment" flow.
- **Cleaner mobile app / customer portal** — role-scoped views: cleaners
  see their assigned jobs and checklists; customers see their own job and
  invoice history without full admin access.
- **Photo upload wiring** — real file upload (Supabase Storage or S3) behind
  the before/after photo grids and property photo gallery, replacing the
  placeholder "Add Photo" tiles.
- **Drag-and-drop calendar rescheduling** — reschedule jobs by dragging
  chips between days/times on the Scheduling calendar.
- **Route optimization for staff** — auto-sequence a cleaner's daily job
  list by geography to minimize drive time.
- **QuickBooks / accounting export** — sync invoices and payments to
  QuickBooks Online or export in an accounting-import-ready format.

## Migration path to Postgres/Supabase

The data model in `shared/schema.ts` is designed to map 1:1 onto
`postgres_migration.sql` (uuid PKs, real FK constraints, `numeric` money
columns, native `boolean`/`jsonb`/`text[]`). When migrating:

1. Provision a Supabase project and run `postgres_migration.sql`.
2. Swap `server/storage.ts`'s `better-sqlite3` + `drizzle-orm/better-sqlite3`
   driver for `drizzle-orm/postgres-js` (or the Supabase JS client directly),
   pointing at the Supabase connection string.
3. Re-point integer PKs to uuid — update `InsertX`/`X` types generated from
   `shared/schema.ts` to use Drizzle's `pgTable` instead of `sqliteTable`.
4. Migrate JSON-as-text columns (`defaultChecklist`, `beforePhotos`,
   `afterPhotos`) to native `jsonb`/`text[]` per the DDL above.
5. Layer in Supabase Auth for real role-based access control.
