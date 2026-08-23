-- ============================================================================
-- Ridgeline Cleaning Ops — Postgres / Supabase migration DDL
-- Target for Phase 2/3 migration off SQLite. Uses uuid PKs, real REFERENCES
-- constraints, timestamptz, numeric(10,2) for money, native boolean, and
-- text[] / jsonb where SQLite required JSON-as-text.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. customers
-- ---------------------------------------------------------------------------
create table customers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  company_name          text,
  customer_type         text not null check (customer_type in ('individual', 'company')),
  email                 text not null,
  phone                 text not null,
  alt_phone             text,
  preferred_contact     text not null check (preferred_contact in ('email', 'phone', 'text')),
  billing_address_line1 text not null,
  billing_address_line2 text,
  billing_city          text not null,
  billing_state         text not null,
  billing_zip           text not null,
  notes                 text,
  tax_exempt            boolean not null default false,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. contacts
-- ---------------------------------------------------------------------------
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name        text not null,
  role        text,
  email       text not null,
  phone       text not null,
  is_primary  boolean not null default false
);

create index idx_contacts_customer_id on contacts(customer_id);

-- ---------------------------------------------------------------------------
-- 3. properties
-- ---------------------------------------------------------------------------
create table properties (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id) on delete cascade,
  name                text not null,
  address_line1       text not null,
  address_line2       text,
  city                text not null,
  state               text not null,
  zip                 text not null,
  unit_type           text not null check (unit_type in ('house', 'condo', 'cabin', 'apartment', 'cottage')),
  bedrooms            integer not null,
  bathrooms           numeric(4,1) not null,
  max_occupancy       integer not null,
  check_in_time       text not null,
  check_out_time      text not null,
  entry_instructions  text not null,
  access_notes        text,
  supply_notes        text,
  cleaning_frequency  text not null check (cleaning_frequency in ('weekly', 'biweekly', 'monthly', 'turnover', 'one_time')),
  base_price          numeric(10,2) not null,
  photo_url           text,
  active              boolean not null default true
);

create index idx_properties_customer_id on properties(customer_id);

-- ---------------------------------------------------------------------------
-- 4. staff
-- ---------------------------------------------------------------------------
create table staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null check (role in ('admin', 'office', 'cleaner')),
  email      text not null,
  phone      text not null,
  color_tag  text not null,
  active     boolean not null default true
);

-- ---------------------------------------------------------------------------
-- 5. job_templates
-- ---------------------------------------------------------------------------
create table job_templates (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  job_type                  text not null check (job_type in ('turnover', 'deep_clean', 'inspection', 'one_time', 'recurring', 'custom')),
  default_duration_minutes  integer not null,
  default_price             numeric(10,2) not null,
  default_checklist         jsonb not null default '[]'::jsonb,
  description               text
);

-- ---------------------------------------------------------------------------
-- 6. schedules
-- ---------------------------------------------------------------------------
create table schedules (
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid not null references properties(id) on delete cascade,
  job_template_id    uuid references job_templates(id) on delete set null,
  frequency          text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'custom')),
  day_of_week        smallint,
  start_date         date not null,
  end_date           date,
  assigned_staff_id  uuid references staff(id) on delete set null,
  active             boolean not null default true
);

create index idx_schedules_property_id on schedules(property_id);

-- ---------------------------------------------------------------------------
-- 7. jobs
-- ---------------------------------------------------------------------------
create table jobs (
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid not null references properties(id) on delete cascade,
  customer_id        uuid not null references customers(id) on delete cascade,
  schedule_id        uuid references schedules(id) on delete set null,
  job_template_id    uuid references job_templates(id) on delete set null,
  job_type           text not null check (job_type in ('turnover', 'deep_clean', 'inspection', 'one_time', 'custom', 'recurring')),
  scheduled_date     date not null,
  scheduled_time     text not null,
  duration_minutes   integer not null,
  assigned_staff_id  uuid references staff(id) on delete set null,
  status             text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'invoiced', 'canceled')),
  internal_notes     text,
  customer_notes     text,
  price              numeric(10,2) not null,
  before_photos      text[] not null default '{}',
  after_photos       text[] not null default '{}',
  completed_at       timestamptz
);

create index idx_jobs_property_id on jobs(property_id);
create index idx_jobs_customer_id on jobs(customer_id);
create index idx_jobs_scheduled_date on jobs(scheduled_date);
create index idx_jobs_status on jobs(status);

-- ---------------------------------------------------------------------------
-- 8. service_checklists
-- ---------------------------------------------------------------------------
create table service_checklists (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  label         text not null,
  is_completed  boolean not null default false,
  sort_order    integer not null default 0
);

create index idx_service_checklists_job_id on service_checklists(job_id);

-- ---------------------------------------------------------------------------
-- 9. invoices
-- ---------------------------------------------------------------------------
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  job_id          uuid references jobs(id) on delete set null,
  invoice_number  text not null unique,
  issue_date      date not null,
  due_date        date not null,
  status          text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'partial', 'overdue', 'canceled')),
  subtotal        numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  tax_rate        numeric(5,4) not null default 0,
  tax_amount      numeric(10,2) not null default 0,
  travel_fee      numeric(10,2) not null default 0,
  rush_fee        numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  amount_paid     numeric(10,2) not null default 0,
  notes           text
);

create index idx_invoices_customer_id on invoices(customer_id);
create index idx_invoices_status on invoices(status);

-- ---------------------------------------------------------------------------
-- 10. invoice_items
-- ---------------------------------------------------------------------------
create table invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  description  text not null,
  item_type    text not null check (item_type in ('service', 'labor', 'supplies', 'addon', 'discount', 'fee')),
  quantity     numeric(10,2) not null default 1,
  unit_price   numeric(10,2) not null,
  amount       numeric(10,2) not null,
  sort_order   integer not null default 0
);

create index idx_invoice_items_invoice_id on invoice_items(invoice_id);

-- ---------------------------------------------------------------------------
-- 11. payments
-- ---------------------------------------------------------------------------
create table payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  amount      numeric(10,2) not null,
  method      text not null check (method in ('card', 'cash', 'check', 'ach', 'other')),
  paid_date   date not null,
  reference   text
);

create index idx_payments_invoice_id on payments(invoice_id);

-- ---------------------------------------------------------------------------
-- 12. notes
-- ---------------------------------------------------------------------------
create table notes (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid references customers(id) on delete cascade,
  property_id       uuid references properties(id) on delete cascade,
  job_id            uuid references jobs(id) on delete cascade,
  author_staff_id   uuid references staff(id) on delete set null,
  body              text not null,
  pinned            boolean not null default false,
  created_at        timestamptz not null default now()
);

create index idx_notes_customer_id on notes(customer_id);
create index idx_notes_property_id on notes(property_id);
create index idx_notes_job_id on notes(job_id);

-- ---------------------------------------------------------------------------
-- 13. attachments
-- ---------------------------------------------------------------------------
create table attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('customer', 'property', 'job', 'invoice')),
  entity_id    uuid not null,
  file_name    text not null,
  file_path    text not null,
  category     text not null check (category in ('photo', 'document')),
  uploaded_at  timestamptz not null default now()
);

create index idx_attachments_entity on attachments(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 14. app_settings — singleton row (id always 1)
-- Business info + invoice defaults consumed by invoice creation & print view.
-- ---------------------------------------------------------------------------
create table app_settings (
  id                            uuid primary key default gen_random_uuid(),
  business_name                 text not null default 'Ridgeline Cleaning Ops',
  business_address              text not null default '',
  business_phone                text not null default '',
  business_email                text not null default '',
  logo_placeholder              text,
  default_tax_rate              numeric(5,4) not null default 0,
  default_payment_terms_days    integer not null default 15,
  invoice_number_prefix         text not null default 'INV',
  invoice_footer_note           text not null default 'Thank you for your business.',
  notify_job_reminders          boolean not null default true,
  notify_invoice_overdue        boolean not null default true,
  notify_payment_received       boolean not null default true,
  notify_daily_digest           boolean not null default false,
  -- enforce a true singleton row at the DB level (mirrors the app's
  -- "id = 1 always" convention from server/storage.ts, expressed here via a
  -- constant unique column since uuid PKs can't be pinned to a literal id)
  singleton_guard                boolean not null default true unique
);
