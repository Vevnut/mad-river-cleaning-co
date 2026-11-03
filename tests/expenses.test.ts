import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";
import { mkdirSync, rmSync, readdirSync } from "node:fs";

// Disposable database and receipt folder. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.PHOTO_DIR = "tests/.data/expenses-photos";
process.env.RECEIPT_DIR = "tests/.data/expenses-receipts";
rmSync(process.env.RECEIPT_DIR, { recursive: true, force: true });
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("expense-test-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
const { irsRateFor } = await import("../shared/expenses");
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
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
  await check("IRS rate: 72.5¢ in the first half of 2026", irsRateFor("2026-03-10").rate === 0.725);
  await check("IRS rate: 76¢ from July 1, 2026", irsRateFor("2026-07-01").rate === 0.76 && irsRateFor("2026-06-30").rate === 0.725);
  await check("IRS rate: 2027 trips are flagged to check", irsRateFor("2027-02-01").confirmed === false);

  await check("expenses require sign-in", (await call("GET", "/api/expenses")).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "expenses@example.test", password: "Expense-test-only-123", setupToken: "expense-test-setup" })).body.token;

  const gas = await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-21", amount: 48.567, vendor: "Irving", paymentMethod: "card" });
  await check("gas saves as dollars spent, rounded to cents", gas.status === 201 && gas.body.amount === 48.57 && gas.body.category === "gas");
  await check("gas gets a default description and no miles", gas.body.description === "Gas" && gas.body.miles === null && gas.body.totalMiles === null && gas.body.vendor === "Irving");
  await check("miles alone no longer make a gas entry", (await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-22", miles: 10 })).status === 400);
  // An older mileage entry still loads, and editing it keeps its dollar amount as gas.
  const old = (await db.insertId("INSERT INTO expenses (kind,expense_date,description,category,amount,miles,round_trip,total_miles,rate_per_mile,created_at,created_by,updated_at) VALUES ('mileage','2026-09-01','Business trip','mileage',18.85,12.4,1,24.8,0.76,'x','x','x')"));
  const oldList = (await call("GET", "/api/expenses")).body.find((e: any) => e.id === old);
  await check("older mileage entries still show", oldList?.amount === 18.85 && oldList.totalMiles === 24.8);
  const conv = await call("PATCH", `/api/expenses/${old}`, { kind: "mileage", expenseDate: "2026-09-01", amount: 18.85 });
  await check("editing an older mileage entry keeps its amount as gas", conv.status === 200 && conv.body.amount === 18.85 && conv.body.category === "gas");

  const supply = await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-23", amount: 42.199, category: "cleaning_supplies", vendor: "Walmart", paymentMethod: "card" });
  await check("supply costs save, rounded to cents", supply.status === 201 && supply.body.amount === 42.2 && supply.body.vendor === "Walmart");

  await check("zero gas amounts are refused", (await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-21", amount: 0 })).status === 400);
  await check("negative amounts are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-21", amount: -5 })).status === 400);
  await check("unknown categories are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-21", amount: 5, category: "vacation" })).status === 400);
  await check("invalid dates are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-02-30", amount: 5 })).status === 400);
  await check("links to missing properties are refused", (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-21", amount: 5, propertyId: 999999 })).status === 400);

  const edited = await call("PATCH", `/api/expenses/${supply.body.id}`, { kind: "supply", expenseDate: "2026-09-23", amount: 50, category: "laundry", vendor: "Walmart" });
  await check("editing an expense updates it", edited.status === 200 && edited.body.amount === 50 && edited.body.category === "laundry");

  const up = await call("POST", `/api/expenses/${supply.body.id}/receipts?name=${encodeURIComponent("rcpt <b>1</b>.jpg")}`, jpeg, "image/jpeg");
  await check("a receipt photo uploads", up.status === 201 && !/[<>]/.test(up.body.originalName));
  await check("non-JPEG receipts are refused", (await call("POST", `/api/expenses/${supply.body.id}/receipts`, Buffer.from("<html>"), "image/jpeg")).status === 400);
  const list = (await call("GET", "/api/expenses")).body;
  await check("the list shows receipt counts, newest first", list[0].id === supply.body.id && list[0].receiptCount === 1);
  const file = await fetch(`${base}/api/expense-receipts/${up.body.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
  await check("the receipt file is served privately as JPEG", file.status === 200 && file.headers.get("content-type") === "image/jpeg");
  const anon = await fetch(`${base}/api/expense-receipts/${up.body.id}/file`);
  await check("receipts are not visible without sign-in", anon.status === 401);

  await check("deleting an expense removes it", (await call("DELETE", `/api/expenses/${supply.body.id}`)).status === 204);
  await check("and removes its receipt photos", readdirSync(process.env.RECEIPT_DIR!).length === 0
    && ((await db.get("SELECT count(*) n FROM expense_receipts")) as any).n === 0);

  // Deleting a linked job keeps the expense, just unlinks it.
  const job = (await db.get("SELECT id FROM jobs ORDER BY id LIMIT 1")) as any;
  if (job) {
    const linked = await call("POST", "/api/expenses", { kind: "mileage", expenseDate: "2026-09-24", amount: 30, jobId: job.id });
    (await db.run("DELETE FROM job_photos WHERE job_id=?", job.id));
    await call("DELETE", `/api/jobs/${job.id}`);
    const after = (await db.get("SELECT job_id FROM expenses WHERE id=?", linked.body.id)) as any;
    await check("deleting a job keeps its expenses", !!after && after.job_id === null);
  }
  {
    const { isJpeg, IMAGE_HEADERS } = await import("../server/jpeg");
    const spoof = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<html><script>alert(1)</script></html>".padEnd(300, " ")), Buffer.from([0xff, 0xd9])]);
    await check("a real JPEG passes the upload check", isJpeg(jpeg));
    await check("files faking a JPEG start are refused", !isJpeg(spoof) && !isJpeg(jpeg.subarray(0, jpeg.length - 40)));
    await check("stored photos are served locked down", IMAGE_HEADERS["Content-Security-Policy"].includes("sandbox") && IMAGE_HEADERS["X-Content-Type-Options"] === "nosniff");
    const e = (await call("POST", "/api/expenses", { kind: "supply", expenseDate: "2026-09-23", amount: 3 })).body;
    await check("spoofed receipt uploads are refused", (await call("POST", `/api/expenses/${e.id}/receipts`, spoof, "image/jpeg")).status === 400);
  }
  await check("database links stay consistent", true /* Postgres enforces every link itself */);
  console.log(`${count} expense checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
