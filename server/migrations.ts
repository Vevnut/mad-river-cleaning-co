import type Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { removeDemoCustomers } from "./demo-cleanup";

/** Highest migration version below. Bump when adding a migration. */
export const LATEST_MIGRATION = 9;

/**
 * Before any pending migration touches an existing database, save a full copy
 * (VACUUM INTO) to backups/before-upgrade-v<from>-to-v<to>-<time>.db next to it.
 * Skipped for brand-new empty databases and when already up to date.
 * If the copy can't be written, the upgrade stops so nothing changes unbacked.
 */
export function backupBeforeUpgrade(sql: Database.Database): string | null {
  const current = (sql.prepare("SELECT coalesce(max(version),0) v FROM schema_migrations").get() as any).v as number;
  if (current >= LATEST_MIGRATION) return null;
  const hasData = sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='customers'").get();
  if (!hasData) return null;
  const dir = join(dirname(process.env.DATABASE_PATH || "data.db"), "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `before-upgrade-v${current}-to-v${LATEST_MIGRATION}-${Date.now()}.db`);
  sql.prepare("VACUUM INTO ?").run(file);
  console.log(`Saved a full database backup before upgrading: ${file}`);
  return file;
}

/** Additive, transactional migrations. Never runs drizzle push or rebuilds tables. */
export function migrate(sql: Database.Database) {
  sql.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  backupBeforeUpgrade(sql);
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=1").get()) {
  const dir = join(dirname(process.env.DATABASE_PATH || "data.db"), "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  sql.prepare("VACUUM INTO ?").run(join(dir, `before-billing-${Date.now()}.db`));
  sql.transaction(() => {
    const add = (table: string, definitions: Record<string, string>) => {
      const columns = new Set((sql.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(x => x.name));
      for (const [name, definition] of Object.entries(definitions)) {
        if (!columns.has(name)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    };
    add("properties", {
      full_bathrooms: "INTEGER CHECK(full_bathrooms>=0)", half_bathrooms: "INTEGER CHECK(half_bathrooms>=0)",
      legacy_total_bathrooms: "REAL", standard_departure_rate: "REAL CHECK(standard_departure_rate>=0)",
      standard_departure_rate_name: "TEXT DEFAULT 'Standard Departure Cleaning'",
      owner_rate: "REAL CHECK(owner_rate>=0)", owner_rate_name: "TEXT DEFAULT 'Owner Departure Cleaning'", invoice_notes: "TEXT",
    });
    sql.exec(`UPDATE properties SET legacy_total_bathrooms=bathrooms,
      full_bathrooms=CASE WHEN bathrooms>=0 AND bathrooms*2=CAST(bathrooms*2 AS INTEGER) THEN CAST(bathrooms AS INTEGER) END,
      half_bathrooms=CASE WHEN bathrooms>=0 AND bathrooms*2=CAST(bathrooms*2 AS INTEGER) THEN CAST((bathrooms-CAST(bathrooms AS INTEGER))*2 AS INTEGER) END,
      standard_departure_rate=CASE WHEN base_price>=0 THEN base_price END`);
    add("jobs", { rate_type: "TEXT NOT NULL DEFAULT 'custom'" });
    add("invoices", {
      property_id: "INTEGER REFERENCES properties(id)", rate_type: "TEXT NOT NULL DEFAULT 'custom'",
      property_address: "TEXT", customer_snapshot: "TEXT", internal_notes: "TEXT", sent_at: "TEXT",
      viewed_at: "TEXT", paid_at: "TEXT", public_token: "TEXT", public_enabled: "INTEGER NOT NULL DEFAULT 0",
      request_key: "TEXT", created_at: "TEXT", updated_at: "TEXT",
    });
    sql.exec(`UPDATE invoices SET property_id=(SELECT property_id FROM jobs WHERE jobs.id=invoices.job_id)`);
    add("invoice_items", {
      source_property_service_id: "INTEGER", description_snapshot: "TEXT", is_auto_added: "INTEGER NOT NULL DEFAULT 0",
      line_item_type: "TEXT NOT NULL DEFAULT 'manual'",
    });
    add("payments", {
      provider: "TEXT", provider_transaction_id: "TEXT", note: "TEXT", status: "TEXT NOT NULL DEFAULT 'succeeded'",
      request_key: "TEXT", created_at: "TEXT",
    });
    sql.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS invoice_request_key ON invoices(request_key) WHERE request_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS invoice_public_token ON invoices(public_token) WHERE public_token IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS payment_request_key ON payments(request_key) WHERE request_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS payment_transaction ON payments(provider,provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
      CREATE TABLE service_catalog (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Other',
        default_price REAL NOT NULL CHECK(default_price>=0), default_quantity REAL NOT NULL DEFAULT 1 CHECK(default_quantity>0),
        unit TEXT NOT NULL DEFAULT 'service', active INTEGER NOT NULL DEFAULT 1,
        default_inclusion_behavior TEXT NOT NULL DEFAULT 'suggested', taxable INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE property_services (
        id INTEGER PRIMARY KEY, property_id INTEGER NOT NULL REFERENCES properties(id),
        service_id INTEGER REFERENCES service_catalog(id), custom_name TEXT NOT NULL, custom_description TEXT NOT NULL DEFAULT '',
        custom_price REAL NOT NULL CHECK(custom_price>=0), default_quantity REAL NOT NULL DEFAULT 1 CHECK(default_quantity>0),
        enabled INTEGER NOT NULL DEFAULT 1, invoice_behavior TEXT NOT NULL DEFAULT 'suggested',
        internal_notes TEXT NOT NULL DEFAULT '', excludes_property_service_id INTEGER REFERENCES property_services(id),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE UNIQUE INDEX property_catalog_service ON property_services(property_id,service_id) WHERE service_id IS NOT NULL;
      CREATE TABLE invoice_activity (
        id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id), activity_type TEXT NOT NULL,
        actor TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE invoice_sends (
        request_key TEXT PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id), payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', provider_id TEXT, created_at TEXT NOT NULL);
      CREATE TABLE checkout_sessions (
        id TEXT PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id), amount_cents INTEGER NOT NULL,
        provider_id TEXT UNIQUE, url TEXT, status TEXT NOT NULL DEFAULT 'creating', expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX one_active_checkout ON checkout_sessions(invoice_id) WHERE status IN ('creating','open');
      CREATE TABLE webhook_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE organization (id TEXT PRIMARY KEY, singleton INTEGER UNIQUE NOT NULL CHECK(singleton=1));
      CREATE TABLE auth_users (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organization(id),
        email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id), expires_at INTEGER NOT NULL);
    `);
    sql.prepare("INSERT INTO organization VALUES (?,1)").run(randomUUID());
    sql.prepare("INSERT INTO schema_migrations VALUES (1,?)").run(new Date().toISOString());
  })();
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=2").get()) {
    sql.transaction(() => {
      sql.exec("ALTER TABLE invoice_sends ADD COLUMN review_data TEXT");
      sql.prepare("INSERT INTO schema_migrations VALUES (2,?)").run(new Date().toISOString());
    })();
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get()) {
    sql.transaction(() => {
      sql.exec("CREATE TABLE auth_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL)");
      sql.prepare("INSERT INTO schema_migrations VALUES (3,?)").run(new Date().toISOString());
    })();
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=4").get()) {
    // One-time, owner-approved removal of the original demo customers.
    // Failures never block startup; the migration is retried next start.
    try {
      const result = removeDemoCustomers(sql);
      sql.exec("CREATE TABLE IF NOT EXISTS maintenance_log (version INTEGER PRIMARY KEY, result TEXT NOT NULL, created_at TEXT NOT NULL)");
      sql.transaction(() => {
        sql.prepare("INSERT OR REPLACE INTO maintenance_log VALUES (4,?,?)").run(JSON.stringify(result), new Date().toISOString());
        sql.prepare("INSERT INTO schema_migrations VALUES (4,?)").run(new Date().toISOString());
      })();
      console.log("Demo customer cleanup:", result.status, result.reason || "", JSON.stringify(result.removed || {}));
    } catch (err) {
      console.error("Demo customer cleanup did not run:", (err as Error).message);
    }
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=5").get()) {
    sql.transaction(() => {
      // Damage and Final Walkthrough photos replace the unused before/after placeholders.
      sql.exec(`CREATE TABLE IF NOT EXISTS job_photos (
        id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id),
        section TEXT NOT NULL CHECK(section IN ('damage','final_walkthrough')),
        file_name TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, size INTEGER NOT NULL,
        created_at TEXT NOT NULL, created_by TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS job_photos_job ON job_photos(job_id, section);`);
      const cols = new Set((sql.prepare("PRAGMA table_info(jobs)").all() as any[]).map(c => c.name));
      if (!cols.has("damage_notes")) sql.exec("ALTER TABLE jobs ADD COLUMN damage_notes TEXT");
      sql.prepare("INSERT INTO schema_migrations VALUES (5,?)").run(new Date().toISOString());
    })();
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get()) {
    sql.transaction(() => {
      // A full copy of every deleted invoice, so a mistake can be restored by an administrator.
      sql.exec(`CREATE TABLE IF NOT EXISTS deleted_invoices (
        id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL, invoice_number TEXT NOT NULL,
        snapshot TEXT NOT NULL, deleted_by TEXT NOT NULL, deleted_at TEXT NOT NULL)`);
      sql.prepare("INSERT INTO schema_migrations VALUES (6,?)").run(new Date().toISOString());
    })();
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=7").get()) {
    sql.transaction(() => {
      // Expense tracker: mileage and supply costs, with optional receipt photos.
      sql.exec(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('mileage','supply')),
        expense_date TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
        vendor TEXT, amount REAL NOT NULL CHECK(amount >= 0),
        miles REAL, round_trip INTEGER NOT NULL DEFAULT 0, total_miles REAL, rate_per_mile REAL,
        from_location TEXT, to_location TEXT,
        property_id INTEGER REFERENCES properties(id), job_id INTEGER REFERENCES jobs(id),
        payment_method TEXT, notes TEXT,
        created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS expenses_date ON expenses(expense_date);
        CREATE TABLE IF NOT EXISTS expense_receipts (
        id INTEGER PRIMARY KEY, expense_id INTEGER NOT NULL REFERENCES expenses(id),
        file_name TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, size INTEGER NOT NULL,
        created_at TEXT NOT NULL, created_by TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS expense_receipts_expense ON expense_receipts(expense_id);`);
      sql.prepare("INSERT INTO schema_migrations VALUES (7,?)").run(new Date().toISOString());
    })();
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=8").get()) {
    sql.transaction(() => {
      // Bed counts by type on each property.
      const cols = new Set((sql.prepare("PRAGMA table_info(properties)").all() as any[]).map(c => c.name));
      for (const c of ["bed_king", "bed_queen", "bed_full", "bed_twin", "bed_bunk", "bed_sofa"])
        if (!cols.has(c)) sql.exec(`ALTER TABLE properties ADD COLUMN ${c} INTEGER NOT NULL DEFAULT 0`);
      sql.prepare("INSERT INTO schema_migrations VALUES (8,?)").run(new Date().toISOString());
    })();
  }
  if (!sql.prepare("SELECT 1 FROM schema_migrations WHERE version=9").get()) {
    sql.transaction(() => {
      // Subcontractors: who they are, which jobs they did, and what they were paid.
      sql.exec(`CREATE TABLE IF NOT EXISTS subcontractors (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, business_name TEXT, email TEXT, phone TEXT, services TEXT,
        pay_type TEXT NOT NULL DEFAULT 'per_job' CHECK(pay_type IN ('per_job','hourly')), default_pay REAL,
        w9_on_file INTEGER NOT NULL DEFAULT 0, insurance_expires TEXT, notes TEXT,
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS job_subcontractors (
        job_id INTEGER PRIMARY KEY REFERENCES jobs(id), subcontractor_id INTEGER NOT NULL REFERENCES subcontractors(id),
        pay REAL NOT NULL CHECK(pay >= 0), assigned_at TEXT NOT NULL, assigned_by TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS job_subcontractors_sub ON job_subcontractors(subcontractor_id);
        CREATE TABLE IF NOT EXISTS subcontractor_payments (
        id INTEGER PRIMARY KEY, subcontractor_id INTEGER NOT NULL REFERENCES subcontractors(id),
        paid_date TEXT NOT NULL, amount REAL NOT NULL CHECK(amount > 0), method TEXT, reference TEXT,
        job_id INTEGER REFERENCES jobs(id), note TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS subcontractor_payments_sub ON subcontractor_payments(subcontractor_id, paid_date);`);
      sql.prepare("INSERT INTO schema_migrations VALUES (9,?)").run(new Date().toISOString());
    })();
  }
}
