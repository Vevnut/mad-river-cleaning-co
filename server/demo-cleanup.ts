import type Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * One-time removal of the original demo customers (approved by the owner on
 * 2026-09-28). Customers are matched by BOTH exact name and exact email from the
 * demo seed script, so real customers are never matched by id.
 *
 * Safety: takes a full database backup first, runs in one transaction, and
 * skips the whole cleanup (deleting nothing) if any demo record has payments,
 * non-draft or partly paid invoices, checkout/email activity, or is referenced
 * by any record that is being kept.
 */
const DEMO = [
  ["Coastal Vista Rentals LLC", "ops@coastalvistarentals.com"],
  ["White Mountain Getaways", "billing@whitemountaingetaways.com"],
  ["Sarah & Tom Whitfield", "whitfields@gmail.com"],
  ["Daniel Ferreira", "daniel.ferreira@outlook.com"],
  ["The Hendricks Family", "hendricksfamily5@gmail.com"],
  ["Loon Mountain Lodging Group", "accounting@loonlodging.com"],
  ["Priya Nair", "priya.nair@icloud.com"],
  ["Conway Lakeside Cottages", "info@conwaylakesidecottages.com"],
];

export type DemoCleanupResult = { status: "removed" | "none" | "skipped"; reason?: string; removed?: Record<string, number>; backup?: string };

export function removeDemoCustomers(sql: Database.Database, backupDir?: string): DemoCleanupResult {
  const tables = (sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[]).map(r => r.name as string);
  const exists = (t: string) => tables.includes(t);
  const rows = (t: string): any[] => exists(t) ? sql.prepare(`SELECT rowid AS __rowid,* FROM "${t}"`).all() as any[] : [];
  const customers = rows("customers").filter(c => DEMO.some(([n, e]) => c.name === n && c.email === e));
  if (!customers.length) return { status: "none" };

  const dir = backupDir || join(dirname(process.env.DATABASE_PATH || "data.db"), "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const backup = join(dir, `before-demo-cleanup-${Date.now()}.db`);
  sql.prepare("VACUUM INTO ?").run(backup);

  const run = sql.transaction((): DemoCleanupResult => {
    const data = Object.fromEntries(tables.map(t => [t, rows(t)]));
    const sel: Record<string, Set<number>> = Object.fromEntries(tables.map(t => [t, new Set<number>()]));
    const ids = (t: string) => new Set(data[t].filter(r => sel[t].has(r.__rowid)).map(r => r.id));
    const pick = (t: string, f: (r: any) => boolean) => { if (exists(t)) data[t].filter(f).forEach(r => sel[t].add(r.__rowid)); };
    const cust = new Set(customers.map(c => c.id));
    pick("customers", r => cust.has(r.id));
    pick("properties", r => cust.has(r.customer_id));
    const prop = ids("properties");
    pick("schedules", r => prop.has(r.property_id));
    const sched = ids("schedules");
    pick("jobs", r => cust.has(r.customer_id) || prop.has(r.property_id) || sched.has(r.schedule_id));
    const job = ids("jobs");
    pick("invoices", r => cust.has(r.customer_id) || prop.has(r.property_id) || job.has(r.job_id));
    const inv = ids("invoices");
    for (const t of ["jobs", "invoices"]) for (const r of data[t].filter(r => sel[t].has(r.__rowid)))
      if (!cust.has(r.customer_id) || (r.property_id != null && !prop.has(r.property_id)))
        return { status: "skipped", reason: `${t} record is shared with a kept customer or property` };
    pick("contacts", r => cust.has(r.customer_id));
    pick("stays", r => prop.has(r.property_id));
    pick("property_services", r => prop.has(r.property_id));
    pick("service_checklists", r => job.has(r.job_id));
    for (const t of ["invoice_items", "invoice_activity", "invoice_sends", "checkout_sessions", "payments"]) pick(t, r => inv.has(r.invoice_id));
    pick("notes", r => cust.has(r.customer_id) || prop.has(r.property_id) || job.has(r.job_id));
    const entity: Record<string, Set<any>> = { customer: cust, property: prop, job, invoice: inv };
    pick("attachments", r => entity[r.entity_type]?.has(r.entity_id));

    if (sel.payments?.size) return { status: "skipped", reason: "demo invoices have payments" };
    if (sel.checkout_sessions?.size || sel.invoice_sends?.size) return { status: "skipped", reason: "demo invoices have checkout or email activity" };
    if (data.invoices.some(r => sel.invoices.has(r.__rowid) && (r.status !== "draft" || Number(r.amount_paid) !== 0)))
      return { status: "skipped", reason: "a demo invoice is not an unpaid draft" };
    for (const n of data.notes.filter(r => sel.notes.has(r.__rowid)))
      if ((n.customer_id != null && !cust.has(n.customer_id)) || (n.property_id != null && !prop.has(n.property_id)) || (n.job_id != null && !job.has(n.job_id)))
        return { status: "skipped", reason: "a note is shared with a kept record" };
    // invoice_items.source_property_service_id has no declared foreign key.
    const svc = ids("property_services");
    if (data.invoice_items?.some(r => !sel.invoice_items.has(r.__rowid) && svc.has(r.source_property_service_id)))
      return { status: "skipped", reason: "a kept invoice line uses a demo property service" };
    // No kept row may reference any row being removed.
    for (const t of tables) for (const fk of sql.prepare(`PRAGMA foreign_key_list("${t}")`).all() as any[]) {
      if (!exists(fk.table)) continue;
      const gone = new Set(data[fk.table].filter(r => sel[fk.table].has(r.__rowid)).map(r => r[fk.to]));
      if (data[t].some(r => !sel[t].has(r.__rowid) && r[fk.from] != null && gone.has(r[fk.from])))
        return { status: "skipped", reason: `a kept ${t} record references demo ${fk.table}` };
    }
    const order = ["attachments", "notes", "invoice_activity", "invoice_sends", "checkout_sessions", "invoice_items", "payments", "invoices",
      "service_checklists", "jobs", "stays", "schedules", "property_services", "properties", "contacts", "customers"];
    const removed: Record<string, number> = {};
    for (const t of order) {
      const r = Array.from(sel[t] || []);
      if (!r.length) continue;
      removed[t] = sql.prepare(`DELETE FROM "${t}" WHERE rowid IN (${r.map(() => "?").join(",")})`).run(...r).changes;
    }
    if ((sql.pragma("foreign_key_check") as any[]).length) throw new Error("Demo cleanup would break linked records; rolled back.");
    return { status: "removed", removed };
  });
  return { ...run.immediate(), backup };
}
