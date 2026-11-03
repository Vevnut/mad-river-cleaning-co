import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";
import { mkdirSync } from "node:fs";
import { errorHandler } from "../server/errors";

// Disposable copy of the database. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("guards-test-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.set("trust proxy", 1); // same as server/index.ts behind the host's proxy
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.get("/test/crash-500", () => { throw Object.assign(new Error("SQLITE_IOERR at /srv/data.db secret_path"), { status: 500 }); });
app.get("/test/crash", () => { throw new TypeError("Cannot read properties of undefined (reading 'secret_column')"); });
app.use(errorHandler); // the real handler from server/index.ts
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
async function call(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const r = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
const email = "guards@example.test", password = "Guards-test-only-123";
const login = (from: string, pw = password, who = email) => call("POST", "/api/auth/login", { email: who, password: pw }, { "X-Forwarded-For": from });

try {
  token = (await call("POST", "/api/auth/setup", { email, password, setupToken: "guards-test-setup" })).body.token;
  await check("setup signs in", !!token);

  // Requests with no body used to crash the property/job checks with a 500.
  await check("adding a property with no body is a 400, not a crash", (await call("POST", "/api/properties")).status === 400);
  await check("adding a job with no body is a 400, not a crash", (await call("POST", "/api/jobs")).status === 400);

  // Unexpected crashes don't show internal details; known database conflicts get a clear message.
  const crash = await call("GET", "/test/crash");
  await check("a crash returns a plain message without internal details", crash.status === 500 && !crash.body.message.includes("secret_column"));
  const crash500 = await call("GET", "/test/crash-500");
  await check("a server error with a status still hides internal details", crash500.status === 500 && !crash500.body.message.includes("secret_path"));
  const dupe = await call("POST", "/api/team", { email, password });
  await check("adding an account that exists says so", dupe.status === 409 && dupe.body.message === "An account with this email already exists.");

  // "$'" and "$&" in a property name used to splice extra HTML into the printed invoice.
  const p = (await db.get("SELECT id, customer_id FROM properties ORDER BY id LIMIT 1")) as any;
  (await db.run("UPDATE properties SET name=? WHERE id=?", "Cabin $' Lodge", p.id));
  const inv = (await call("POST", "/api/invoices", { customerId: p.customer_id, propertyId: p.id, issueDate: "2026-09-20", dueDate: "2026-10-05",
    items: [{ description: "Test clean", quantity: 1, unitPrice: 120 }] })).body;
  const print = await fetch(`${base}/api/invoices/${inv.id}/print`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text());
  await check("a property name with $ prints exactly as typed", print.includes("Cabin $&#39; Lodge") && !print.includes("Cabin <table>"));

  // Invoice layout: logo, service property beside Bill To, no doubled company name, $1,234.00 money, terms.
  (await db.run("UPDATE customers SET name=company_name WHERE id=? AND company_name IS NOT NULL", p.customer_id));
  const big = (await call("POST", "/api/invoices", { customerId: p.customer_id, propertyId: p.id, issueDate: "2026-09-20", dueDate: "2026-10-05",
    items: [{ description: "Deep clean", quantity: 1, unitPrice: 1234 }] })).body;
  const sheet = await fetch(`${base}/api/invoices/${big.id}/print`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text());
  const company = ((await db.get("SELECT coalesce(company_name, name) n FROM customers WHERE id=?", p.customer_id)) as any).n;
  await check("the invoice shows the logo", /<img class="logo" src="data:image\/png;base64,/.test(sheet));
  await check("the service property has its own box", sheet.includes(">Service property<") && sheet.includes("Cabin $&#39; Lodge"));
  await check("the company name isn't printed twice", sheet.split(`>${company.replace(/'/g, "&#39;")}<`).length === 2);
  await check("money has thousands separators", sheet.includes("$1,234.00"));
  await check("payment terms are shown", sheet.includes("Net 15"));

  // Downloadable PDF: a real PDF with a proper file name, for the owner and the customer's link only.
  const pdfRes = await fetch(`${base}/api/invoices/${big.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  const disp = pdfRes.headers.get("content-disposition") || "";
  await check("the invoice downloads as a PDF", pdfRes.status === 200 && pdfRes.headers.get("content-type") === "application/pdf" && pdfBytes.subarray(0, 5).toString() === "%PDF-");
  await check("the PDF is named for the business, invoice number and customer",
    disp.startsWith("attachment;") && decodeURIComponent(disp.split("filename*=UTF-8''")[1] || "") === `${((await db.get("SELECT business_name n FROM app_settings")) as any).n} - Invoice ${big.invoiceNumber} - ${company}.pdf`);
  await check("signed-out visitors can't download it", (await fetch(`${base}/api/invoices/${big.id}/pdf`)).status === 401);
  const link = ((await db.get("SELECT public_token t FROM invoices WHERE id=?", big.id)) as any).t;
  (await db.run("UPDATE invoices SET public_token=?, public_enabled=1 WHERE id=?", link || "b".repeat(64), big.id));
  const pubPdf = await fetch(`${base}/api/public/invoices/${link || "b".repeat(64)}/pdf`);
  await check("the customer's invoice link offers the same PDF", pubPdf.status === 200 && Buffer.from(await pubPdf.arrayBuffer()).subarray(0, 5).toString() === "%PDF-");
  await check("a made-up invoice link gets no PDF", (await fetch(`${base}/api/public/invoices/${"c".repeat(64)}/pdf`)).status === 404);
  (await db.run("UPDATE invoices SET public_enabled=0 WHERE id=?", big.id));
  await check("a turned-off invoice link gets no PDF", (await fetch(`${base}/api/public/invoices/${link || "b".repeat(64)}/pdf`)).status === 404);

  // An invoice made from a job uses the property's invoice notes, not the cleaner's job notes.
  (await db.run("UPDATE properties SET invoice_notes=? WHERE id=?", "Thank you for staying with us!", p.id));
  const jobId = (await db.insertId(`INSERT INTO jobs (property_id, customer_id, job_type, scheduled_date, scheduled_time, duration_minutes, status, customer_notes, price, rate_type)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, p.id, p.customer_id, "turnover", "2026-09-19", "10:00", 120, "completed", "Water the plants", 150, "custom"));
  const fromJob = (await call("POST", `/api/invoices/generate-from-job/${jobId}`, {})).body;
  await check("an invoice from a job uses the property's invoice notes", fromJob.notes === "Thank you for staying with us!");
  token = "";

  // Behind the proxy each visitor gets their own sign-in limit.
  for (let i = 0; i < 20; i++) await login("203.0.113.1", "wrong-password-123", `nobody${i}@example.test`);
  await check("one visitor is limited after 20 tries", (await login("203.0.113.1")).status === 429);
  await check("another visitor can still sign in", (await login("203.0.113.2")).status === 200);

  // Spreading guesses across many addresses still stops at the per-account limit.
  await db.exec("DELETE FROM auth_rate_limits");
  for (let i = 0; i < 50; i++) assert.equal((await login(`198.51.100.${i}`, "wrong-password-123")).status, 401);
  await check("guessing one account from many addresses is limited", (await login("198.51.100.200")).status === 429);
  await check("other accounts are not affected", (await login("198.51.100.201", "wrong-password-123", "other@example.test")).status === 401);
  console.log(`${count} request-guard checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
