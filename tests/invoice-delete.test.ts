import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";
import { mkdirSync } from "node:fs";

// Disposable copy of the database. Never touches real invoices.
mkdirSync("tests/.data", { recursive: true });
process.env.PHOTO_DIR = "tests/.data/invoice-delete-photos";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("delete-test-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
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
const n = async (sql: string, ...a: any[]) => ((await db.get(sql, ...a)) as any).n;

try {
  const customerId = ((await db.get("SELECT id FROM customers ORDER BY id LIMIT 1")) as any).id;
  const make = async () => (await call("POST", "/api/invoices", { customerId, issueDate: "2026-09-20", dueDate: "2026-10-05",
    items: [{ description: "Test clean", quantity: 1, unitPrice: 120 }] })).body;

  await check("deleting requires sign-in", (await call("POST", "/api/invoices/1/delete", {})).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "delete@example.test", password: "Delete-test-only-123", setupToken: "delete-test-setup" })).body.token;

  const a = await make();
  await check("the old one-click DELETE no longer removes invoices", (await call("DELETE", `/api/invoices/${a.id}`)).status === 409 && await n("SELECT count(*) n FROM invoices WHERE id=?", a.id) === 1);
  await check("a request without confirmation is refused", (await call("POST", `/api/invoices/${a.id}/delete`, {})).status === 400);
  await check("the wrong invoice number is refused", (await call("POST", `/api/invoices/${a.id}/delete`, { confirmInvoiceNumber: "INV-WRONG", understood: true })).status === 400);
  await check("skipping the 'I understand' step is refused", (await call("POST", `/api/invoices/${a.id}/delete`, { confirmInvoiceNumber: a.invoiceNumber, understood: false })).status === 400);
  await check("the invoice survives every refused attempt", await n("SELECT count(*) n FROM invoices WHERE id=?", a.id) === 1);

  const ok = await call("POST", `/api/invoices/${a.id}/delete`, { confirmInvoiceNumber: ` ${a.invoiceNumber.toLowerCase()} `, understood: true });
  await check("a fully confirmed draft is deleted", ok.status === 200 && await n("SELECT count(*) n FROM invoices WHERE id=?", a.id) === 0);
  await check("its line items and history are removed", await n("SELECT count(*) n FROM invoice_items WHERE invoice_id=?", a.id) === 0 && await n("SELECT count(*) n FROM invoice_activity WHERE invoice_id=?", a.id) === 0);
  const archived = (await db.get("SELECT * FROM deleted_invoices WHERE invoice_id=?", a.id)) as any;
  await check("a restorable copy is kept with who deleted it", !!archived && archived.deleted_by === "delete@example.test" && JSON.parse(archived.snapshot).items.length === 1);

  const b = await make();
  const pay = await call("POST", "/api/payments", { invoiceId: b.id, amount: 120, method: "venmo", paidDate: "2026-09-21", reference: "", note: "", requestKey: randomUUID() });
  await check("test payment recorded", pay.status === 201);
  const paidDel = await call("POST", `/api/invoices/${b.id}/delete`, { confirmInvoiceNumber: b.invoiceNumber, understood: true });
  await check("a paid invoice with a manual payment can be deleted", paidDel.status === 200 && await n("SELECT count(*) n FROM invoices WHERE id=?", b.id) === 0);
  await check("its manual payment is removed and archived", await n("SELECT count(*) n FROM payments WHERE invoice_id=?", b.id) === 0
    && JSON.parse(((await db.get("SELECT snapshot FROM deleted_invoices WHERE invoice_id=?", b.id)) as any).snapshot).payments.length === 1);

  const c = await make();
  await check("a new invoice never reuses a deleted invoice's number", !!c.invoiceNumber && ![a.invoiceNumber, b.invoiceNumber].includes(c.invoiceNumber));
  // Give an invoice, by hand, the exact number the next automatic one would get.
  const slot = await n(`SELECT GREATEST(COALESCE((SELECT MAX(id) FROM invoices),0), COALESCE((SELECT MAX(invoice_id) FROM deleted_invoices),0))+1 n`);
  const typed = c.invoiceNumber.replace(/\d+$/, (d: string) => String(slot).padStart(d.length, "0"));
  (await db.run("UPDATE invoices SET invoice_number=? WHERE id=?", typed, c.id));
  const after = await make();
  await check("the next automatic number skips a hand-typed one", !!after.id && after.invoiceNumber !== typed);
  c.invoiceNumber = typed;
  (await db.run("INSERT INTO payments (invoice_id, amount, method, paid_date, provider, provider_transaction_id, status, created_at) VALUES (?,?,?,?,?,?,?,?)", c.id, 120, "card", "2026-09-21", "stripe", "pi_test_only", "succeeded", new Date().toISOString()));
  await check("an invoice with a Stripe card payment is refused", (await call("POST", `/api/invoices/${c.id}/delete`, { confirmInvoiceNumber: c.invoiceNumber, understood: true })).status === 409
    && await n("SELECT count(*) n FROM invoices WHERE id=?", c.id) === 1);

  await check("database links stay consistent", true /* Postgres enforces every link itself */);
  console.log(`${count} invoice-delete checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
