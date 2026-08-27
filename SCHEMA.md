# Mad River Cleaning Co. — Data Model (SCHEMA.md)

This document is the canonical table plan for the Mad River Cleaning Co. data
model. It mirrors `shared/schema.ts` (Drizzle ORM, SQLite via better-sqlite3
for local dev) and is designed to migrate 1:1 to Postgres/Supabase — see
`postgres_migration.sql` in this same directory for the target DDL.

SQLite-specific notes:
- SQLite has no native array or boolean type. Booleans are stored as
  `integer` with Drizzle's `{ mode: "boolean" }`, and list columns
  (`defaultChecklist`, `beforePhotos`, `afterPhotos`) are stored as `text`
  columns containing `JSON.stringify()`'d arrays, parsed in application code.
  In Postgres these become native `boolean` and `text[]` / `jsonb` columns.
- All money columns are `real` (floating point) in SQLite for simplicity;
  the Postgres migration uses `numeric(10,2)` for exact currency arithmetic.
- All FKs are enforced at the storage-layer (application code) level in
  Phase 1; SQLite FK constraints are not turned on by the template by
  default. Postgres migration adds real `REFERENCES` constraints.

## 1. customers

| Column | Type | Notes |
|---|---|---|
| id | integer, PK, autoincrement | |
| name | text, not null | |
| companyName | text, nullable | |
| customerType | text, enum(individual, company) | |
| email | text, not null | |
| phone | text, not null | |
| altPhone | text, nullable | |
| preferredContact | text, enum(email, phone, text) | |
| billingAddressLine1 | text, not null | |
| billingAddressLine2 | text, nullable | |
| billingCity | text, not null | |
| billingState | text, not null | |
| billingZip | text, not null | |
| notes | text, nullable | |
| taxExempt | boolean, default false | |
| createdAt | text (ISO datetime), default now | |

## 2. contacts

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| customerId | integer, FK → customers.id | |
| name | text, not null | |
| role | text, nullable | e.g. "Property Manager" |
| email | text, not null | |
| phone | text, not null | |
| isPrimary | boolean, default false | |

## 3. properties

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| customerId | integer, FK → customers.id | |
| name | text, not null | |
| addressLine1 | text, not null | |
| addressLine2 | text, nullable | |
| city | text, not null | |
| state | text, not null | |
| zip | text, not null | |
| unitType | text, enum(house, condo, cabin, apartment, cottage) | |
| bedrooms | integer, not null | |
| bathrooms | real, not null | supports half-baths (e.g. 2.5) |
| maxOccupancy | integer, not null | |
| checkInTime | text ("HH:MM"), not null | |
| checkOutTime | text ("HH:MM"), not null | |
| entryInstructions | text, not null | sensitive — gate codes / lockbox / keys |
| accessNotes | text, nullable | |
| supplyNotes | text, nullable | |
| cleaningFrequency | text, enum(weekly, biweekly, monthly, turnover, one_time) | |
| basePrice | real, not null | |
| photoUrl | text, nullable | placeholder path |
| active | boolean, default true | |

## 4. staff

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| name | text, not null | |
| role | text, enum(admin, office, cleaner) | |
| email | text, not null | |
| phone | text, not null | |
| colorTag | text (hex), not null | for calendar chips |
| active | boolean, default true | |

## 5. job_templates

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| name | text, not null | |
| jobType | text, enum(turnover, deep_clean, inspection, one_time, recurring, custom) | |
| defaultDurationMinutes | integer, not null | |
| defaultPrice | real, not null | |
| defaultChecklist | text (JSON array of strings), not null | |
| description | text, nullable | |

## 6. service_checklists

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| jobId | integer, FK → jobs.id | |
| label | text, not null | |
| isCompleted | boolean, default false | |
| sortOrder | integer, default 0 | |

## 7. schedules

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| propertyId | integer, FK → properties.id | |
| jobTemplateId | integer, FK → job_templates.id, nullable | |
| frequency | text, enum(weekly, biweekly, monthly, custom) | |
| dayOfWeek | integer, nullable | 0-6 |
| startDate | text (ISO date), not null | |
| endDate | text (ISO date), nullable | |
| assignedStaffId | integer, FK → staff.id, nullable | |
| active | boolean, default true | |

## 8. jobs

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| propertyId | integer, FK → properties.id | |
| customerId | integer, FK → customers.id | denormalized for query speed |
| scheduleId | integer, FK → schedules.id, nullable | set if generated from a recurring schedule |
| jobTemplateId | integer, FK → job_templates.id, nullable | |
| jobType | text, enum(turnover, deep_clean, inspection, one_time, custom, recurring) | |
| scheduledDate | text (ISO date), not null | |
| scheduledTime | text ("HH:MM"), not null | |
| durationMinutes | integer, not null | |
| assignedStaffId | integer, FK → staff.id, nullable | |
| status | text, enum(scheduled, in_progress, completed, invoiced, canceled), default scheduled | |
| internalNotes | text, nullable | |
| customerNotes | text, nullable | |
| price | real, not null | |
| beforePhotos | text (JSON array), default [] | |
| afterPhotos | text (JSON array), default [] | |
| completedAt | text (ISO datetime), nullable | |

## 9. invoices

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| customerId | integer, FK → customers.id | |
| jobId | integer, FK → jobs.id, nullable | one job can create one invoice |
| invoiceNumber | text, unique, not null | |
| issueDate | text (ISO date), not null | |
| dueDate | text (ISO date), not null | |
| status | text, enum(draft, sent, paid, partial, overdue, canceled), default draft | |
| subtotal | real, default 0 | |
| discountAmount | real, default 0 | |
| taxRate | real, default 0 | |
| taxAmount | real, default 0 | |
| travelFee | real, default 0 | |
| rushFee | real, default 0 | |
| total | real, default 0 | |
| amountPaid | real, default 0 | |
| notes | text, nullable | |

## 10. invoice_items

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| invoiceId | integer, FK → invoices.id | |
| description | text, not null | |
| itemType | text, enum(service, labor, supplies, addon, discount, fee) | |
| quantity | real, default 1 | |
| unitPrice | real, not null | |
| amount | real, not null | |
| sortOrder | integer, default 0 | |

## 11. payments

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| invoiceId | integer, FK → invoices.id | |
| amount | real, not null | |
| method | text, enum(card, cash, check, ach, other) | |
| paidDate | text (ISO date), not null | |
| reference | text, nullable | |

## 12. notes

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| customerId | integer, FK → customers.id, nullable | |
| propertyId | integer, FK → properties.id, nullable | |
| jobId | integer, FK → jobs.id, nullable | |
| authorStaffId | integer, FK → staff.id, nullable | |
| body | text, not null | |
| pinned | boolean, default false | |
| createdAt | text (ISO datetime), default now | |

## 13. attachments

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | |
| entityType | text, enum(customer, property, job, invoice) | |
| entityId | integer, not null | polymorphic FK — no DB-level constraint |
| fileName | text, not null | |
| filePath | text, not null | placeholder path |
| category | text, enum(photo, document) | |
| uploadedAt | text (ISO datetime), default now | |

## 14. app_settings

Singleton table — always exactly one row (`id = 1`), created lazily on first
read. Holds business info and invoice defaults consumed by invoice creation
(invoice number prefix, default tax rate, default payment terms) and the
printable invoice view (business name/address/phone/email, footer note), plus
static notification toggles surfaced on the Settings page.

| Column | Type | Notes |
|---|---|---|
| id | integer, PK | always 1 |
| businessName | text, not null, default "Mad River Cleaning Co." | |
| businessAddress | text, not null, default "" | |
| businessPhone | text, not null, default "" | |
| businessEmail | text, not null, default "" | |
| logoPlaceholder | text, nullable | |
| defaultTaxRate | real, not null, default 0 | fraction, e.g. 0.08 |
| defaultPaymentTermsDays | integer, not null, default 15 | added to issueDate for dueDate |
| invoiceNumberPrefix | text, not null, default "INV" | e.g. "INV-0001-42" |
| invoiceFooterNote | text, not null, default "Thank you for your business." | |
| notifyJobReminders | boolean, default true | static toggle, non-functional |
| notifyInvoiceOverdue | boolean, default true | static toggle, non-functional |
| notifyPaymentReceived | boolean, default true | static toggle, non-functional |
| notifyDailyDigest | boolean, default false | static toggle, non-functional |

## Relations

- customer 1—many: properties, contacts, notes, invoices
- property 1—many: jobs, schedules
- job 1—1: invoice (nullable); 1—many: service_checklists, notes, attachments
- invoice 1—many: invoice_items, payments
- staff 1—many: jobs (assigned), schedules
- app_settings: singleton, no relations — read by invoice creation and the invoice print view

## Known library quirk: `InsertX` types vs. `insertXSchema`

`drizzle-zod@0.7.1` combined with `zod@4.4.3` (the versions pinned by the
fullstack template) infer enum-typed columns (`text(..., { enum: [...] })`)
as a broken TypeScript union at the type level only — e.g. `customerType`
resolves to `2 | "individual" | "company" | (() => ArrayIterator<...>) | ...`
instead of the clean `"individual" | "company"`. Runtime validation via
`insertCustomerSchema.safeParse()` is completely correct; only static types
are affected.

Workaround used throughout this codebase:
- `InsertX` type exports in `shared/schema.ts` use Drizzle's native
  `typeof table.$inferInsert` instead of `z.infer<typeof insertXSchema>`.
- Form components (`customer-form-dialog.tsx`, `property-form-dialog.tsx`)
  re-declare enum fields with `z.enum([...])` inside `.extend()` so
  `react-hook-form`/`zodResolver` see the clean literal union.
- `server/routes.ts` casts `parsed.data as InsertX` when handing validated
  request bodies to the storage layer, since `parsed.data`'s static type
  still carries the drizzle-zod quirk even though the runtime value is
  correct.

The `insertXSchema` zod objects themselves are unchanged and remain the
source of truth for runtime request validation.

## Implementation status (Phase 3 — complete)

Full CRUD (routes + storage + dedicated UI) for all 14 tables: **customers,
contacts, properties, notes, staff, job_templates, service_checklists,
schedules, jobs, invoices, invoice_items, payments, attachments,
app_settings**.

Key derived behaviors layered on top of plain CRUD:
- Generating an invoice from a completed job (`POST /api/jobs/:id/invoice`)
  reads `app_settings` for the invoice number prefix, default tax rate, and
  payment terms, then creates the `invoices` row plus a starter
  `invoice_items` row from the job's price, and flips the job's `status` to
  `invoiced`.
- Recording a payment (`POST /api/invoices/:id/payments`) inserts a
  `payments` row and recomputes the parent invoice's `amountPaid` and
  `status` (`paid` when `amountPaid >= total`, `partial` when `0 <
  amountPaid < total`, `overdue` when unpaid/partial past `dueDate`).
- The printable invoice view (`GET /api/invoices/:id/print`) merges the
  invoice, its line items, and `app_settings` business info into one
  print-ready payload — see `server/invoice-print-template.ts`.
- All FK relations listed above are enforced at the storage layer
  (`server/storage.ts`); see the SQLite-vs-Postgres note at the top of this
  file for why real DB-level `REFERENCES` constraints only exist in
  `postgres_migration.sql`.
