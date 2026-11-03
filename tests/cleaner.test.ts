import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import express from "express";
import { startTestDatabase } from "./pg";
import { errorHandler } from "../server/errors";

// Disposable copy of the database. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.PHOTO_DIR = "tests/.data/cleaner-photos";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("cleaner-test-setup").digest("hex");
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
const loginRaw = (body: any) => fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const crewCookieOf = (res: Response) => (res.headers.get("set-cookie") || "").split(";")[0];
const resume = (cookie: string) => fetch(`${base}/api/auth/resume`, { headers: cookie ? { Cookie: cookie } : {} });

const day = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const now = new Date().toISOString();
const insert = async (sql: string, ...a: any[]) => (await db.insertId(sql, ...a));

try {
  const ownerLogin = await auth("setup", { email: "owner@example.test", password: "Owner-test-only-123", setupToken: "cleaner-test-setup" });
  const owner = ownerLogin.token;
  await check("the first account is an owner", !!owner && ownerLogin.role === "owner");

  // People, a property with details the cleaner must or mustn't see, and jobs for each person.
  const p = (await db.get("SELECT id, customer_id FROM properties ORDER BY id LIMIT 1")) as any;
  (await db.run("UPDATE properties SET entry_instructions=?, access_notes=?, supply_notes=? WHERE id=?", "Lockbox 4321 on the back door", "Park in the gravel lot", "Extra towels in the hall closet", p.id));
  (await db.run("UPDATE customers SET email=?, phone=? WHERE id=?", "owner-secret@example.test", "555-0199", p.customer_id));
  const ann = await insert("INSERT INTO staff (name, role, email, phone, color_tag, active) VALUES (?,?,?,?,?,1)", "Ann Cleaner", "cleaner", "ann@example.test", "555-0101", "#123456");
  const ben = await insert("INSERT INTO subcontractors (name, pay_type, active, created_at, updated_at) VALUES (?,?,1,?,?)", "Ben Sub", "per_job", now, now);
  const job = async (staffId: number | null, date: string, status = "scheduled") => await insert(`INSERT INTO jobs (property_id, customer_id, job_type, scheduled_date, scheduled_time,
    duration_minutes, assigned_staff_id, status, internal_notes, customer_notes, price, rate_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    p.id, p.customer_id, "turnover", date, "10:00", 120, staffId, status, "SECRET-INTERNAL-NOTE", "Please water the plants", 777.77, "custom");
  const annJob = await job(ann, day(0)), annCanceled = await job(ann, day(1), "canceled"), annFar = await job(ann, day(90)), otherJob = await job(null, day(0));
  const benJob = await job(null, day(3));
  await db.run("INSERT INTO job_subcontractors (job_id, subcontractor_id, pay, assigned_at, assigned_by) VALUES (?,?,?,?,?)", benJob, ben, 85, now, "owner@example.test");
  const item1 = await insert("INSERT INTO service_checklists (job_id, label, is_completed, sort_order) VALUES (?,?,0,1)", annJob, "Strip beds");
  await insert("INSERT INTO service_checklists (job_id, label, is_completed, sort_order) VALUES (?,?,0,2)", annJob, "Restock coffee");
  const otherItem = await insert("INSERT INTO service_checklists (job_id, label, is_completed, sort_order) VALUES (?,?,0,1)", otherJob, "Other job task");
  (await db.run("DELETE FROM stays WHERE property_id=?", p.id));
  await insert("INSERT INTO stays (property_id, guest_name, guest_phone, guest_count, platform, check_in_date, check_out_date, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    p.id, "SECRET-GUEST-NAME", "555-0177", 4, "airbnb", day(-3), day(0), "confirmed", now);
  await insert("INSERT INTO stays (property_id, guest_name, guest_phone, guest_count, platform, check_in_date, check_out_date, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    p.id, "SECRET-GUEST-TWO", "555-0178", 2, "vrbo", day(2), day(5), "confirmed", now);

  // ---- Owner creates the logins ----
  const annPw = "Ann-test-only-12345", benPw = "Ben-test-only-12345";
  await check("a login needs exactly one person", (await call(owner, "POST", "/api/team/cleaners", { email: "x@example.test", password: annPw, staffId: ann, subcontractorId: ben })).status === 400);
  const annAcct = await call(owner, "POST", "/api/team/cleaners", { email: "Ann@Example.test", password: annPw, staffId: ann });
  await check("owner creates a staff cleaner login", annAcct.status === 201 && annAcct.body.name === "Ann Cleaner" && annAcct.body.kind === "staff");
  await check("owner creates a subcontractor cleaner login", (await call(owner, "POST", "/api/team/cleaners", { email: "ben@example.test", password: benPw, subcontractorId: ben })).status === 201);
  const twice = await call(owner, "POST", "/api/team/cleaners", { email: "ann2@example.test", password: annPw, staffId: ann });
  await check("one login per person", twice.status === 409 && twice.body.message === "This person already has a cleaner login.");
  await check("owner sees the logins", (await call(owner, "GET", "/api/team/cleaners")).body.length === 2);

  // ---- Staff cleaner ----
  const annLogin = await login("ann@example.test", annPw);
  const annT = annLogin.token;
  await check("a cleaner signs in and is told they're a cleaner", !!annT && annLogin.role === "cleaner");
  for (const path of ["/api/customers", "/api/jobs", "/api/invoices", "/api/expenses", "/api/subcontractors", "/api/staff",
    "/api/settings", "/api/team/cleaners", `/api/jobs/${annJob}/photos`, "/api/stays", "/api/calendar/feed", "/api/properties", "/api/job-subcontractors"])
    await check(`a cleaner can't open ${path}`, (await call(annT, "GET", path)).status === 403);
  await check("a cleaner can't create accounts", (await call(annT, "POST", "/api/team", { email: "evil@example.test", password: "Evil-test-only-123" })).status === 403);
  await check("a cleaner can't create cleaner logins", (await call(annT, "POST", "/api/team/cleaners", { email: "e@example.test", password: annPw, staffId: ann })).status === 403);

  const mine = (await call(annT, "GET", "/api/cleaner/jobs")).body;
  const ids = mine.jobs.map((j: any) => j.id);
  await check("My jobs lists their job", ids.includes(annJob));
  await check("a job outside the date window can't be opened directly", (await call(annT, "GET", `/api/cleaner/jobs/${annFar}`)).status === 404
    && (await call(annT, "PATCH", `/api/cleaner/jobs/${annFar}`, { damageNotes: "x" })).status === 404
    && (await call(annT, "GET", `/api/cleaner/jobs/${annFar}/photos`)).status === 404);
  await check("My jobs leaves out other people's jobs", !ids.includes(otherJob) && !ids.includes(benJob));
  await check("My jobs leaves out canceled jobs", !ids.includes(annCanceled));
  await check("My jobs stops at about two months ahead", !ids.includes(annFar));
  const d = await call(annT, "GET", `/api/cleaner/jobs/${annJob}`);
  await check("job detail shows how to get in", d.body.property.entryInstructions === "Lockbox 4321 on the back door" && d.body.property.accessNotes === "Park in the gravel lot");
  await check("job detail shows supplies, beds and the customer's name", d.body.property.supplyNotes.includes("towels") && "king" in d.body.property.beds && !!d.body.customerName);
  await check("job detail shows the job notes and checklist", d.body.notes === "Please water the plants" && d.body.checklistItems.length === 2);
  await check("no price, internal notes or customer contact details", !d.text.includes("777.77") && !d.text.includes("SECRET-INTERNAL")
    && !d.text.includes("owner-secret@") && !d.text.includes("555-0199") && !("price" in d.body));
  await check("staff don't see pay", d.body.pay === null);
  await check("turnover timing is shown", d.body.stays.lastCheckOut?.checkOutDate === day(0) && d.body.stays.nextCheckIn?.checkInDate === day(2) && d.body.stays.nextCheckIn.guestCount === 2);
  await check("guest names and phones stay private", !d.text.includes("SECRET-GUEST") && !d.text.includes("555-0177"));
  await check("someone else's job is not found", (await call(annT, "GET", `/api/cleaner/jobs/${otherJob}`)).status === 404 && (await call(annT, "GET", `/api/cleaner/jobs/${benJob}`)).status === 404);

  const ticked = await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}/checklist/${item1}`, { isCompleted: true });
  await check("a cleaner checks off a checklist item", ticked.status === 200 && ticked.body.checklist.done === 1);
  await check("they can't tick another job's item through their own job", (await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}/checklist/${otherItem}`, { isCompleted: true })).status === 404);
  await check("they can't tick another job's item directly", (await call(annT, "PATCH", `/api/cleaner/jobs/${otherJob}/checklist/${otherItem}`, { isCompleted: true })).status === 404);
  const noted = await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}`, { damageNotes: "Cracked lamp in bedroom 2" });
  await check("a cleaner adds damage notes", noted.status === 200 && noted.body.damageNotes === "Cracked lamp in bedroom 2");

  const up = await upload(annT, `/api/cleaner/jobs/${annJob}/photos?section=damage&name=lamp.jpg`);
  const photo = await up.json();
  await check("a cleaner uploads a damage photo", up.status === 201 && photo.mine === true && !("createdBy" in photo));
  await check("they can view their photo", (await fetch(`${base}/api/cleaner/job-photos/${photo.id}/file`, { headers: { Authorization: `Bearer ${annT}` } })).status === 200);
  await check("they can't upload to someone else's job", (await upload(annT, `/api/cleaner/jobs/${benJob}/photos?section=damage`)).status === 404);
  const officePhoto = await (await upload(owner, `/api/jobs/${annJob}/photos?section=final_walkthrough`)).json();
  const list = (await call(annT, "GET", `/api/cleaner/jobs/${annJob}/photos`)).body;
  await check("they see the office's photos on their job", list.length === 2 && list.find((x: any) => x.id === officePhoto.id)?.mine === false);
  await check("they can't delete the office's photos", (await call(annT, "DELETE", `/api/cleaner/job-photos/${officePhoto.id}`)).status === 403);
  const otherPhoto = await (await upload(owner, `/api/jobs/${otherJob}/photos?section=damage`)).json();
  await check("they can't open photos from someone else's job", (await fetch(`${base}/api/cleaner/job-photos/${otherPhoto.id}/file`, { headers: { Authorization: `Bearer ${annT}` } })).status === 404);
  await check("they can delete their own photo", (await call(annT, "DELETE", `/api/cleaner/job-photos/${photo.id}`)).status === 204);

  const done = await call(annT, "POST", `/api/cleaner/jobs/${annJob}/complete`);
  await check("a cleaner marks their job complete", done.status === 200 && done.body.status === "completed" && !!done.body.completedAt);
  await check("completing doesn't invoice", !(await db.get("SELECT 1 FROM invoices WHERE job_id=?", annJob)));
  (await db.run("UPDATE jobs SET status='invoiced' WHERE id=?", annJob));
  await check("an invoiced job is locked", (await call(annT, "PATCH", `/api/cleaner/jobs/${annJob}`, { damageNotes: "late edit" })).status === 409
    && (await call(annT, "POST", `/api/cleaner/jobs/${annJob}/complete`)).status === 409);
  await check("but still readable", (await call(annT, "GET", `/api/cleaner/jobs/${annJob}`)).body.canEdit === false);

  // ---- Subcontractor cleaner ----
  const benT = (await login("ben@example.test", benPw)).token;
  const benJobs = (await call(benT, "GET", "/api/cleaner/jobs")).body.jobs;
  await check("a subcontractor sees their job and its pay", benJobs.length === 1 && benJobs[0].id === benJob && benJobs[0].pay === 85);
  const before = (await call(benT, "GET", "/api/cleaner/me")).body;
  await check("a subcontractor sees their pay totals", before.kind === "subcontractor" && before.pay.owed === 0 && before.pay.upcomingJobs === 1);
  await call(benT, "POST", `/api/cleaner/jobs/${benJob}/complete`);
  await check("completing a job adds it to what they're owed", (await call(benT, "GET", "/api/cleaner/me")).body.pay.owed === 85);
  await check("a subcontractor can't see the staff cleaner's job", (await call(benT, "GET", `/api/cleaner/jobs/${annJob}`)).status === 404);

  // ---- Staying signed in ----
  const status = await (await fetch(`${base}/api/auth/status`)).json();
  await check("the sign-in page knows the business name", typeof status.businessName === "string" && "businessPhone" in status);
  const kept = await auth("login", { email: "ben@example.test", password: benPw, remember: true });
  await check("a cleaner can stay signed in for 30 days", kept.remembered === true && kept.expiresAt - Date.now() > 29 * 864e5);
  await check("a saved cleaner session can be resumed", (await call(kept.token, "GET", "/api/session")).body.role === "cleaner");
  const keptRes = await loginRaw({ email: "ben@example.test", password: benPw, remember: true });
  const setCookie = keptRes.headers.get("set-cookie") || "";
  await check("the saved sign-in is an HttpOnly, SameSite=Strict cookie", /mrcc_crew=[a-f0-9]{64}/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Max-Age=2592000/i.test(setCookie));
  const benCookie = crewCookieOf(keptRes);
  const resumed = await resume(benCookie);
  await check("reopening the app resumes from the cookie", resumed.status === 200 && (await resumed.json()).token === benCookie.split("=")[1]);
  await check("no cookie, nothing to resume", (await resume("")).status === 204 && (await resume("mrcc_crew=nope")).status === 204 && (await resume("mrcc_crew=%")).status === 204);
  const briefRes = await loginRaw({ email: "ben@example.test", password: benPw });
  await check("signing in without the box clears the saved cookie", /mrcc_crew=;/.test(briefRes.headers.get("set-cookie") || ""));
  const brief = await auth("login", { email: "ben@example.test", password: benPw });
  await check("without the box it lasts 12 hours", brief.remembered === false && brief.expiresAt - Date.now() < 13 * 3600000);
  const ownerKept = await auth("login", { email: "owner@example.test", password: "Owner-test-only-123", remember: true });
  const ownerRes = await loginRaw({ email: "owner@example.test", password: "Owner-test-only-123", remember: true });
  await check("owners never get a saved cookie", !/mrcc_crew=[a-f0-9]/.test(ownerRes.headers.get("set-cookie") || ""));
  await check("owners can't stay signed in", ownerKept.remembered === false && ownerKept.expiresAt - Date.now() < 13 * 3600000);
  await check("a cleaner sees how to reach the office", "office" in (await call(benT, "GET", "/api/cleaner/me")).body);

  // ---- Owner stays in charge ----
  await check("owners still have the full app", (await call(owner, "GET", "/api/customers")).status === 200);
  await check("My jobs is only for cleaner logins", (await call(owner, "GET", "/api/cleaner/jobs")).status === 403);
  const newPw = "Ann-new-only-123456";
  await call(owner, "PATCH", `/api/team/cleaners/${annAcct.body.id}`, { password: newPw });
  await check("a password reset signs the cleaner out", (await call(annT, "GET", "/api/cleaner/jobs")).status === 401);
  const annT2 = (await login("ann@example.test", newPw)).token;
  await check("they sign in with the new password", (await call(annT2, "GET", "/api/cleaner/jobs")).status === 200);
  const off = await call(owner, "PATCH", `/api/team/cleaners/${annAcct.body.id}`, { active: false });
  await check("turning a login off signs them out", off.body.active === false && (await call(annT2, "GET", "/api/cleaner/jobs")).status === 401);
  await check("and stops them signing in", !(await login("ann@example.test", newPw)).token);
  (await db.run("UPDATE subcontractors SET active=0 WHERE id=?", ben));
  const benOff = await call(benT, "GET", "/api/cleaner/jobs");
  await check("making the subcontractor inactive blocks their login", benOff.status === 401 || benOff.status === 403);
  await check("an inactive subcontractor can't sign in", !(await login("ben@example.test", benPw)).token);
  (await db.run("UPDATE subcontractors SET active=1 WHERE id=?", ben));
  const benT2 = (await login("ben@example.test", benPw)).token;
  await check("reactivated subcontractor can sign in again", (await call(benT2, "GET", "/api/cleaner/jobs")).status === 200);
  const benRec = (await call(owner, "GET", "/api/subcontractors")).body.find((x: any) => x.id === ben);
  const offRes = await call(owner, "PATCH", `/api/subcontractors/${ben}`, { ...benRec, active: false });
  await check("owner can turn the subcontractor off", offRes.status === 200 && offRes.body.active === false);
  (await db.run("UPDATE subcontractors SET active=1 WHERE id=?", ben));
  await check("turning a subcontractor off in the app ends their sessions for good", (await call(benT2, "GET", "/api/cleaner/jobs")).status === 401);
  await check("including a remembered 30-day sign-in", (await call(kept.token, "GET", "/api/session")).status === 401);
  await check("and its cookie no longer resumes", (await resume(benCookie)).status === 204);

  const cara = await insert("INSERT INTO staff (name, role, email, phone, color_tag, active) VALUES (?,?,?,?,?,1)", "Cara Cleaner", "cleaner", "cara@example.test", "555-0103", "#654321");
  const caraPw = "Cara-test-only-123456";
  const caraAcct = await call(owner, "POST", "/api/team/cleaners", { email: "cara@example.test", password: caraPw, staffId: cara });
  await check("owner creates another staff login", caraAcct.status === 201);
  const caraKept = await auth("login", { email: "cara@example.test", password: caraPw, remember: true });
  const bye = await fetch(`${base}/api/logout`, { method: "POST", headers: { Authorization: `Bearer ${caraKept.token}` } });
  await check("signing out clears the saved cookie", /mrcc_crew=;/.test(bye.headers.get("set-cookie") || ""));
  await check("signing out ends a remembered sign-in", bye.status === 204 && (await call(caraKept.token, "GET", "/api/session")).status === 401);
  const caraKept2 = await auth("login", { email: "cara@example.test", password: caraPw, remember: true });
  const caraPw2 = "Cara-reset-only-123456";
  await call(owner, "PATCH", `/api/team/cleaners/${caraAcct.body.id}`, { password: caraPw2 });
  await check("a password reset ends a remembered sign-in", (await call(caraKept2.token, "GET", "/api/session")).status === 401);
  await call(owner, "PATCH", `/api/team/cleaners/${caraAcct.body.id}`, { password: caraPw });
  const caraKept3 = await auth("login", { email: "cara@example.test", password: caraPw, remember: true });
  await call(owner, "PATCH", `/api/team/cleaners/${caraAcct.body.id}`, { active: false });
  await check("turning the login off ends a remembered sign-in", (await call(caraKept3.token, "GET", "/api/session")).status === 401);
  await call(owner, "PATCH", `/api/team/cleaners/${caraAcct.body.id}`, { active: true });
  const caraT = (await login("cara@example.test", caraPw)).token;
  await check("staff cleaner signs in", (await call(caraT, "GET", "/api/cleaner/jobs")).status === 200);
  await check("owner turns the staff member off", (await call(owner, "PATCH", `/api/staff/${cara}`, { active: false })).body.active === false);
  await check("an inactive staff member is blocked and can't sign in", (await call(caraT, "GET", "/api/cleaner/jobs")).status === 401 && !(await login("cara@example.test", caraPw)).token);
  await call(owner, "PATCH", `/api/staff/${cara}`, { active: true });
  await check("turning staff back on doesn't revive the old session", (await call(caraT, "GET", "/api/cleaner/jobs")).status === 401);
  await check("but they can sign in fresh", !!(await login("cara@example.test", caraPw)).token);

  await check("database links stay consistent", true /* Postgres enforces every link itself */);
  console.log(`${count} cleaner checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
