import type { Express, Response } from "express";
import { z } from "zod";
import { sqlite } from "./storage";
import { credentials, createAccount, setPassword, endSessions } from "./auth";
import { subcontractorPay } from "./subcontractors";
import { photoUpload, listJobPhotos, addJobPhoto, findJobPhoto, sendJobPhoto, deleteJobPhoto } from "./job-photos";

/**
 * Cleaner logins. A cleaner account is linked to one staff member or one
 * subcontractor and sees only the jobs they're on: where to go, how to get in,
 * what to do, and (subcontractors) what they're paid. No prices, invoices,
 * customer contact details, internal notes or other cleaners' jobs. The sign-in
 * gate (server/auth.ts) keeps cleaner accounts on /api/cleaner/* only, so every
 * other route stays owner-only. Owners manage the logins under /api/team/cleaners.
 */
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** How far back and ahead My jobs looks. */
export const PAST_DAYS = 14, AHEAD_DAYS = 60;
/** Jobs a cleaner can still update. Invoiced jobs are locked; canceled jobs aren't shown at all. */
const OPEN = ["scheduled", "in_progress", "completed"];

type Me = { email: string; staffId: number | null; subcontractorId: number | null; name: string };

/** The signed-in cleaner. Their staff or subcontractor record must still be active. */
function me(res: Response): Me {
  const u = res.locals.user;
  if (u.role !== "cleaner") fail(403, "My jobs is for cleaner logins.");
  const person = (u.staff_id
    ? sqlite.prepare("SELECT name, active FROM staff WHERE id=?").get(u.staff_id)
    : sqlite.prepare("SELECT name, active FROM subcontractors WHERE id=?").get(u.subcontractor_id)) as any;
  if (!person?.active) fail(403, "Your cleaner login is turned off. Contact the office.");
  return { email: u.email, staffId: u.staff_id ?? null, subcontractorId: u.subcontractor_id ?? null, name: person.name };
}

// A job is "theirs" when they're its assigned staff member or its subcontractor.
const JOBS = `SELECT j.*, p.name property_name, p.address_line1, p.address_line2, p.city, p.state, p.zip,
    c.name customer_name, a.subcontractor_id sub_id, a.pay sub_pay,
    (SELECT count(*) FROM service_checklists k WHERE k.job_id=j.id) checklist_total,
    (SELECT count(*) FROM service_checklists k WHERE k.job_id=j.id AND k.is_completed=1) checklist_done
  FROM jobs j JOIN properties p ON p.id=j.property_id JOIN customers c ON c.id=j.customer_id
  LEFT JOIN job_subcontractors a ON a.job_id=j.id
  WHERE j.status<>'canceled' AND ((@staff IS NOT NULL AND j.assigned_staff_id=@staff) OR (@sub IS NOT NULL AND a.subcontractor_id=@sub))`;
const who = (m: Me) => ({ staff: m.staffId, sub: m.subcontractorId });

function summary(r: any, m: Me) {
  return {
    id: r.id, scheduledDate: r.scheduled_date, scheduledTime: r.scheduled_time, durationMinutes: r.duration_minutes,
    jobType: r.job_type, status: r.status, completedAt: r.completed_at,
    property: { name: r.property_name, addressLine1: r.address_line1, addressLine2: r.address_line2, city: r.city, state: r.state, zip: r.zip },
    customerName: r.customer_name,
    // Pay is the subcontractor's own; staff pay isn't tracked in the app.
    pay: m.subcontractorId && r.sub_id === m.subcontractorId ? r.sub_pay : null,
    checklist: { done: r.checklist_done, total: r.checklist_total },
  };
}

function myJob(m: Me, id: number) {
  const r = sqlite.prepare(`${JOBS} AND j.id=@id`).get({ ...who(m), id }) as any;
  if (!r) fail(404, "Job not found");
  return r;
}
function openJob(m: Me, id: number) {
  const r = myJob(m, id);
  if (!OPEN.includes(r.status)) fail(409, "This job has been invoiced, so it can't be changed. Contact the office.");
  return r;
}

const stay = (s: any) => s && { checkInDate: s.check_in_date, checkOutDate: s.check_out_date, guestCount: s.guest_count };

function detail(r: any, m: Me) {
  const p = sqlite.prepare("SELECT * FROM properties WHERE id=?").get(r.property_id) as any;
  // Turnover timing: the guests leaving on or before the clean, and the next guests arriving.
  // Guest names and phone numbers stay in the office.
  const lastOut = sqlite.prepare(`SELECT * FROM stays WHERE property_id=? AND status<>'canceled' AND check_out_date<=?
    ORDER BY check_out_date DESC LIMIT 1`).get(r.property_id, r.scheduled_date);
  const nextIn = sqlite.prepare(`SELECT * FROM stays WHERE property_id=? AND status<>'canceled' AND check_in_date>=?
    ORDER BY check_in_date LIMIT 1`).get(r.property_id, r.scheduled_date);
  return {
    ...summary(r, m),
    notes: r.customer_notes, damageNotes: r.damage_notes,
    canEdit: OPEN.includes(r.status),
    property: {
      ...summary(r, m).property,
      unitType: p.unit_type, bedrooms: p.bedrooms, fullBathrooms: p.full_bathrooms, halfBathrooms: p.half_bathrooms, bathrooms: p.bathrooms,
      maxOccupancy: p.max_occupancy, checkInTime: p.check_in_time, checkOutTime: p.check_out_time,
      beds: { king: p.bed_king, queen: p.bed_queen, full: p.bed_full, twin: p.bed_twin, bunk: p.bed_bunk, sofa: p.bed_sofa },
      entryInstructions: p.entry_instructions, accessNotes: p.access_notes, supplyNotes: p.supply_notes,
    },
    checklistItems: (sqlite.prepare("SELECT id, label, is_completed FROM service_checklists WHERE job_id=? ORDER BY sort_order, id").all(r.id) as any[])
      .map(k => ({ id: k.id, label: k.label, isCompleted: !!k.is_completed })),
    stays: { lastCheckOut: stay(lastOut), nextCheckIn: stay(nextIn) },
  };
}

// Photos as a cleaner sees them: whether they added it, not who in the office did.
const photos = (jobId: number, m: Me) => listJobPhotos(jobId).map(({ createdBy, ...p }: any) => ({ ...p, mine: createdBy === m.email }));
function myPhoto(m: Me, id: number) {
  const photo = findJobPhoto(id);
  if (!photo) fail(404, "Photo not found");
  myJob(m, photo.job_id);
  return photo;
}

const notesSchema = z.object({ damageNotes: z.string().max(4000).nullable().transform(v => v?.trim() || null) });
const checkSchema = z.object({ isCompleted: z.boolean() });
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) fail(400, r.error.issues[0]?.message || "Check the details and try again.");
  return r.data;
};

const accountSchema = credentials.extend({
  staffId: z.number().int().positive().nullable().optional(),
  subcontractorId: z.number().int().positive().nullable().optional(),
}).refine(d => !!d.staffId !== !!d.subcontractorId, "Choose one staff member or one subcontractor.");
const accountUpdate = z.object({
  active: z.boolean().optional(),
  password: credentials.shape.password.optional(),
});
const account = (r: any) => ({
  id: r.id, email: r.email, active: !!r.active, staffId: r.staff_id, subcontractorId: r.subcontractor_id,
  name: r.person_name, kind: r.staff_id ? "staff" : "subcontractor", personActive: !!r.person_active,
});
const ACCOUNTS = `SELECT u.*, coalesce(s.name, b.name) person_name, coalesce(s.active, b.active) person_active
  FROM auth_users u LEFT JOIN staff s ON s.id=u.staff_id LEFT JOIN subcontractors b ON b.id=u.subcontractor_id
  WHERE u.role='cleaner'`;

export function registerCleaner(app: Express) {
  // ---- What a cleaner sees ----
  app.get("/api/cleaner/me", (_req, res) => {
    const m = me(res);
    const pay = m.subcontractorId ? subcontractorPay(m.subcontractorId) : null;
    res.json({ name: m.name, email: m.email, kind: m.staffId ? "staff" : "subcontractor", pay });
  });

  app.get("/api/cleaner/jobs", (_req, res) => {
    const m = me(res), day = today();
    const list = sqlite.prepare(`${JOBS} AND j.scheduled_date>=@from AND j.scheduled_date<=@to ORDER BY j.scheduled_date, j.scheduled_time, j.id`)
      .all({ ...who(m), from: addDays(day, -PAST_DAYS), to: addDays(day, AHEAD_DAYS) }) as any[];
    res.json({ today: day, jobs: list.map(r => summary(r, m)) });
  });

  app.get("/api/cleaner/jobs/:id", (req, res) => {
    const m = me(res);
    res.json(detail(myJob(m, Number(req.params.id)), m));
  });

  app.patch("/api/cleaner/jobs/:id", (req, res) => {
    const m = me(res), r = openJob(m, Number(req.params.id));
    const { damageNotes } = parse(notesSchema, req.body);
    sqlite.prepare("UPDATE jobs SET damage_notes=? WHERE id=?").run(damageNotes, r.id);
    res.json(detail(myJob(m, r.id), m));
  });

  app.patch("/api/cleaner/jobs/:id/checklist/:itemId", (req, res) => {
    const m = me(res), r = openJob(m, Number(req.params.id));
    const { isCompleted } = parse(checkSchema, req.body);
    const info = sqlite.prepare("UPDATE service_checklists SET is_completed=? WHERE id=? AND job_id=?").run(isCompleted ? 1 : 0, Number(req.params.itemId), r.id);
    if (!info.changes) fail(404, "Checklist item not found");
    res.json(detail(myJob(m, r.id), m));
  });

  app.post("/api/cleaner/jobs/:id/complete", (req, res) => {
    const m = me(res), r = openJob(m, Number(req.params.id));
    // Completing never invoices: billing stays with the office.
    if (r.status !== "completed")
      sqlite.prepare("UPDATE jobs SET status='completed', completed_at=? WHERE id=?").run(new Date().toISOString(), r.id);
    res.json(detail(myJob(m, r.id), m));
  });

  app.get("/api/cleaner/jobs/:id/photos", (req, res) => {
    const m = me(res), r = myJob(m, Number(req.params.id));
    res.json(photos(r.id, m));
  });

  app.post("/api/cleaner/jobs/:id/photos", photoUpload, (req, res) => {
    const m = me(res), r = openJob(m, Number(req.params.id));
    const { createdBy, ...photo } = addJobPhoto(r.id, String(req.query.section || ""), req.body, req.query.name, m.email);
    res.status(201).json({ ...photo, mine: true });
  });

  app.get("/api/cleaner/job-photos/:id/file", (req, res) => sendJobPhoto(res, myPhoto(me(res), Number(req.params.id))));

  app.delete("/api/cleaner/job-photos/:id", (req, res) => {
    const m = me(res), photo = myPhoto(m, Number(req.params.id));
    openJob(m, photo.job_id);
    if (photo.created_by !== m.email) fail(403, "You can only delete photos you added.");
    deleteJobPhoto(photo);
    res.status(204).send();
  });

  // ---- Owners: managing cleaner logins ----
  app.get("/api/team/cleaners", (_req, res) => {
    res.json((sqlite.prepare(`${ACCOUNTS} ORDER BY person_name`).all() as any[]).map(account));
  });

  app.post("/api/team/cleaners", (req, res) => {
    const d = parse(accountSchema, req.body);
    if (d.staffId && !sqlite.prepare("SELECT 1 FROM staff WHERE id=?").get(d.staffId)) fail(400, "Choose an existing staff member.");
    if (d.subcontractorId && !sqlite.prepare("SELECT 1 FROM subcontractors WHERE id=?").get(d.subcontractorId)) fail(400, "Choose an existing subcontractor.");
    const id = createAccount(d.email, d.password, { staffId: d.staffId, subcontractorId: d.subcontractorId });
    res.status(201).json(account(sqlite.prepare(`${ACCOUNTS} AND u.id=?`).get(id)));
  });

  app.patch("/api/team/cleaners/:id", (req, res) => {
    const id = String(req.params.id);
    if (!sqlite.prepare("SELECT 1 FROM auth_users WHERE id=? AND role='cleaner'").get(id)) fail(404, "Cleaner login not found");
    const d = parse(accountUpdate, req.body);
    if (d.password) setPassword(id, d.password);
    if (d.active !== undefined) {
      sqlite.prepare("UPDATE auth_users SET active=? WHERE id=?").run(d.active ? 1 : 0, id);
      if (!d.active) endSessions(id);
    }
    res.json(account(sqlite.prepare(`${ACCOUNTS} AND u.id=?`).get(id)));
  });
}
