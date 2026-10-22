import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import express from "express";
import Database from "better-sqlite3";
import { errorHandler } from "../server/errors";

// Disposable copy of the database. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.DATABASE_PATH = "tests/.data/cleaner.db";
process.env.PHOTO_DIR = "tests/.data/cleaner-photos";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("cleaner-test-setup").digest("hex");
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
app.use(errorHandler);
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let count = 0;
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
async function call(token: string, method: string, path: string, body?: any) {
  const r = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, body: json, text };
}
const upload = (token: string, path: string) => fetch(base + path, { method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" }, body: readFileSync("tests/fixtures/tiny.jpg") });
const auth = async (action: string, body: any) =>
  (await fetch(`${base}/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
const login = (email: string, password: string) => auth("login", { email, password });

const day = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const now = new Date().toISOString();
const insert = (sql: string, ...a: any[]) => Number(db.prepare(sql).run(...a).lastInsertRowid);

try {
  const ownerLogin = await auth("setup", { email: "owner@example.test", password: "Owner-test-only-123", setupToken: "cleaner-test-setup" });
  const owner = ownerLogin.token;
  check("the first account is an owner", !!owner && ownerLogin.role === "owner");

  // People, a property with details the cleaner must or mustn't see, and jobs for each person.
  const p = db.prepare("SELECT id, customer_id FROM properties ORDER BY id LIMIT 1").get() as any;
  db.prepare("UPDATE properties SET entry_instructions=?, access_notes=?, supply_notes=? WHERE id=?").run("Lockbox 4321 on the back door", "Park in the gravel lot", "Extra towels in the hall closet", p.id);
  db.prepare("UPDATE customers SET email=?, phone=? WHERE id=?").run("owner-secret@example.test", "555-0199", p.customer_id);
  const ann = insert("INSERT INTO staff (name, role, email, phone, color_tag, active) VALUES (?,?,?,?,?,1)", "Ann Cleaner", "cleaner", "ann@example.test", "555-0101", "#123456");
  const ben = insert("INSERT INTO subcontractors (name, pay_type, active, created_at, updated_at) VALUES (?,?,1,?,?)", "Ben Sub", "per_job", now, now);
  const job = (staffId: number | null, date: string, status = "scheduled") => insert(`INSERT INTO jobs (property_id, customer_id, job_type, scheduled_date, scheduled_time,
    duration_minutes, assigned_staff_id, status, internal_notes, customer_notes, price, rate_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    p.id, p.customer_id, "turnover", date, "10:00", 120, staffId, status, "SECRET-INTERNAL-NOTE", "Please water the plants", 777.77, "custom");
  const annJob = job(ann, day(0)), annCanceled = job(ann, day(1), "canceled"), annFar = job(ann, day(90)), otherJob = job(null, day(0));
  const benJob = job(null, day(3));
  insert("INSERT INTO job_subcontractors (job_id, subcontractor_id, pay, assigned_at, assigned_by) VALUES (?,?,?,?,?)", benJob, ben, 85, now, "owner@example.test");
  const item1 = insert("INSERT INTO service_checklists (job_id, label, is_completed, sort_order) VALUES (?,?,0,1)", annJob, "Strip beds");
  insert("INSERT INTO service_checklists (job_id, label, is_completed, sort_order) VALUES (?,?,0,2)", annJob, "Restock coffee");
  const otherItem = insert("INSERT INTO service_checklists (job_id, label, is_completed, sort_order) VALUES (?,?,0,1)", otherJob, "Other job task");
  db.prepare("DELETE FROM stays WHERE property_id=?").run(p.id);
  insert("INSERT INTO stays (property_id, guest_name, guest_phone, guest_count, platform, check_in_date, check_out_date, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    p.id, "SECRET-GUEST-NAME", "555-0177", 4, "airbnb", day(-3), day(0), "confirmed", now);
  insert("INSERT INTO stays (property_id, guest_name, guest_phone, guest_count, platform, check_in_date, check_out_date, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    p.id, "SECRET-GUEST-TWO", "555-0178", 2, "vrbo", day(2), day(5), "confirmed", now);

  // ---- Owner creates the logins ----
  const annPw = "Ann-test-only-12345", benPw = "Ben-test-only-12345";
  check("a login needs exactly one person", (await call(owner, "POST", "/api/team/cleaners", { email: "x@example.test", password: annPw, staffId: ann, subcontractorId: ben })).status === 400);
  const annAcct = await call(owner, "POST", "/api/team/cleaners", { email: "Ann@Example.test", password: annPw, staffId: ann });
  check("owner creates a staff cleaner login", annAcct.status === 201 && annAcct.body.name === "Ann Cleaner" && annAcct.body.kind === "staff");
  check("owner creates a subcontractor cleaner login", (await call(owner, "POST", "/api/team/cleaners", { email: "ben@example.test", password: benPw, subcontractorId: ben })).status === 201);
  const twice = await call(owner, "POST", "/api/team/cleaners", { email: "ann2@example.test", password: annPw, staffId: ann });
  check("one login per person", twice.status === 409 && twice.body.message === "This person already has a cleaner login.");
  check("owner sees the logins", (await call(owner, "GET", "/api/team/cleaners")).body.length === 2);

  // ---- Staff cleaner ----
  const annLogin = await login("ann@example.test", annPw);
  const annT = annLogin.token;
  check("a cleaner signs in and is told they're a cleaner", !!annT && annLogin.role === "cleaner");
  for (const path of ["/api/customers", "/api/jobs", "/api/invoices", "/api/expenses", "/api/subcontractors", "/api/staff",
    "/api/settings", "/api/team/cleaners", `/api/jobs/${annJob}/photos`, "/api/stays", "/api/calendar/feed", "/api/properties"])
    check(`a cleaner can't open ${path}`, (await call(annT, "GET", path)).status === 403);
  check("a cleaner can't create accounts", (await call(annT, "POST", "/api/team", { email: "evil@example.test", password: "Evil-test-only-123" })).status === 403);
  check("a cleaner can't create cleaner logins", (await call(annT, "POST", "/api/team/cleaners", { email: "e@example.test", password: annPw, staffId: ann })).status === 403);

  const mine = (await call(annT, "GET", "/api/cleaner/jobs")).body;
  const ids = mine.jobs.map((j: any) => j.id);
  check("My jobs lists their job", ids.includes(annJob));
  check("My jobs leaves out other people's jobs", !ids.includes(otherJob) && !ids.includes(benJob));
  check("My jobs leaves out canceled jobs", !ids.includes(annCanceled));
  check("My jobs stops at about two months ahead", !ids.includes(annFar));
  const d = await call(annT, "GET", `/api/cleaner/jobs/${annJob}`);
  check("job detail shows how to get in", d.body.property.entryInstructions === "Lockbox 4321 on the back door" && d.body.property.accessNotes === "Park in the gravel lot");
  check("job detail shows supplies, beds and the customer's name", d.body.property.supplyNotes.includes("towels") && "king" in d.body.property.beds && !!d.body.customerName);
  check("job detail shows the job notes and checklist", d.body.notes === "Please water the plants" && d.body.checklistItems.length === 2);
  check("no price, internal notes or customer contact details", !d.text.includes("777.77") && !d.text.includes("SECRET-INTERNAL")
    && !d.text.includes("owner-secret@") && !d.text.includes("555-0199") && !("price" in d.body));
  check("staff don't see pay", d.body.pay === null);
  check("turnover timing is shown", d.body.stays.lastCheckOut?.checkOutDate === day(0) && d.body.stays.nextCheckIn?.checkInDate === day(2) && d.body.stays.nextCheckIn.guestCount === 2);
  check("guest names and phones stay private", !d.text.includes("SECRET-GUEST") && !d.text.includes("555-0177"));
  check("someone else's job is not found", (await call(annT, "GET", `/api/cleaner/jobs/${otherJob}`)).status === 404 && (await call(annT, "GET", `/api/cleaner/jobs/${benJob}`)).status === 404);

  const ticked = await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}/checklist/${item1}`, { isCompleted: true });
  check("a cleaner checks off a checklist item", ticked.status === 200 && ticked.body.checklist.done === 1);
  check("they can't tick another job's item through their own job", (await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}/checklist/${otherItem}`, { isCompleted: true })).status === 404);
  check("they can't tick another job's item directly", (await call(annT, "PATCH", `/api/cleaner/jobs/${otherJob}/checklist/${otherItem}`, { isCompleted: true })).status === 404);
  const noted = await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}`, { damageNotes: "Cracked lamp in bedroom 2" });
  check("a cleaner adds damage notes", noted.status === 200 && noted.body.damageNotes === "Cracked lamp in bedroom 2");

  const up = await upload(annT, `/api/cleaner/jobs/${annJob}/photos?section=damage&name=lamp.jpg`);
  const photo = await up.json();
  check("a cleaner uploads a damage photo", up.status === 201 && photo.mine === true && !("createdBy" in photo));
  check("they can view their photo", (await fetch(`${base}/api/cleaner/job-photos/${photo.id}/file`, { headers: { Authorization: `Bearer ${annT}` } })).status === 200);
  check("they can't upload to someone else's job", (await upload(annT, `/api/cleaner/jobs/${benJob}/photos?section=damage`)).status === 404);
  const officePhoto = await (await upload(owner, `/api/jobs/${annJob}/photos?section=final_walkthrough`)).json();
  const list = (await call(annT, "GET", `/api/cleaner/jobs/${annJob}/photos`)).body;
  check("they see the office's photos on their job", list.length === 2 && list.find((x: any) => x.id === officePhoto.id)?.mine === false);
  check("they can't delete the office's photos", (await call(annT, "DELETE", `/api/cleaner/job-photos/${officePhoto.id}`)).status === 403);
  const otherPhoto = await (await upload(owner, `/api/jobs/${otherJob}/photos?section=damage`)).json();
  check("they can't open photos from someone else's job", (await fetch(`${base}/api/cleaner/job-photos/${otherPhoto.id}/file`, { headers: { Authorization: `Bearer ${annT}` } })).status === 404);
  check("they can delete their own photo", (await call(annT, "DELETE", `/api/cleaner/job-photos/${photo.id}`)).status === 204);

  const done = await call(annT, "POST", `/api/cleaner/jobs/${annJob}/complete`);
  check("a cleaner marks their job complete", done.status === 200 && done.body.status === "completed" && !!done.body.completedAt);
  check("completing doesn't invoice", !db.prepare("SELECT 1 FROM invoices WHERE job_id=?").get(annJob));
  db.prepare("UPDATE jobs SET status='invoiced' WHERE id=?").run(annJob);
  check("an invoiced job is locked", (await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}`, { damageNotes: "late edit" })).status === 409
    && (await call(annT, "POST", `/api/cleaner/jobs/${annJob}/complete`)).status === 409);
  check("but still readable", (await call(annT, "GET", `/api/cleaner/jobs/${annJob}`)).body.canEdit === false);

  // ---- Subcontractor cleaner ----
  const benT = (await login("ben@example.test", benPw)).token;
  const benJobs = (await call(benT, "GET", "/api/cleaner/jobs")).body.jobs;
  check("a subcontractor sees their job and its pay", benJobs.length === 1 && benJobs[0].id === benJob && benJobs[0].pay === 85);
  const before = (await call(benT, "GET", "/api/cleaner/me")).body;
  check("a subcontractor sees their pay totals", before.kind === "subcontractor" && before.pay.owed === 0 && before.pay.upcomingJobs === 1);
  await call(benT, "POST", `/api/cleaner/jobs/${benJob}/complete`);
  check("completing a job adds it to what they're owed", (await call(benT, "GET", "/api/cleaner/me")).body.pay.owed === 85);
  check("a subcontractor can't see the staff cleaner's job", (await call(benT, "GET", `/api/cleaner/jobs/${annJob}`)).status === 404);

  // ---- Owner stays in charge ----
  check("owners still have the full app", (await call(owner, "GET", "/api/customers")).status === 200);
  check("My jobs is only for cleaner logins", (await call(owner, "GET", "/api/cleaner/jobs")).status === 403);
  const newPw = "Ann-new-only-123456";
  await call(owner, "PATCH", `/api/team/cleaners/${annAcct.body.id}`, { password: newPw });
  check("a password reset signs the cleaner out", (await call(annT, "GET", "/api/cleaner/jobs")).status === 401);
  const annT2 = (await login("ann@example.test", newPw)).token;
  check("they sign in with the new password", (await call(annT2, "GET", "/api/cleaner/jobs")).status === 200);
  const off = await call(owner, "PATCH", `/api/team/cleaners/${annAcct.body.id}`, { active: false });
  check("turning a login off signs them out", off.body.active === false && (await call(annT2, "GET", "/api/cleaner/jobs")).status === 401);
  check("and stops them signing in", !(await login("ann@example.test", newPw)).token);
  db.prepare("UPDATE subcontractors SET active=0 WHERE id=?").run(ben);
  const benOff = await call(benT, "GET", "/api/cleaner/jobs");
  check("making the subcontractor inactive blocks their login", benOff.status === 403 && benOff.body.message.includes("turned off"));

  check("database links stay consistent", (db.pragma("foreign_key_check") as any[]).length === 0);
  console.log(`${count} cleaner checks passed.`);
} finally {
  server.close();
  db.close();
}
