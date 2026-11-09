import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";
import { errorHandler } from "../server/errors";

// Disposable database: what cleaners can do from a job beyond the checklist and photos —
// deep cleaning, the hot tub, supplies at the house, messages to the office, start times, history.
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("cleaner-extras-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use(errorHandler);
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let count = 0;
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
async function call(token: string, method: string, path: string, body?: any) {
  const r = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const auth = async (action: string, body: any) => (await fetch(`${base}/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
const day = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const now = new Date().toISOString();

try {
  const owner = (await auth("setup", { email: "owner@example.test", password: "Owner-test-only-123", setupToken: "cleaner-extras-setup" })).token;
  const [p, other] = await db.all("SELECT id, customer_id FROM properties ORDER BY id LIMIT 2");
  const ann = await db.insertId("INSERT INTO staff (name, role, email, phone, color_tag, active) VALUES (?,?,?,?,?,1)", "Ann Cleaner", "cleaner", "ann@example.test", "555-0101", "#123456");
  const cat = await db.insertId("INSERT INTO staff (name, role, email, phone, color_tag, active) VALUES (?,?,?,?,?,1)", "Cat Cleaner", "cleaner", "cat@example.test", "555-0102", "#654321");
  const ben = await db.insertId("INSERT INTO subcontractors (name, pay_type, active, created_at, updated_at) VALUES (?,?,1,?,?)", "Ben Sub", "per_job", now, now);
  const job = (prop: any, staffId: number | null, date: string, status = "scheduled", type = "turnover") => db.insertId(`INSERT INTO jobs (property_id, customer_id, job_type, scheduled_date, scheduled_time,
    duration_minutes, assigned_staff_id, status, price, rate_type) VALUES (?,?,?,?,?,?,?,?,?,?)`, prop.id, prop.customer_id, type, date, "10:00", 120, staffId, status, 300, "custom");
  const annJob = await job(p, ann, day(0)), annPast = await job(p, ann, day(-3)), annAhead = await job(p, ann, day(5));
  const annInvoiced = await job(p, ann, day(-1), "invoiced"), annOld = await job(p, ann, day(-40), "completed"), annOldOpen = await job(p, ann, day(-41), "scheduled");
  const catJob = await job(other, cat, day(0));
  const benOld = await job(p, null, day(-60), "completed");
  await db.run("INSERT INTO job_subcontractors (job_id, subcontractor_id, pay, assigned_at, assigned_by) VALUES (?,?,?,?,?)", benOld, ben, 90, now, "owner@example.test");
  await db.run("INSERT INTO subcontractor_payments (subcontractor_id, paid_date, amount, method, created_at, created_by) VALUES (?,?,?,?,?,?)", ben, day(-30), 90, "check", now, "owner@example.test");
  const make = async (email: string, staffId: number | null, subcontractorId: number | null) => {
    await call(owner, "POST", "/api/team/cleaners", { email, password: "Cleaner-test-only-123", ...(staffId ? { staffId } : { subcontractorId }) });
    return (await auth("login", { email, password: "Cleaner-test-only-123" })).token as string;
  };
  const a = await make("ann@example.test", ann, null), c = await make("cat@example.test", cat, null), b = await make("ben@example.test", null, ben);

  // ---- deep cleaning from the job ----
  let j = (await call(a, "GET", `/api/cleaner/jobs/${annJob}`)).body;
  check("the job shows the house's deep-cleaning status", !!j.upkeep && j.upkeep.hasHotTub === false && Object.keys(j.upkeep.thisJob).length === 0);
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/upkeep`, { task: "vents", done: true })).body;
  check("ticking a task logs it for this job and the house", j.upkeep.thisJob.vents?.mine === true && j.upkeep.lastDone.vents === day(0));
  await call(a, "POST", `/api/cleaner/jobs/${annJob}/upkeep`, { task: "vents", done: true });
  check("ticking twice logs it once", Number((await db.get("SELECT count(*) n FROM upkeep_log WHERE job_id=? AND task='vents'", annJob))!.n) === 1);
  const office = (await call(owner, "GET", `/api/properties/${p.id}/upkeep`)).body;
  check("the office sees it with who did it", office.lastDone.vents === day(0) && office.history.some((h: any) => h.task === "vents" && h.createdBy === "ann@example.test"));
  j = (await call(a, "POST", `/api/cleaner/jobs/${annPast}/upkeep`, { task: "mop", done: true })).body;
  check("work on an earlier job counts on that job's date", j.upkeep.lastDone.mop === day(-3));
  j = (await call(a, "POST", `/api/cleaner/jobs/${annAhead}/upkeep`, { task: "closets", done: true })).body;
  check("ticking ahead of a future job counts as today, never a future date", j.upkeep.lastDone.closets === day(0));
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/upkeep`, { task: "vents", done: false })).body;
  check("unticking removes it", !j.upkeep.thisJob.vents && !j.upkeep.lastDone.vents);
  await db.run("INSERT INTO upkeep_log (property_id,job_id,task,done_on,note,created_at,created_by) VALUES (?,?,?,?,?,?,?)", p.id, annJob, "scuffs", day(0), "", now, "owner@example.test");
  check("a cleaner can't untick what the office logged", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/upkeep`, { task: "scuffs", done: false })).status === 403);
  check("an unknown task is refused", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/upkeep`, { task: "windows", done: true })).status === 400);
  check("an invoiced job is locked", (await call(a, "POST", `/api/cleaner/jobs/${annInvoiced}/upkeep`, { task: "mop", done: true })).status === 409);
  check("another cleaner's job is off limits", (await call(a, "POST", `/api/cleaner/jobs/${catJob}/upkeep`, { task: "mop", done: true })).status === 404);
  check("the hot tub can't be logged where there isn't one", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/upkeep`, { task: "hot_tub_drain", done: true })).status === 400);
  await call(owner, "PUT", `/api/properties/${p.id}/hot-tub`, { hasHotTub: true });
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/upkeep`, { task: "hot_tub_drain", done: true })).body;
  check("with a hot tub, the drain is logged from the job", j.upkeep.hasHotTub === true && j.upkeep.lastDone.hot_tub_drain === day(0));
  check("cleaners can't reach the office's deep-cleaning pages", (await call(a, "GET", "/api/upkeep")).status === 403 && (await call(a, "POST", `/api/properties/${p.id}/upkeep`, { tasks: ["mop"], doneOn: day(0) })).status === 403);

  // ---- supplies at the house ----
  const soap = (await call(owner, "POST", "/api/supplies", { name: "Hand soap", propertyId: p.id, quantity: 3, reorderAt: 1, notes: "Under the sink" })).body;
  const stock = (await call(owner, "POST", "/api/supplies", { name: "Office bags", quantity: 50 })).body;
  const elsewhere = (await call(owner, "POST", "/api/supplies", { name: "Other house soap", propertyId: other.id, quantity: 2 })).body;
  j = (await call(a, "GET", `/api/cleaner/jobs/${annJob}`)).body;
  check("the job lists only supplies kept at this house", j.supplies.length === 1 && j.supplies[0].name === "Hand soap" && j.supplies[0].notes === "Under the sink");
  check("supplies don't say who in the office changed them", j.supplies[0].updatedBy === undefined && j.supplies[0].flaggedBy === undefined);
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/supplies/${soap.id}/adjust`, { delta: -1 })).body;
  check("a cleaner can count one down", j.supplies[0].quantity === 2);
  check("counts change by whole steps only", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/supplies/${soap.id}/adjust`, { delta: 0.5 })).status === 400);
  check("office stock can't be changed from a job", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/supplies/${stock.id}/adjust`, { delta: -1 })).status === 404);
  check("another house's supplies can't be changed", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/supplies/${elsewhere.id}/adjust`, { delta: -1 })).status === 404);
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/supplies/${soap.id}/flag`, { low: true })).body;
  check("a cleaner can flag something as running low", j.supplies[0].low === true && !!j.supplies[0].flaggedAt && j.supplies[0].flaggedByMe === true);
  let list = (await call(owner, "GET", "/api/supplies")).body;
  check("the office sees the flag and who raised it", list.find((s: any) => s.id === soap.id).low === true && list.find((s: any) => s.id === soap.id).flaggedBy === "ann@example.test");
  await call(owner, "POST", `/api/supplies/${soap.id}/adjust`, { delta: 6 });
  list = (await call(owner, "GET", "/api/supplies")).body;
  check("restocking clears the flag", list.find((s: any) => s.id === soap.id).flaggedAt === null && list.find((s: any) => s.id === soap.id).low === false);
  await call(a, "POST", `/api/cleaner/jobs/${annJob}/supplies/${soap.id}/flag`, { low: true });
  await call(owner, "PATCH", `/api/supplies/${soap.id}`, { name: "Hand soap", propertyId: p.id, quantity: 8, reorderAt: 1 });
  check("an office edit clears the flag too", (await call(owner, "GET", "/api/supplies")).body.find((s: any) => s.id === soap.id).flaggedAt === null);
  check("cleaners can't open the office Supplies page", (await call(a, "GET", "/api/supplies")).status === 403);

  // ---- messages to the office ----
  check("an empty message is refused", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/issues`, { body: "  " })).status === 400);
  const sent = await call(a, "POST", `/api/cleaner/jobs/${annJob}/issues`, { body: "Dishwasher is leaking" });
  check("a message is sent", sent.status === 201 && sent.body.issues.length === 1 && sent.body.issues[0].mine === true && sent.body.issues[0].resolved === false);
  check("messages can be sent on an invoiced job too", (await call(a, "POST", `/api/cleaner/jobs/${annInvoiced}/issues`, { body: "Found a lost earring" })).status === 201);
  check("not on someone else's job", (await call(a, "POST", `/api/cleaner/jobs/${catJob}/issues`, { body: "x" })).status === 404);
  const inbox = (await call(owner, "GET", "/api/job-issues")).body;
  check("the office inbox lists open messages with the house and sender", inbox.length === 2 && inbox.some((i: any) => i.body === "Dishwasher is leaking" && i.createdByName === "Ann Cleaner" && i.propertyName));
  const activity = (await call(owner, "GET", `/api/jobs/${annJob}/cleaner-activity`)).body;
  check("the office job shows its messages and deep cleaning", activity.issues.length === 1 && activity.upkeep.some((u: any) => u.task === "hot_tub_drain"));
  const msgId = inbox.find((i: any) => i.body === "Dishwasher is leaking").id;
  check("the office marks it handled", (await call(owner, "PATCH", `/api/job-issues/${msgId}`, { resolved: true })).body.resolvedBy === "owner@example.test");
  check("handled messages leave the inbox", (await call(owner, "GET", "/api/job-issues")).body.length === 1);
  check("the cleaner sees it was handled", (await call(a, "GET", `/api/cleaner/jobs/${annJob}`)).body.issues[0].resolved === true);
  check("cleaners can't read the office inbox", (await call(a, "GET", "/api/job-issues")).status === 403);

  // ---- start time ----
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/start`)).body;
  check("starting marks the job in progress with a start time", j.status === "in_progress" && !!j.startedAt);
  const first = j.startedAt;
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/start`)).body;
  check("starting again keeps the first start time", j.startedAt === first);
  j = (await call(a, "POST", `/api/cleaner/jobs/${annJob}/complete`)).body;
  check("finishing keeps both times", j.status === "completed" && j.startedAt === first && !!j.completedAt);
  check("a finished job can't be started again", (await call(a, "POST", `/api/cleaner/jobs/${annJob}/start`)).status === 409);
  check("the office sees the start time", (await call(owner, "GET", `/api/jobs/${annJob}/cleaner-activity`)).body.startedAt === first);

  // ---- history ----
  const ah = (await call(a, "GET", "/api/cleaner/history")).body;
  check("history lists finished jobs older than two weeks", ah.jobs.length === 1 && ah.jobs[0].id === annOld);
  check("history leaves out unfinished jobs and other people's", !ah.jobs.some((x: any) => x.id === annOldOpen || x.id === benOld));
  check("staff get no payments list", ah.payments.length === 0);
  const bh = (await call(b, "GET", "/api/cleaner/history")).body;
  check("a subcontractor sees their old job with pay", bh.jobs.length === 1 && bh.jobs[0].pay === 90);
  check("and the payments they received", bh.payments.length === 1 && bh.payments[0].amount === 90 && bh.payments[0].method === "check");
  check("cat sees none of ann's history", (await call(c, "GET", "/api/cleaner/history")).body.jobs.length === 0);
  console.log(`${count} cleaner-extras checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
