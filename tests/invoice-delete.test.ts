import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

// Disposable copy of the database. Never touches real invoices.
mkdirSync("tests/.data", { recursive: true });
process.env.DATABASE_PATH = "tests/.data/invoice-delete.db";
process.env.PHOTO_DIR = "tests/.data/invoice-delete-photos";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("delete-test-setup").digest("hex");
const original = new Database("data.db", { readonly: true });
await original.backup(process.env.DATABASE_PATH);
original.close();
const { registerRoutes } = await import("../server/routes");
const { sqlite: db } = await import("../server/storage");
db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || 500).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
async function call(method: string, path: string, body?: any) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
const n = (sql: string, ...a: any[]) => (db.prepare(sql).get(...a) as any).n;

try {
  const customerId = (db.prepare("SELECT id FROM customers ORDER BY id LIMIT 1").get() as any).id;
  const make = async () => (await call("POST", "/api/invoices", { customerId, issueDate: "2026-09-20", dueDate: "2026-10-05",
    items: [{ description: "Test clean", quantity: 1, unitPrice: 120 }] })).body;

  check("deleting requires sign-in", (await call("POST", "/api/invoices/1/delete", {})).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "delete@example.test", password: "Delete-test-only-123", setupToken: "delete-test-setup" })).body.token;

  const a = await make();
  check("the old one-click DELETE no longer removes invoices", (await call("DELETE", `/api/invoices/${a.id}`)).status === 409 && n("SELECT count(*) n FROM invoices WHERE id=?", a.id) === 1);
  check("a request without confirmation is refused", (await call("POST", `/api/invoices/${a.id}/delete`, {})).status === 400);
  check("the wrong invoice number is refused", (await call("POST", `/api/invoices/${a.id}/delete`, { confirmInvoiceNumber: "INV-WRONG", understood: true })).status === 400);
  check("skipping the 'I understand' step is refused", (await call("POST", `/api/invoices/${a.id}/delete`, { confirmInvoiceNumber: a.invoiceNumber, understood: false })).status === 400);
  check("the invoice survives every refused attempt", n("SELECT count(*) n FROM invoices WHERE id=?", a.id) === 1);

  const ok = await call("POST", `/api/invoices/${a.id}/delete`, { confirmInvoiceNumber: ` ${a.invoiceNumber.toLowerCase()} `, understood: true });
  check("a fully confirmed draft is deleted", ok.status === 200 && n("SELECT count(*) n FROM invoices WHERE id=?", a.id) === 0);
  check("its line items and history are removed", n("SELECT count(*) n FROM invoice_items WHERE invoice_id=?", a.id) === 0 && n("SELECT count(*) n FROM invoice_activity WHERE invoice_id=?", a.id) === 0);
  const archived = db.prepare("SELECT * FROM deleted_invoices WHERE invoice_id=?").get(a.id) as any;
  check("a restorable copy is kept with who deleted it", !!archived && archived.deleted_by === "delete@example.test" && JSON.parse(archived.snapshot).items.length === 1);

  const b = await make();
  const pay = await call("POST", "/api/payments", { invoiceId: b.id, amount: 120, method: "venmo", paidDate: "2026-09-21", reference: "", note: "", requestKey: randomUUID() });
  check("test payment recorded", pay.status === 201);
  const paidDel = await call("POST", `/api/invoices/${b.id}/delete`, { confirmInvoiceNumber: b.invoiceNumber, understood: true });
  check("a paid invoice with a manual payment can be deleted", paidDel.status === 200 && n("SELECT count(*) n FROM invoices WHERE id=?", b.id) === 0);
  check("its manual payment is removed and archived", n("SELECT count(*) n FROM payments WHERE invoice_id=?", b.id) === 0
    && JSON.parse((db.prepare("SELECT snapshot FROM deleted_invoices WHERE invoice_id=?").get(b.id) as any).snapshot).payments.length === 1);

  const c = await make();
  db.prepare("INSERT INTO payments (invoice_id, amount, method, paid_date, provider, provider_transaction_id, status, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(c.id, 120, "card", "2026-09-21", "stripe", "pi_test_only", "succeeded", new Date().toISOString());
  check("an invoice with a Stripe card payment is refused", (await call("POST", `/api/invoices/${c.id}/delete`, { confirmInvoiceNumber: c.invoiceNumber, understood: true })).status === 409
    && n("SELECT count(*) n FROM invoices WHERE id=?", c.id) === 1);

  check("database links stay consistent", (db.pragma("foreign_key_check") as any[]).length === 0);
  console.log(`${count} invoice-delete checks passed.`);
} finally {
  server.close();
  db.close();
}
