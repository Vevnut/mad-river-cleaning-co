import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import express from "express";
import { startTestDatabase } from "./pg";

// Disposable database. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("quote-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
const { LATEST_MIGRATION } = await import("../server/migrations");
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
async function call(method: string, path: string, body?: any, signedIn = true) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(signedIn && token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const bytes = Buffer.from(await r.arrayBuffer());
  const text = bytes.toString("utf8");
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* a PDF */ }
  return { status: r.status, body: json, text, bytes, type: r.headers.get("content-type") };
}
const pub = (method: string, path: string, body?: any) => call(method, path, body, false);
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
const n = async (sql: string, ...a: any[]) => Number((await db.get(sql, ...a))!.n);
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const line = (description: string, unitPrice: number, quantity = 1) => ({ description, quantity, unitPrice });

try {
  check("the database reaches the new migration", await n("SELECT max(version) n FROM schema_migrations") === LATEST_MIGRATION);
  for (const [m, p] of [["GET", "/api/quotes"], ["POST", "/api/quotes"], ["GET", "/api/quotes/1"], ["POST", "/api/quotes/1/send"], ["POST", "/api/quotes/1/invoice"], ["GET", "/api/quotes/1/pdf"]])
    check(`${m} ${p} requires sign-in`, (await call(m, p, m === "POST" ? {} : undefined)).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "quotes@example.test", password: "Quote-test-only-123", setupToken: "quote-setup" })).body.token;

  const customer = (await db.get("SELECT id, name FROM customers ORDER BY id LIMIT 1"))!;
  const property = (await db.get("SELECT id FROM properties WHERE customer_id=? ORDER BY id LIMIT 1", customer.id))!;
  const other = (await db.get("SELECT id FROM properties WHERE customer_id<>? ORDER BY id LIMIT 1", customer.id))!;
  const dates = { issueDate: day(0), validUntil: day(30) };
  const prospect = { prospectName: "Pat Rivers", prospectCompany: "", prospectEmail: "pat@example.test", prospectPhone: "603-555-0100", prospectAddressLine1: "4 Pine Rd", prospectCity: "Lincoln", prospectState: "NH", prospectZip: "03251" };
  const make = async (extra: any = {}) => (await call("POST", "/api/quotes", { ...prospect, ...dates, internalNotes: "SECRET-MARGIN", notes: "Thanks for asking", items: [line("Deep clean", 200), line("Oven", 45.5, 2)], travelFee: 20, discountAmount: 11, ...extra })).body;
  const send = async (q: any) => (await call("POST", `/api/quotes/${q.id}/send`, {})).body;

  // Building.
  check("a quote needs a customer or a name", (await call("POST", "/api/quotes", { ...dates, items: [line("x", 1)] })).status === 400);
  check("a quote needs a line", (await call("POST", "/api/quotes", { ...prospect, ...dates, items: [] })).status === 400);
  check("valid-until can't be before the quote date", (await call("POST", "/api/quotes", { ...prospect, issueDate: day(5), validUntil: day(1), items: [line("x", 1)] })).status === 400);
  check("another customer's property is refused", (await call("POST", "/api/quotes", { customerId: customer.id, propertyId: other.id, ...dates, items: [line("x", 1)] })).status === 400);
  const a = await make();
  check("totals are worked out on the server", a.subtotal === 291 && a.total === 300);
  check("a quote gets a number", /^Q-\d{4}-\d{5}$/.test(a.quoteNumber));
  check("a new quote starts as a draft", a.status === "draft");
  check("a prospect is not a customer yet", a.isProspect && await n("SELECT count(*) n FROM customers WHERE name='Pat Rivers'") === 0);
  const key = randomUUID();
  const first = await make({ requestKey: key }), again = await make({ requestKey: key });
  check("a double-tapped save makes one quote", first.id === again.id);
  check("quotes appear in the list", (await call("GET", "/api/quotes")).body.some((q: any) => q.id === a.id && q.customerName === "Pat Rivers"));
  const pdf = await call("GET", `/api/quotes/${a.id}/pdf`);
  check("the quote makes a PDF", pdf.status === 200 && pdf.bytes.subarray(0, 4).toString() === "%PDF");

  // The customer link.
  check("a draft's link doesn't work", (await pub("GET", `/api/public/quotes/${a.publicToken}`)).status === 404);
  await send(a);
  const seen = await pub("GET", `/api/public/quotes/${a.publicToken}`);
  check("a sent quote opens with no sign-in", seen.status === 200 && seen.body.total === 300 && seen.body.items.length === 2);
  check("the link never shows internal notes", !seen.text.includes("SECRET-MARGIN") && !("internalNotes" in seen.body) && !("activity" in seen.body));
  check("the link's PDF works", (await pub("GET", `/api/public/quotes/${a.publicToken}/pdf`)).type === "application/pdf");
  check("the PDF leaves out internal notes", !(await pub("GET", `/api/public/quotes/${a.publicToken}/pdf`)).text.includes("SECRET-MARGIN"));
  check("opening it is recorded", !!(await call("GET", `/api/quotes/${a.id}`)).body.viewedAt);
  check("a made-up link fails", (await pub("GET", `/api/public/quotes/${"0".repeat(64)}`)).status === 404);
  check("accepting needs a name", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept" })).status === 400);

  // A customer can only accept the price they can see.
  const edited = (await call("PATCH", `/api/quotes/${a.id}`, { ...prospect, ...dates, items: [line("Deep clean", 250)] })).body;
  check("editing a sent quote takes it back to draft", edited.status === "draft" && edited.total === 250);
  check("and turns its link off", (await pub("GET", `/api/public/quotes/${a.publicToken}`)).status === 404);
  check("so the old price can't be accepted", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept", name: "Pat" })).status === 404);
  await send(a);
  const accepted = await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept", name: "Pat Rivers" });
  check("the customer can accept", accepted.status === 200 && accepted.body.status === "accepted" && accepted.body.responseName === "Pat Rivers");
  check("a second tap is harmless", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept", name: "Pat Rivers" })).status === 200);
  check("they can't change their answer afterward", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "decline" })).status === 409);
  check("an accepted quote can't be edited", (await call("PATCH", `/api/quotes/${a.id}`, { ...prospect, ...dates, items: [line("x", 1)] })).status === 409);
  check("an accepted quote can't be deleted", (await call("DELETE", `/api/quotes/${a.id}`)).status === 409);
  check("the answer is in the activity", (await call("GET", `/api/quotes/${a.id}`)).body.activity.some((h: any) => h.activityType === "accepted" && h.actor === "Pat Rivers"));

  // Declining and expiry.
  const b = await send(await make());
  const declined = await pub("POST", `/api/public/quotes/${b.publicToken}/respond`, { decision: "decline", note: "Too far" });
  check("the customer can decline with a note", declined.body.status === "declined" && (await call("GET", `/api/quotes/${b.id}`)).body.responseNote === "Too far");
  check("a declined quote can't become an invoice", (await call("POST", `/api/quotes/${b.id}/invoice`)).status === 409);
  const c = await send(await make());
  await db.run("UPDATE quotes SET valid_until=? WHERE id=?", day(-2), c.id);
  check("a quote past its date reads as expired", (await call("GET", `/api/quotes/${c.id}`)).body.status === "expired");
  check("an expired quote can't be accepted", (await pub("POST", `/api/public/quotes/${c.publicToken}/respond`, { decision: "accept", name: "Pat" })).status === 409);
  check("an expired quote can't be re-sent until its date is fixed", (await call("POST", `/api/quotes/${c.id}/send`, {})).status === 400);
  const d = await make();
  check("an unsent draft can be deleted", (await call("DELETE", `/api/quotes/${d.id}`)).status === 204 && await n("SELECT count(*) n FROM quote_items WHERE quote_id=?", d.id) === 0);
  const e = await send(await make());
  check("a sent quote can be canceled", (await call("POST", `/api/quotes/${e.id}/cancel`, {})).body.status === "canceled");
  check("canceling turns its link off", (await pub("GET", `/api/public/quotes/${e.publicToken}`)).status === 404);

  // Becoming an invoice.
  const inv = await call("POST", `/api/quotes/${a.id}/invoice`);
  check("an accepted quote becomes an invoice", inv.status === 201);
  const invoice = (await call("GET", `/api/invoices/${inv.body.id}`)).body;
  check("the invoice keeps the quoted total", invoice.total === 250 && invoice.status === "draft");
  check("the invoice says where it came from", invoice.internalNotes.startsWith("From quote"));
  const made = (await db.get("SELECT * FROM customers WHERE name='Pat Rivers'"))!;
  check("the prospect is now a customer", !!made && made.email === "pat@example.test" && made.billing_city === "Lincoln" && made.customer_type === "individual" && made.notes.includes(a.quoteNumber));
  const linked = (await call("GET", `/api/quotes/${a.id}`)).body;
  check("the quote links to both", linked.invoiceId === inv.body.id && Number(linked.customerId) === Number(made.id) && !linked.isProspect);
  check("a second tap opens the same invoice", (await call("POST", `/api/quotes/${a.id}/invoice`)).body.id === inv.body.id);
  check("and makes no second customer", await n("SELECT count(*) n FROM customers WHERE name='Pat Rivers'") === 1);

  // Becoming a job, after the invoice: the finished job must not bill twice.
  const schedule = { scheduledDate: day(7), scheduledTime: "09:30", durationMinutes: 180, jobType: "deep_clean" };
  check("a job needs a valid time", (await call("POST", `/api/quotes/${a.id}/job`, { ...schedule, scheduledTime: "soon" })).status === 400);
  const job = await call("POST", `/api/quotes/${a.id}/job`, schedule);
  check("an accepted quote becomes a job", job.status === 201);
  const row = (await db.get("SELECT * FROM jobs WHERE id=?", job.body.id))!;
  check("the job is scheduled at the quoted price", row.price === 250 && row.status === "scheduled" && row.scheduled_time === "09:30");
  const place = (await db.get("SELECT * FROM properties WHERE id=?", row.property_id))!;
  check("the prospect's address became a property", place.address_line1 === "4 Pine Rd" && Number(place.customer_id) === Number(made.id));
  check("a second tap opens the same job", (await call("POST", `/api/quotes/${a.id}/job`, schedule)).body.id === job.body.id);
  await db.run("UPDATE jobs SET status='completed' WHERE id=?", job.body.id);
  const fromJob = await call("POST", `/api/invoices/generate-from-job/${job.body.id}`, {});
  check("the finished job opens the quote's invoice, not a new one", Number(fromJob.body.id) === Number(inv.body.id) && await n("SELECT count(*) n FROM invoices WHERE customer_id=?", made.id) === 1);
  check("and the job reads as invoiced", (await db.get("SELECT status FROM jobs WHERE id=?", job.body.id))!.status === "invoiced");
  const typed = await call("POST", "/api/invoices", { customerId: made.id, propertyId: row.property_id, jobId: job.body.id, issueDate: day(0), dueDate: day(10), rateType: "custom", items: [line("Dup", 5)] });
  check("the invoice form can't double-bill it either", Number(typed.body.id) === Number(inv.body.id));

  // Job first, then invoice.
  const f = await send(await make({ prospectName: "Sam Brook", prospectAddressLine1: "9 Oak St" }));
  await pub("POST", `/api/public/quotes/${f.publicToken}/respond`, { decision: "accept", name: "Sam" });
  const jobF = (await call("POST", `/api/quotes/${f.id}/job`, schedule)).body;
  await db.run("UPDATE jobs SET status='completed' WHERE id=?", jobF.id);
  const invF = (await call("POST", `/api/quotes/${f.id}/invoice`)).body;
  const invRow = (await db.get("SELECT job_id FROM invoices WHERE id=?", invF.id))!;
  check("an invoice made after a finished job links to it", Number(invRow.job_id) === Number(jobF.id));
  check("that job reads as invoiced", (await db.get("SELECT status FROM jobs WHERE id=?", jobF.id))!.status === "invoiced");

  // Existing customers, including property prices.
  await db.run("UPDATE properties SET standard_departure_rate=150 WHERE id=?", property.id);
  const defaults = (await call("GET", `/api/properties/${property.id}/invoice-defaults?rateType=standard`)).body;
  const g = (await call("POST", "/api/quotes", { customerId: customer.id, propertyId: property.id, rateType: "standard", ...dates, items: defaults.items })).body;
  check("an existing customer's quote uses their property prices", !g.isProspect && g.propertyId === property.id && g.items.length === defaults.items.length && g.items[0].lineItemType === "standard_rate" && g.total === defaults.items.reduce((t: number, i: any) => t + i.quantity * i.unitPrice, 0));
  const before = await n("SELECT count(*) n FROM customers");
  await call("POST", `/api/quotes/${g.id}/send`, {});
  check("a phone answer can be recorded", (await call("POST", `/api/quotes/${g.id}/respond`, { decision: "accept" })).body.status === "accepted");
  const invG = await call("POST", `/api/quotes/${g.id}/invoice`);
  check("an existing customer's quote becomes an invoice", invG.status === 201 && await n("SELECT count(*) n FROM customers") === before);
  const noPlace = (await call("POST", "/api/quotes", { customerId: customer.id, ...dates, items: [line("x", 10)] })).body;
  await call("POST", `/api/quotes/${noPlace.id}/respond`, { decision: "accept" });
  check("a job needs a property when the quote has none", (await call("POST", `/api/quotes/${noPlace.id}/job`, schedule)).status === 400);
  check("another customer's property is refused for a job", (await call("POST", `/api/quotes/${noPlace.id}/job`, { ...schedule, propertyId: other.id })).status === 400);
  check("picking their own property works", (await call("POST", `/api/quotes/${noPlace.id}/job`, { ...schedule, propertyId: property.id })).status === 201);

  // Deleting what a quote made.
  const del = await call("POST", `/api/invoices/${invG.body.id}/delete`, { confirmInvoiceNumber: (await call("GET", `/api/invoices/${invG.body.id}`)).body.invoiceNumber, understood: true });
  check("an invoice made from a quote can still be deleted", del.status === 200);
  check("the quote can make a fresh one", (await call("GET", `/api/quotes/${g.id}`)).body.invoiceId === null && (await call("POST", `/api/quotes/${g.id}/invoice`)).status === 201);

  console.log(`${count} quote checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
