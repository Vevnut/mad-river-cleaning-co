import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import Stripe from "stripe";

// This test runner only targets a dedicated copy of data.db. It never sends email
// or creates real charges. The process hosting this DB must use DATABASE_PATH.
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5000";
const db = new Database("tests/.data/qa.db");
const original = new Database("data.db", { readonly: true });
let token = "";
let checks = 0;
const check = (message: string, run: () => void) => { run(); checks++; console.log(`PASS ${message}`); };
async function api(method: string, path: string, data?: any, expected = 200, auth = true) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const text = await r.text();
  assert.equal(r.status, expected, `${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
await api("GET", "/api/properties", undefined, 401, false);
checks++; console.log("PASS unauthenticated requests denied");
const status = await api("GET", "/api/auth/status", undefined, 200, false);
const login = await api("POST", `/api/auth/${status.setupRequired ? "setup" : "login"}`, {
  email: "qa@example.test", password: "QA-only-password-2026", setupToken: "local-test-setup",
}, 200, false);
token = login.token;
check("migration retains every legacy invoice column and item", () => {
  for (const table of ["invoices", "invoice_items", "payments"]) {
    for (const old of original.prepare(`SELECT * FROM ${table}`).all() as any[]) {
      const migrated = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(old.id) as any;
      for (const k of Object.keys(old)) assert.deepEqual(migrated[k], old[k], `${table}.${k}`);
    }
  }
});
check("bathrooms and base-price migration", () => {
  for (const p of original.prepare("SELECT * FROM properties").all() as any[]) {
    const migrated = db.prepare("SELECT * FROM properties WHERE id=?").get(p.id) as any;
    assert.equal(migrated.legacy_total_bathrooms, p.bathrooms);
    assert.equal(migrated.full_bathrooms + migrated.half_bathrooms * 0.5, p.bathrooms);
    assert.equal(migrated.standard_departure_rate, p.base_price);
  }
});
const owner = await api("POST", "/api/customers", {
  name: "QA Owner (test fixture)", customerType: "individual", email: "owner@example.test", phone: "555-0100",
  preferredContact: "email", billingAddressLine1: "Test address", billingCity: "Conway", billingState: "NH", billingZip: "03818",
}, 201);
const p = await api("POST", "/api/properties", {
  name: "151 Pinnacle", customerId: owner.id, addressLine1: "151 Pinnacle (test only)", city: "Conway", state: "NH", zip: "03818",
  unitType: "house", bedrooms: 3, fullBathrooms: 2, halfBathrooms: 1, maxOccupancy: 6, checkInTime: "16:00", checkOutTime: "10:00",
  entryInstructions: "PRIVATE ACCESS CODE NEVER EXPOSE", cleaningFrequency: "turnover",
  standardDepartureRate: 200, standardDepartureRateName: "Standard Departure Cleaning",
  ownerRate: 150, ownerRateName: "Owner Departure Cleaning", invoiceNotes: "Thank you for choosing us.",
}, 201);
check("2 full and 1 half bathrooms total 2.5; both rates stored", () => { assert.equal(p.bathrooms, 2.5); assert.equal(p.ownerRate, 150); assert.equal(p.standardDepartureRate, 200); });
await api("PATCH", `/api/properties/${p.id}`, { fullBathrooms: -1 }, 400);
await api("PATCH", `/api/properties/${p.id}`, { ownerRate: -1 }, 400);
check("invalid bathroom counts and prices rejected", () => {});
const catalog = await api("POST", "/api/services", { name: "Standard grill cleaning", defaultPrice: 10, category: "Grill" }, 201);
const grill = await api("POST", `/api/properties/${p.id}/services`, { serviceId: catalog.id, customName: catalog.name, customPrice: 10, invoiceBehavior: "auto_include" });
const tub = await api("POST", `/api/properties/${p.id}/services`, { customName: "Standard hot tub maintenance", customPrice: 40, invoiceBehavior: "suggested" });
const full = await api("POST", `/api/properties/${p.id}/services`, { customName: "Full hot tub drain, refill, and maintenance", customPrice: 100, invoiceBehavior: "suggested", excludesPropertyServiceId: tub.id });
await api("POST", `/api/properties/${p.id}/services`, { customName: "Excessively dirty dish cleaning", customPrice: 25, invoiceBehavior: "manual" });
const d = await api("GET", `/api/properties/${p.id}/invoice-defaults?rateType=standard`);
check("defaults contain single base rate and auto grill only", () => { assert.equal(d.items.length, 2); assert.equal(d.services.length, 4); assert.equal(d.items[0].unitPrice, 200); });
const draft = { customerId: owner.id, propertyId: p.id, rateType: "standard", issueDate: "2026-09-22", dueDate: "2026-10-07", requestKey: randomUUID(), internalNotes: "PRIVATE INVOICE NOTE" };
const inv = await api("POST", "/api/invoices", draft, 201);
check("invoice auto-populates property charges", () => { assert.equal(inv.total, 210); assert.equal(inv.status, "draft"); });
const repeated = await api("POST", "/api/invoices", draft, 201);
check("creation retry is idempotent", () => assert.equal(repeated.id, inv.id));
let lines = await api("GET", `/api/invoices/${inv.id}/items`);
await api("PATCH", `/api/invoices/${inv.id}`, { notes: "Edited message" });
check("reopening/editing never reapplies defaults", () => assert.equal(db.prepare("SELECT COUNT(*) n FROM invoice_items WHERE invoice_id=?").get(inv.id).n, 2));
const own = await api("POST", "/api/invoices", { ...draft, requestKey: randomUUID(), rateType: "owner" }, 201);
check("owner invoice contains only owner base rate", () => { const ownLines = db.prepare("SELECT * FROM invoice_items WHERE invoice_id=?").all(own.id) as any[]; assert.equal(own.total, 160); assert.equal(ownLines.filter(i => i.line_item_type.endsWith("_rate")).length, 1); assert.equal(ownLines[0].line_item_type, "owner_rate"); });
await api("PATCH", `/api/invoices/${inv.id}`, { items: [...lines, d.services.find((s: any) => s.id === tub.id).item] });
let afterTub = await api("GET", `/api/invoices/${inv.id}/items`);
await api("PATCH", `/api/invoices/${inv.id}`, { items: [...afterTub, d.services.find((s: any) => s.id === full.id).item] }, 400);
check("conflicting hot-tub charges rejected server-side", () => {});
const upgraded = await api("PATCH", `/api/invoices/${inv.id}`, { items: [...lines, d.services.find((s: any) => s.id === full.id).item] });
check("replacement service uses separate $100 charge", () => assert.equal(upgraded.total, 310));
await api("PATCH", `/api/properties/${p.id}`, { standardDepartureRate: 250 });
await api("PATCH", `/api/properties/${p.id}/services/${grill.id}`, { ...grill, customPrice: 15 });
check("old invoice snapshots do not change with property pricing", () => assert.equal(db.prepare("SELECT total FROM invoices WHERE id=?").get(inv.id).total, 310));
await api("PATCH", `/api/invoices/${inv.id}`, { items: [...lines, lines[0]] }, 400);
check("duplicate rate charges rejected", () => {});
const noRate = await api("PATCH", `/api/properties/${p.id}`, { ownerRate: null });
const noDefaults = await api("GET", `/api/properties/${p.id}/invoice-defaults?rateType=owner`);
check("blank property rate adds no base charge", () => assert(!noDefaults.items.some((i: any) => i.lineItemType === "owner_rate")));
await api("PATCH", `/api/properties/${p.id}`, { ownerRate: 150, standardDepartureRate: 200 });
const pay = { invoiceId: inv.id, amount: 100, method: "venmo", paidDate: "2026-09-22", reference: "QA-VENMO-1", note: "Internal payment note", requestKey: randomUUID() };
await api("POST", "/api/payments", pay, 201);
await api("POST", "/api/payments", pay, 201);
const partial = await api("GET", `/api/invoices/${inv.id}`);
check("manual partial payment and retry update balance once", () => { assert.equal(partial.balanceDue, 210); assert.equal(partial.amountPaid, 100); assert.equal(partial.status, "partial"); });
await api("POST", "/api/payments", { ...pay, amount: 211, requestKey: randomUUID() }, 400);
await api("POST", "/api/payments", { ...pay, amount: 0, requestKey: randomUUID() }, 400);
await api("PATCH", `/api/invoices/${inv.id}`, { amountPaid: 999 }, 400);
check("overpayment, zero payment and forged paid total denied", () => {});
await api("POST", "/api/payments", { ...pay, amount: 210, method: "check", reference: "CHK-1", requestKey: randomUUID() }, 201);
const paid = await api("GET", `/api/invoices/${inv.id}`);
check("check payment settles invoice with dated history", () => { assert.equal(paid.status, "paid"); assert.equal(paid.balanceDue, 0); assert(paid.paidAt); assert.equal(db.prepare("SELECT COUNT(*) n FROM payments WHERE invoice_id=?").get(inv.id).n, 2); });
const jobs = await api("POST", "/api/jobs", {
  propertyId: p.id, customerId: owner.id, jobType: "turnover", scheduledDate: "2026-09-22", scheduledTime: "11:00", durationMinutes: 120, status: "completed", rateType: "owner",
}, 201);
check("job defaults to selected owner price", () => assert.equal(jobs.price, 150));
const fromJob = await api("POST", `/api/invoices/generate-from-job/${jobs.id}`, {}, 201);
const fromJobAgain = await api("POST", `/api/invoices/generate-from-job/${jobs.id}`, {});
check("completed job invoicing is idempotent", () => { assert.equal(fromJob.id, fromJobAgain.id); assert.equal(fromJob.total, 165); });
const config = await api("GET", "/api/integrations");
assert.equal(config.stripe, false); assert.equal(config.email, false);
await api("POST", `/api/invoices/${own.id}/send`, { recipient: "owner@example.test", subject: "Test", message: "Test", requestKey: randomUUID() }, 503);
check("missing provider credentials fail closed, no fake sent status", () => assert.equal(db.prepare("SELECT status FROM invoices WHERE id=?").get(own.id).status, "draft"));
const invPublic = db.prepare("SELECT public_token FROM invoices WHERE id=?").get(own.id) as any;
await api("GET", `/api/public/invoices/${invPublic.public_token}`, undefined, 404, false);
db.prepare("UPDATE invoices SET status='sent',sent_at=?,public_enabled=1 WHERE id=?").run(new Date().toISOString(), own.id);
const visible = await api("GET", `/api/public/invoices/${invPublic.public_token}`, undefined, 200, false);
check("hosted invoice redacts all private fields", () => { const txt = JSON.stringify(visible); assert(!txt.includes("PRIVATE")); assert(!("internalNotes" in visible)); assert(!("customerId" in visible)); assert.equal(visible.status, "viewed"); });
await api("POST", `/api/public/invoices/${invPublic.public_token}/checkout`, {}, 503, false);
const print = await fetch(base + `/api/invoices/${own.id}/print`, { headers: { Authorization: `Bearer ${token}` } });
const html = await print.text();
check("print HTML includes service property and excludes internal notes", () => { assert.equal(print.status, 200); assert(html.includes("151 Pinnacle")); assert(!html.includes("PRIVATE")); });
const revokedUser = db.prepare("SELECT user_id FROM auth_sessions WHERE token_hash=?").get(createHash("sha256").update(token).digest("hex")) as any;
db.prepare("UPDATE auth_users SET active=0 WHERE id=?").run(revokedUser.user_id);
await api("GET", "/api/invoices", undefined, 401);
db.prepare("UPDATE auth_users SET active=1 WHERE id=?").run(revokedUser.user_id);
check("revoked membership cannot access any business data", () => {});
await api("POST", "/api/invoices/" + own.id + "/void", {});
await api("GET", `/api/public/invoices/${invPublic.public_token}`, undefined, 404, false);
check("void disables public invoice link", () => {});
console.log(`\n${checks} checks passed. Fixtures exist only in tests/.data/qa.db. No email or payment-provider API was called.`);
db.close(); original.close();
