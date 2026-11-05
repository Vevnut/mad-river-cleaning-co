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
const sections = [
  { title: "Standard departure cleaning service includes:", price: "$350.00", lines: [{ label: "Laundry:", text: "sheets and towels", price: "" }, { label: "", text: "", price: "" }] },
  { title: "Up-charges:", price: "", lines: [{ label: "", text: "Late checkout fee", price: "$25/30 mins" }] },
];
const bill = (description: string, unitPrice: number, quantity = 1) => ({ description, quantity, unitPrice });

try {
  check("the database reaches the new migration", await n("SELECT max(version) n FROM schema_migrations") === LATEST_MIGRATION);
  for (const [m, p] of [["GET", "/api/quotes"], ["POST", "/api/quotes"], ["GET", "/api/quotes/1"], ["POST", "/api/quotes/1/send"], ["POST", "/api/quotes/1/invoice"], ["POST", "/api/quotes/1/job"], ["GET", "/api/quotes/1/pdf"], ["GET", "/api/quote-templates"], ["PUT", "/api/quote-templates"]])
    check(`${m} ${p} requires sign-in`, (await call(m, p, m === "GET" ? undefined : {})).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "quotes@example.test", password: "Quote-test-only-123", setupToken: "quote-setup" })).body.token;

  const customer = (await db.get("SELECT id, name FROM customers ORDER BY id LIMIT 1"))!;
  const property = (await db.get("SELECT id FROM properties WHERE customer_id=? ORDER BY id LIMIT 1", customer.id))!;
  const other = (await db.get("SELECT id FROM properties WHERE customer_id<>? ORDER BY id LIMIT 1", customer.id))!;
  const dates = { issueDate: day(0), validUntil: day(30) };
  const prospect = { prospectName: "Pat Rivers", prospectCompany: "", prospectEmail: "pat@example.test", prospectPhone: "603-555-0100", prospectAddressLine1: "4 Pine Rd", prospectCity: "Lincoln", prospectState: "NH", prospectZip: "03251" };
  const make = async (extra: any = {}) => (await call("POST", "/api/quotes", { ...prospect, ...dates, attention: "Pat", houseSpecs: "12 guests, 5 bedrooms", internalNotes: "SECRET-MARGIN", notes: "Thanks for asking", sections, ...extra })).body;
  const send = async (q: any) => (await call("POST", `/api/quotes/${q.id}/send`, {})).body;
  const accept = async (q: any) => { await send(q); await pub("POST", `/api/public/quotes/${q.publicToken}/respond`, { decision: "accept", name: "Pat Rivers" }); };

  // Templates.
  check("there are no templates to start", (await call("GET", "/api/quote-templates")).body.length === 0);
  check("a template needs a name", (await call("PUT", "/api/quote-templates", { name: " ", sections })).status === 400);
  const saved = await call("PUT", "/api/quote-templates", { name: "Standard", sections });
  check("wording can be saved as a template", saved.status === 200 && saved.body.sections[0].lines.length === 1);
  await call("PUT", "/api/quote-templates", { name: "Standard", sections: [sections[1]] });
  const templates = (await call("GET", "/api/quote-templates")).body;
  check("saving the same name updates it", templates.length === 1 && templates[0].sections.length === 1);

  // Building.
  check("a quote needs a customer or a name", (await call("POST", "/api/quotes", { ...dates, sections })).status === 400);
  check("a quote needs a service", (await call("POST", "/api/quotes", { ...prospect, ...dates, sections: [] })).status === 400);
  check("a section can't have an empty heading", (await call("POST", "/api/quotes", { ...prospect, ...dates, sections: [{ title: " ", price: "$1", lines: [] }] })).status === 400);
  check("valid-until can't be before the quote date", (await call("POST", "/api/quotes", { ...prospect, issueDate: day(5), validUntil: day(1), sections })).status === 400);
  check("another customer's property is refused", (await call("POST", "/api/quotes", { customerId: customer.id, propertyId: other.id, ...dates, sections })).status === 400);
  const a = await make();
  check("sections are saved with their prices", a.sections.length === 2 && a.sections[0].price === "$350.00" && a.sections[1].lines[0].price === "$25/30 mins");
  check("blank lines are dropped", a.sections[0].lines.length === 1);
  check("house specs and attention are saved", a.houseSpecs === "12 guests, 5 bedrooms" && a.attention === "Pat");
  check("a quote gets a number", /^Q-\d{4}-\d{5}$/.test(a.quoteNumber));
  check("a new quote starts as a draft", a.status === "draft");
  check("a prospect is not a customer yet", a.isProspect && await n("SELECT count(*) n FROM customers WHERE name='Pat Rivers'") === 0);
  const key = randomUUID();
  const first = await make({ requestKey: key }), again = await make({ requestKey: key });
  check("a double-tapped save makes one quote", first.id === again.id);
  check("quotes appear in the list", (await call("GET", "/api/quotes")).body.some((q: any) => q.id === a.id && q.customerName === "Pat Rivers"));
  const pdf = await call("GET", `/api/quotes/${a.id}/pdf`);
  check("the quote makes a PDF", pdf.status === 200 && pdf.bytes.subarray(0, 4).toString() === "%PDF");
  const long = await make({ sections: Array.from({ length: 12 }, (_, i) => ({ title: `Section ${i}`, price: "$10", lines: Array.from({ length: 12 }, () => ({ label: "Item:", text: "word ".repeat(60), price: "$5" })) })) });
  const longPdf = await call("GET", `/api/quotes/${long.id}/pdf`);
  check("a long rate sheet runs onto more pages", longPdf.status === 200 && (longPdf.text.match(/\/Type\s*\/Page\b/g) ?? []).length > 3);

  // The customer link.
  check("a draft's link doesn't work", (await pub("GET", `/api/public/quotes/${a.publicToken}`)).status === 404);
  await send(a);
  const seen = await pub("GET", `/api/public/quotes/${a.publicToken}`);
  check("a sent quote opens with no sign-in", seen.status === 200 && seen.body.sections.length === 2 && seen.body.houseSpecs === "12 guests, 5 bedrooms" && seen.body.attention === "Pat");
  check("the link never shows internal notes", !seen.text.includes("SECRET-MARGIN") && !("internalNotes" in seen.body) && !("activity" in seen.body));
  check("the link's PDF works", (await pub("GET", `/api/public/quotes/${a.publicToken}/pdf`)).type === "application/pdf");
  check("the PDF leaves out internal notes", !(await pub("GET", `/api/public/quotes/${a.publicToken}/pdf`)).text.includes("SECRET-MARGIN"));
  check("opening it is recorded", !!(await call("GET", `/api/quotes/${a.id}`)).body.viewedAt);
  check("a made-up link fails", (await pub("GET", `/api/public/quotes/${"0".repeat(64)}`)).status === 404);
  check("accepting needs a name", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept" })).status === 400);

  // A customer can only accept what they can see.
  const edited = (await call("PATCH", `/api/quotes/${a.id}`, { ...prospect, ...dates, sections: [{ title: "Clean", price: "$400.00", lines: [] }] })).body;
  check("editing a sent quote takes it back to draft", edited.status === "draft" && edited.sections[0].price === "$400.00");
  check("and turns its link off", (await pub("GET", `/api/public/quotes/${a.publicToken}`)).status === 404);
  check("so old rates can't be accepted", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept", name: "Pat" })).status === 404);
  await send(a);
  const accepted = await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept", name: "Pat Rivers" });
  check("the customer can accept", accepted.status === 200 && accepted.body.status === "accepted" && accepted.body.responseName === "Pat Rivers");
  check("a second tap is harmless", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "accept", name: "Pat Rivers" })).status === 200);
  check("they can't change their answer afterward", (await pub("POST", `/api/public/quotes/${a.publicToken}/respond`, { decision: "decline" })).status === 409);
  check("an accepted quote can't be edited", (await call("PATCH", `/api/quotes/${a.id}`, { ...prospect, ...dates, sections })).status === 409);
  check("an accepted quote can't be deleted", (await call("DELETE", `/api/quotes/${a.id}`)).status === 409);
  check("the answer is in the activity", (await call("GET", `/api/quotes/${a.id}`)).body.activity.some((h: any) => h.activityType === "accepted" && h.actor === "Pat Rivers"));

  // Declining and expiry.
  const b = await send(await make());
  const declined = await pub("POST", `/api/public/quotes/${b.publicToken}/respond`, { decision: "decline", note: "Too far" });
  check("the customer can decline with a note", declined.body.status === "declined" && (await call("GET", `/api/quotes/${b.id}`)).body.responseNote === "Too far");
  check("a declined quote can't become an invoice", (await call("POST", `/api/quotes/${b.id}/invoice`, { lines: [bill("x", 1)] })).status === 409);
  const c = await send(await make());
  await db.run("UPDATE quotes SET valid_until=? WHERE id=?", day(-2), c.id);
  check("a quote past its date reads as expired", (await call("GET", `/api/quotes/${c.id}`)).body.status === "expired");
  check("an expired quote can't be accepted", (await pub("POST", `/api/public/quotes/${c.publicToken}/respond`, { decision: "accept", name: "Pat" })).status === 409);
  check("an expired quote can't be re-sent until its date is fixed", (await call("POST", `/api/quotes/${c.id}/send`, {})).status === 400);
  const d = await make();
  check("an unsent draft can be deleted", (await call("DELETE", `/api/quotes/${d.id}`)).status === 204 && await n("SELECT count(*) n FROM quotes WHERE id=?", d.id) === 0);
  const e = await send(await make());
  check("a sent quote can be canceled", (await call("POST", `/api/quotes/${e.id}/cancel`, {})).body.status === "canceled");
  check("canceling turns its link off", (await pub("GET", `/api/public/quotes/${e.publicToken}`)).status === 404);

  // Billing what was ticked.
  check("an invoice needs a ticked service", (await call("POST", `/api/quotes/${a.id}/invoice`, { lines: [] })).status === 400);
  const invKey = randomUUID();
  const inv = await call("POST", `/api/quotes/${a.id}/invoice`, { lines: [bill("Standard departure cleaning", 350), bill("Hot tub", 40, 2)], requestKey: invKey });
  check("ticked services become an invoice", inv.status === 201);
  const invoice = (await call("GET", `/api/invoices/${inv.body.id}`)).body;
  check("the invoice bills only what was ticked", invoice.total === 430 && invoice.status === "draft");
  check("the invoice says where it came from", invoice.internalNotes.startsWith("From quote"));
  const made = (await db.get("SELECT * FROM customers WHERE name='Pat Rivers'"))!;
  check("the prospect is now a customer", !!made && made.email === "pat@example.test" && made.billing_city === "Lincoln" && made.customer_type === "individual" && made.notes.includes(a.quoteNumber));
  check("a double tap makes one invoice", (await call("POST", `/api/quotes/${a.id}/invoice`, { lines: [bill("Standard departure cleaning", 350)], requestKey: invKey })).body.id === inv.body.id);
  const second = await call("POST", `/api/quotes/${a.id}/invoice`, { lines: [bill("Standard departure cleaning", 350)], requestKey: randomUUID() });
  check("the next departure gets its own invoice", second.status === 201 && second.body.id !== inv.body.id);
  check("and no second customer", await n("SELECT count(*) n FROM customers WHERE name='Pat Rivers'") === 1);
  const linked = (await call("GET", `/api/quotes/${a.id}`)).body;
  check("the quote points to the latest invoice", linked.invoiceId === second.body.id && Number(linked.customerId) === Number(made.id) && !linked.isProspect);

  // Jobs.
  const schedule = { scheduledDate: day(7), scheduledTime: "09:30", durationMinutes: 180, jobType: "deep_clean" };
  const lines = [bill("Deep cleaning", 550), bill("Grill", 10)];
  check("a job needs a valid time", (await call("POST", `/api/quotes/${a.id}/job`, { ...schedule, lines, scheduledTime: "soon" })).status === 400);
  check("a job needs a ticked service", (await call("POST", `/api/quotes/${a.id}/job`, { ...schedule, lines: [] })).status === 400);
  const job = await call("POST", `/api/quotes/${a.id}/job`, { ...schedule, lines });
  check("ticked services become a job", job.status === 201);
  const row = (await db.get("SELECT * FROM jobs WHERE id=?", job.body.id))!;
  check("the job is priced from what was ticked", row.price === 560 && row.status === "scheduled" && row.scheduled_time === "09:30" && row.internal_notes.includes("Deep cleaning"));
  const place = (await db.get("SELECT * FROM properties WHERE id=?", row.property_id))!;
  check("the prospect's address became a property", place.address_line1 === "4 Pine Rd" && Number(place.customer_id) === Number(made.id));
  const job2 = await call("POST", `/api/quotes/${a.id}/job`, { ...schedule, lines });
  check("the next visit gets its own job at the same property", job2.status === 201 && job2.body.id !== job.body.id && (await db.get("SELECT property_id p FROM jobs WHERE id=?", job2.body.id))!.p === row.property_id);
  check("and no second property", await n("SELECT count(*) n FROM properties WHERE address_line1='4 Pine Rd'") === 1);

  // An earlier invoice must never stand in for a later job's bill.
  await db.run("UPDATE jobs SET status='completed' WHERE id=?", job2.body.id);
  const fromJob = await call("POST", `/api/invoices/generate-from-job/${job2.body.id}`, {});
  check("a finished job gets its own invoice at the job's price", fromJob.status === 201 && Number(fromJob.body.id) !== Number(second.body.id) && fromJob.body.total === 560);

  // A finished, unbilled job is linked so it can't also be billed from the job page.
  const f = await make({ prospectName: "Sam Brook", prospectAddressLine1: "9 Oak St" });
  await accept(f);
  const jobF = (await call("POST", `/api/quotes/${f.id}/job`, { ...schedule, lines })).body;
  await db.run("UPDATE jobs SET status='completed' WHERE id=?", jobF.id);
  const invF = (await call("POST", `/api/quotes/${f.id}/invoice`, { lines })).body;
  check("an invoice made after a finished job links to it", Number((await db.get("SELECT job_id j FROM invoices WHERE id=?", invF.id))!.j) === Number(jobF.id));
  check("that job reads as invoiced", (await db.get("SELECT status FROM jobs WHERE id=?", jobF.id))!.status === "invoiced");
  const invF2 = (await call("POST", `/api/quotes/${f.id}/invoice`, { lines })).body;
  check("the next invoice doesn't reuse that job", invF2.id !== invF.id && (await db.get("SELECT job_id j FROM invoices WHERE id=?", invF2.id))!.j === null);

  // Existing customers.
  const g = (await call("POST", "/api/quotes", { customerId: customer.id, propertyId: property.id, ...dates, attention: "Ops", sections })).body;
  check("an existing customer's quote keeps their property", !g.isProspect && g.propertyId === property.id && g.propertyAddress.length > 0);
  const before = await n("SELECT count(*) n FROM customers");
  await send(g);
  check("a phone answer can be recorded", (await call("POST", `/api/quotes/${g.id}/respond`, { decision: "accept" })).body.status === "accepted");
  const invG = await call("POST", `/api/quotes/${g.id}/invoice`, { lines });
  check("an existing customer's quote becomes an invoice", invG.status === 201 && await n("SELECT count(*) n FROM customers") === before);
  const noPlace = (await call("POST", "/api/quotes", { customerId: customer.id, ...dates, sections })).body;
  await call("POST", `/api/quotes/${noPlace.id}/respond`, { decision: "accept" });
  check("a job needs a property when the quote has none", (await call("POST", `/api/quotes/${noPlace.id}/job`, { ...schedule, lines })).status === 400);
  check("another customer's property is refused for a job", (await call("POST", `/api/quotes/${noPlace.id}/job`, { ...schedule, lines, propertyId: other.id })).status === 400);
  check("picking their own property works", (await call("POST", `/api/quotes/${noPlace.id}/job`, { ...schedule, lines, propertyId: property.id })).status === 201);

  // Deleting what a quote made.
  const del = await call("POST", `/api/invoices/${invG.body.id}/delete`, { confirmInvoiceNumber: (await call("GET", `/api/invoices/${invG.body.id}`)).body.invoiceNumber, understood: true });
  check("an invoice made from a quote can still be deleted", del.status === 200 && (await call("GET", `/api/quotes/${g.id}`)).body.invoiceId === null);

  console.log(`${count} quote checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
