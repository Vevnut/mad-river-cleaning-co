import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { mkdirSync, rmSync, readdirSync } from "node:fs";

// Disposable database and receipt folder. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.DATABASE_PATH = "tests/.data/expenses.db";
process.env.PHOTO_DIR = "tests/.data/expenses-photos";
process.env.RECEIPT_DIR = "tests/.data/expenses-receipts";
rmSync(process.env.RECEIPT_DIR, { recursive: true, force: true });
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("expense-test-setup").digest("hex");
const original = new Database("data.db", { readonly: true });
await original.backup(process.env.DATABASE_PATH);
original.close();
const { registerRoutes } = await import("../server/routes");
const { sqlite: db } = await import("../server/storage");
const { irsRateFor } = await import("../shared/expenses");
db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || 500).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
async function call(method: string, path: string, body?: any, type = "application/json") {
  const r = await fetch(base + path, { method, headers: { "Content-Type": type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  const t = r.headers.get("content-type")?.includes("json") ? await r.text() : "";
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
const jpeg = readFileSync("tests/fixtures/tiny.jpg");

try {
  check("IRS rate: 72.5¢ in the first half of 2026", irsRateFor("2026-03-10").rate === 0.725);
  check("IRS rate: 76¢ from July 1, 2026", irsRateFor("2026-07-01").rate === 0.76 && irsRateFor("2026-06-30").rate === 0.725);
  check("IRS rate: 2027 trips are flagged to check", irsRateFor("2027-02-01").confirmed === false);

  check("expenses require sign-in", (await call("GET", "/api/expenses")).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "expenses@example.test", password: "Expense-test-only-123", setupToken: "expense-test-setup" })).body.token;

  const trip = await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-21", miles: 12.4, roundTrip: true, fromLocation: "Home", toLocation: "151 Pinnacle" });
  check("mileage uses the IRS rate for the trip date", trip.status === 201 && trip.body.ratePerMile === 0.76);
  check("round trips double the miles", trip.body.totalMiles === 24.8 && trip.body.amount === 18.85);
  check("mileage gets a default description", trip.body.description === "Business trip");

  const custom = await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-22", miles: 10, ratePerMile: 0.5, description: "Supply run" });
  check("a custom mileage rate is respected", custom.body.amount === 5 && custom.body.totalMiles === 10);

  const supply = await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-23", amount: 42.199, category: "cleaning_supplies", vendor: "Walmart", paymentMethod: "card" });
  check("supply costs save, rounded to cents", supply.status === 201 && supply.body.amount === 42.2 && supply.body.vendor === "Walmart");

  check("zero or negative miles are refused", (await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-21", miles: 0 })).status === 400);
  check("negative amounts are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-21", amount: -5 })).status === 400);
  check("unknown categories are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-21", amount: 5, category: "vacation" })).status === 400);
  check("invalid dates are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-02-30", amount: 5 })).status === 400);
  check("links to missing properties are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-21", amount: 5, propertyId: 999999 })).status === 400);

  const edited = await call("PATCH", `/api/expenses/${supply.body.id}`, { kind: "supply", expenseDate: "2026-09-23", amount: 50, category: "laundry", vendor: "Walmart" });
  check("editing an expense updates it", edited.status === 200 && edited.body.amount === 50 && edited.body.category === "laundry");

  const up = await call("POST", `/api/expenses/${supply.body.id}/receipts?name=${encodeURIComponent("rcpt <b>1</b>.jpg")}`, jpeg, "image/jpeg");
  check("a receipt photo uploads", up.status === 201 && !/[<>]/.test(up.body.originalName));
  check("non-JPEG receipts are refused", (await call("POST", `/api/expenses/${supply.body.id}/receipts`, Buffer.from("<html>"), "image/jpeg")).status === 400);
  const list = (await call("GET", "/api/expenses")).body;
  check("the list shows receipt counts, newest first", list[0].id === supply.body.id && list[0].receiptCount === 1);
  const file = await fetch(`${base}/api/expense-receipts/${up.body.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
  check("the receipt file is served privately as JPEG", file.status === 200 && file.headers.get("content-type") === "image/jpeg");
  const anon = await fetch(`${base}/api/expense-receipts/${up.body.id}/file`);
  check("receipts are not visible without sign-in", anon.status === 401);

  check("deleting an expense removes it", (await call("DELETE", `/api/expenses/${supply.body.id}`)).status === 204);
  check("and removes its receipt photos", readdirSync(process.env.RECEIPT_DIR!).length === 0
    && (db.prepare("SELECT count(*) n FROM expense_receipts").get() as any).n === 0);

  // Deleting a linked job keeps the expense, just unlinks it.
  const job = db.prepare("SELECT id FROM jobs ORDER BY id LIMIT 1").get() as any;
  if (job) {
    const linked = await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-24", miles: 8, jobId: job.id });
    db.prepare("DELETE FROM job_photos WHERE job_id=?").run(job.id);
    await call("DELETE", `/api/jobs/${job.id}`);
    const after = db.prepare("SELECT job_id FROM expenses WHERE id=?").get(linked.body.id) as any;
    check("deleting a job keeps its expenses", !!after && after.job_id === null);
  }
  {
    const { isJpeg, IMAGE_HEADERS } = await import("../server/jpeg");
    const spoof = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<html><script>alert(1)</script></html>".padEnd(300, " ")), Buffer.from([0xff, 0xd9])]);
    check("a real JPEG passes the upload check", isJpeg(jpeg));
    check("files faking a JPEG start are refused", !isJpeg(spoof) && !isJpeg(jpeg.subarray(0, jpeg.length - 40)));
    check("stored photos are served locked down", IMAGE_HEADERS["Content-Security-Policy"].includes("sandbox") && IMAGE_HEADERS["X-Content-Type-Options"] === "nosniff");
    const e = (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-23", amount: 3 })).body;
    check("spoofed receipt uploads are refused", (await call("POST", `/api/expenses/${e.id}/receipts`, spoof, "image/jpeg")).status === 400);
  }
  check("database links stay consistent", (db.pragma("foreign_key_check") as any[]).length === 0);
  console.log(`${count} expense checks passed.`);
} finally {
  server.close();
  db.close();
}
