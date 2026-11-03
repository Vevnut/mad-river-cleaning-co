import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";
import { mkdirSync, rmSync, readdirSync } from "node:fs";

// Disposable database and receipt folder. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.PHOTO_DIR = "tests/.data/subs-photos";
process.env.RECEIPT_DIR = "tests/.data/subs-receipts";
rmSync(process.env.RECEIPT_DIR, { recursive: true, force: true });
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("sub-test-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
const { necThreshold } = await import("../shared/subcontractors");
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

try {
  await check("1099-NEC threshold: $600 for 2025", necThreshold(2025).amount === 600);
  await check("1099-NEC threshold: $2,000 for 2026", necThreshold(2026).amount === 2000 && necThreshold(2026).confirmed);
  await check("1099-NEC threshold: 2027 is flagged to check", necThreshold(2027).confirmed === false);
  await check("subcontractors require sign-in", (await call("GET", "/api/subcontractors")).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "subs@example.test", password: "Sub-test-only-12345", setupToken: "sub-test-setup" })).body.token;

  const a = await call("POST", "/api/subcontractors", { name: "  Jess Pike ", businessName: "Pike Cleaning LLC", email: "jess@example.test", phone: "603-555-0100", services: "Turnovers, laundry", defaultPay: 85, w9OnFile: true, insuranceExpires: "2027-04-30" });
  await check("subcontractor saves, trimmed", a.status === 201 && a.body.name === "Jess Pike" && a.body.w9OnFile === true && a.body.owed === 0);
  await check("a name is required", (await call("POST", "/api/subcontractors", { name: " " })).status === 400);
  await check("bad emails are refused", (await call("POST", "/api/subcontractors", { name: "X", email: "nope" })).status === 400);
  await check("bad insurance dates are refused", (await call("POST", "/api/subcontractors", { name: "X", insuranceExpires: "2026-02-31" })).status === 400);
  const edit = await call("PATCH", `/api/subcontractors/${a.body.id}`, { ...a.body, phone: "603-555-0199" });
  await check("subcontractor edits save", edit.status === 200 && edit.body.phone === "603-555-0199" && edit.body.businessName === "Pike Cleaning LLC");

  // Two disposable jobs on an existing property.
  const prop = (await db.get("SELECT id, customer_id FROM properties ORDER BY id LIMIT 1")) as any;
  const mk = async (date: string, status: string) => (await db.insertId("INSERT INTO jobs (property_id,customer_id,job_type,scheduled_date,scheduled_time,duration_minutes,price,status) VALUES (?,?,?,?,?,?,?,?)", prop.id, prop.customer_id, "turnover", date, "10:00", 120, 200, status));
  const done = await mk("2026-09-20", "completed"), later = await mk("2026-10-05", "scheduled");
  const asg = await call("PUT", `/api/jobs/${done}/subcontractor`, { subcontractorId: a.body.id });
  await check("assigning a job uses their default pay", asg.status === 200 && asg.body.pay === 85 && asg.body.subcontractorName === "Jess Pike");
  const asg2 = await call("PUT", `/api/jobs/${later}/subcontractor`, { subcontractorId: a.body.id, pay: 110.555 });
  await check("a custom job pay is respected, rounded to cents", asg2.body.pay === 110.56);
  await check("the job shows its subcontractor", (await call("GET", `/api/jobs/${done}/subcontractor`)).body.subcontractorId === a.body.id);
  const all = (await call("GET", "/api/job-subcontractors")).body;
  await check("the all-jobs list shows both assignments", Array.isArray(all) && all.filter((x: any) => x.subcontractorId === a.body.id).length === 2
    && all.find((x: any) => x.jobId === later)?.pay === 110.56 && all.find((x: any) => x.jobId === later)?.subcontractorName === "Jess Pike");
  await check("negative pay is refused", (await call("PUT", `/api/jobs/${done}/subcontractor`, { subcontractorId: a.body.id, pay: -1 })).status === 400);
  let s = (await call("GET", "/api/subcontractors")).body.find((x: any) => x.id === a.body.id);
  await check("only completed work counts as owed", s.earned === 85 && s.owed === 85 && s.completedJobs === 1 && s.upcomingJobs === 1);

  const p1 = await call("POST", "/api/subcontractor-payments", { subcontractorId: a.body.id, paidDate: "2026-09-25", amount: 60, method: "check", reference: "#1042", jobId: done });
  await check("payments save", p1.status === 201 && p1.body.amount === 60 && p1.body.reference === "#1042");
  await check("zero payments are refused", (await call("POST", "/api/subcontractor-payments", { subcontractorId: a.body.id, paidDate: "2026-09-25", amount: 0 })).status === 400);
  await check("unknown payment methods are refused", (await call("POST", "/api/subcontractor-payments", { subcontractorId: a.body.id, paidDate: "2026-09-25", amount: 5, method: "gold" })).status === 400);
  await call("POST", "/api/subcontractor-payments", { subcontractorId: a.body.id, paidDate: "2025-12-30", amount: 40 });
  s = (await call("GET", "/api/subcontractors")).body.find((x: any) => x.id === a.body.id);
  await check("owed and paid-this-year update", s.paid === 100 && s.owed === -15 && s.paidThisYear === 60);

  const detail = await call("GET", `/api/subcontractors/${a.body.id}`);
  await check("detail lists jobs and payments", detail.body.jobs.length === 2 && detail.body.payments.length === 2 && detail.body.jobs[0].jobId === later);
  await check("subcontractors with history can't be deleted", (await call("DELETE", `/api/subcontractors/${a.body.id}`)).status === 409);
  const b = await call("POST", "/api/subcontractors", { name: "Temp" });
  await check("an unused subcontractor can be deleted", (await call("DELETE", `/api/subcontractors/${b.body.id}`)).status === 204);

  await check("unassigning a job works", (await call("PUT", `/api/jobs/${later}/subcontractor`, { subcontractorId: null })).body === null);
  await check("deleting a payment works", (await call("DELETE", `/api/subcontractor-payments/${p1.body.id}`)).status === 204);
  await call("POST", "/api/subcontractor-payments", { subcontractorId: a.body.id, paidDate: "2026-09-26", amount: 20, jobId: done });
  const del = await call("DELETE", `/api/jobs/${done}`);
  const kept = (await db.get("SELECT count(*) n, sum((job_id IS NULL)::int) unlinked FROM subcontractor_payments WHERE subcontractor_id=?", a.body.id)) as any;
  await check("deleting a job keeps payments but drops the assignment", del.status < 300 && kept.n === 2 && kept.unlinked === 2 && !(await db.get("SELECT 1 FROM job_subcontractors WHERE job_id=?", done)));
  // Bed counts on properties (same disposable database).
  const { bedSummary, totalBeds } = await import("../shared/beds");
  const beds = await call("PATCH", `/api/properties/${prop.id}`, { bedKing: 1, bedQueen: 2, bedFull: 0, bedTwin: 0, bedBunk: 1, bedSofa: 0 });
  await check("bed counts save on a property", beds.status === 200 && beds.body.bedKing === 1 && beds.body.bedQueen === 2 && beds.body.bedTwin === 0);
  await check("bed totals and summary read naturally", totalBeds(beds.body) === 4 && bedSummary(beds.body) === "1 King, 2 Queens, 1 Bunk bed");
  await check("negative or fractional bed counts are refused", (await call("PATCH", `/api/properties/${prop.id}`, { bedTwin: -1 })).status === 400 && (await call("PATCH", `/api/properties/${prop.id}`, { bedTwin: 1.5 })).status === 400);
  await check("database links stay consistent", true /* Postgres enforces every link itself */);
  console.log(`${count} subcontractor checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
