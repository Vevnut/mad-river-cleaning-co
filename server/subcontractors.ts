import type { Express, Response } from "express";
import { endLinkedSessions } from "./auth";
import { z } from "zod";
import { sqlite } from "./storage";
import { SUB_PAYMENT_METHODS, EARNED_STATUSES } from "@shared/subcontractors";

/**
 * Subcontractors: contact details, W-9 / insurance status, which jobs they did,
 * what each job pays them, and payments made. Registered after the sign-in gate.
 * Owed = pay for their completed/invoiced jobs minus payments recorded.
 */
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const cents = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const actor = (res: Response) => res.locals.user?.email || "Workspace user";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Enter a valid date");
const opt = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);
const subSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  businessName: opt(160), email: z.string().trim().max(200).email("Enter a valid email").or(z.literal("")).nullable().optional().transform(v => v || null),
  phone: opt(40), services: opt(300), notes: opt(2000),
  payType: z.enum(["per_job", "hourly"]).default("per_job"),
  defaultPay: z.number().finite().min(0).max(100000).nullable().optional().default(null),
  w9OnFile: z.boolean().default(false),
  insuranceExpires: date.nullable().optional().or(z.literal("")).transform(v => v || null),
  active: z.boolean().default(true),
});
const paymentSchema = z.object({
  subcontractorId: z.number().int().positive(),
  paidDate: date,
  amount: z.number().finite().positive("Enter the amount paid").max(1000000),
  method: z.enum(SUB_PAYMENT_METHODS.map(m => m.value) as [string, ...string[]]).nullable().optional().default(null),
  reference: opt(120), note: opt(1000),
  jobId: z.number().int().positive().nullable().optional().default(null),
});
const assignSchema = z.object({
  subcontractorId: z.number().int().positive().nullable(),
  pay: z.number().finite().min(0).max(100000).optional(),
});

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) fail(400, r.error.issues[0]?.message || "Check the details and try again.");
  return r.data;
};
const sub = (r: any) => r && ({
  id: r.id, name: r.name, businessName: r.business_name, email: r.email, phone: r.phone, services: r.services,
  payType: r.pay_type, defaultPay: r.default_pay, w9OnFile: !!r.w9_on_file, insuranceExpires: r.insurance_expires,
  notes: r.notes, active: !!r.active, createdAt: r.created_at, updatedAt: r.updated_at,
});
const payment = (r: any) => r && ({
  id: r.id, subcontractorId: r.subcontractor_id, paidDate: r.paid_date, amount: r.amount, method: r.method,
  reference: r.reference, jobId: r.job_id, note: r.note, createdAt: r.created_at, createdBy: r.created_by,
});
const exists = (table: string, id: number) => !!sqlite.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(id);
const earnedIn = EARNED_STATUSES.map(s => `'${s}'`).join(",");

function withTotals(r: any) {
  return { ...sub(r), ...subcontractorPay(r.id) };
}
/** Pay totals for one subcontractor. Also shown to them on their own cleaner page. */
export function subcontractorPay(id: number) {
  const year = today().slice(0, 4);
  const earned = (sqlite.prepare(`SELECT coalesce(sum(a.pay),0) v, count(*) n FROM job_subcontractors a JOIN jobs j ON j.id=a.job_id WHERE a.subcontractor_id=? AND j.status IN (${earnedIn})`).get(id) as any);
  const upcoming = (sqlite.prepare(`SELECT count(*) n FROM job_subcontractors a JOIN jobs j ON j.id=a.job_id WHERE a.subcontractor_id=? AND j.status IN ('scheduled','in_progress')`).get(id) as any).n;
  const paid = (sqlite.prepare("SELECT coalesce(sum(amount),0) v FROM subcontractor_payments WHERE subcontractor_id=?").get(id) as any).v;
  const paidThisYear = (sqlite.prepare("SELECT coalesce(sum(amount),0) v FROM subcontractor_payments WHERE subcontractor_id=? AND paid_date>=? AND paid_date<=?").get(id, `${year}-01-01`, `${year}-12-31`) as any).v;
  return { earned: cents(earned.v), completedJobs: earned.n, upcomingJobs: upcoming, paid: cents(paid), owed: cents(earned.v - paid), paidThisYear: cents(paidThisYear) };
}
const columns = (d: z.infer<typeof subSchema>) => ({
  name: d.name, business_name: d.businessName, email: d.email, phone: d.phone, services: d.services, pay_type: d.payType,
  default_pay: d.defaultPay, w9_on_file: d.w9OnFile ? 1 : 0, insurance_expires: d.insuranceExpires, notes: d.notes, active: d.active ? 1 : 0,
});

export function registerSubcontractors(app: Express) {
  app.get("/api/subcontractors", (_req, res) => {
    res.json((sqlite.prepare("SELECT * FROM subcontractors ORDER BY active DESC, name COLLATE NOCASE").all() as any[]).map(withTotals));
  });

  app.get("/api/subcontractors/:id", (req, res) => {
    const r = sqlite.prepare("SELECT * FROM subcontractors WHERE id=?").get(Number(req.params.id));
    if (!r) fail(404, "Subcontractor not found");
    const jobs = (sqlite.prepare(`SELECT a.job_id, a.pay, j.scheduled_date, j.status, j.job_type, j.property_id, p.name property_name
      FROM job_subcontractors a JOIN jobs j ON j.id=a.job_id LEFT JOIN properties p ON p.id=j.property_id
      WHERE a.subcontractor_id=? ORDER BY j.scheduled_date DESC, j.id DESC`).all(Number(req.params.id)) as any[])
      .map(j => ({ jobId: j.job_id, pay: j.pay, scheduledDate: j.scheduled_date, status: j.status, jobType: j.job_type, propertyId: j.property_id, propertyName: j.property_name }));
    const payments = (sqlite.prepare("SELECT * FROM subcontractor_payments WHERE subcontractor_id=? ORDER BY paid_date DESC, id DESC").all(Number(req.params.id)) as any[]).map(payment);
    res.json({ subcontractor: withTotals(r), jobs, payments });
  });

  app.post("/api/subcontractors", (req, res) => {
    const c = columns(parse(subSchema, req.body));
    const keys = Object.keys(c);
    const info = sqlite.prepare(`INSERT INTO subcontractors (${keys.join(",")},created_at,updated_at) VALUES (${keys.map(() => "?").join(",")},?,?)`).run(...Object.values(c), now(), now());
    res.status(201).json(withTotals(sqlite.prepare("SELECT * FROM subcontractors WHERE id=?").get(info.lastInsertRowid)));
  });

  app.patch("/api/subcontractors/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!exists("subcontractors", id)) fail(404, "Subcontractor not found");
    const c = columns(parse(subSchema, req.body));
    sqlite.prepare(`UPDATE subcontractors SET ${Object.keys(c).map(k => `${k}=?`).join(",")}, updated_at=? WHERE id=?`).run(...Object.values(c), now(), id);
    if (!(sqlite.prepare("SELECT active FROM subcontractors WHERE id=?").get(id) as any).active) endLinkedSessions({ subcontractorId: id });
    res.json(withTotals(sqlite.prepare("SELECT * FROM subcontractors WHERE id=?").get(id)));
  });

  app.delete("/api/subcontractors/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!exists("subcontractors", id)) fail(404, "Subcontractor not found");
    const jobs = (sqlite.prepare("SELECT count(*) n FROM job_subcontractors WHERE subcontractor_id=?").get(id) as any).n;
    const pays = (sqlite.prepare("SELECT count(*) n FROM subcontractor_payments WHERE subcontractor_id=?").get(id) as any).n;
    if (jobs || pays) fail(409, `This subcontractor has ${[jobs && `${jobs} job${jobs === 1 ? "" : "s"}`, pays && `${pays} payment${pays === 1 ? "" : "s"}`].filter(Boolean).join(" and ")} on record, which you'll need for taxes. Mark them inactive instead.`);
    sqlite.prepare("DELETE FROM subcontractors WHERE id=?").run(id);
    res.status(204).send();
  });

  // ---------------- job assignment ----------------
  const assignment = (jobId: number) => {
    const r = sqlite.prepare("SELECT a.*, s.name FROM job_subcontractors a JOIN subcontractors s ON s.id=a.subcontractor_id WHERE a.job_id=?").get(jobId) as any;
    return r ? { jobId: r.job_id, subcontractorId: r.subcontractor_id, pay: r.pay, subcontractorName: r.name } : null;
  };
  // Every job's subcontractor at once, so lists and the schedule can show who's on each job.
  app.get("/api/job-subcontractors", (_req, res) => {
    res.json((sqlite.prepare("SELECT a.job_id, a.subcontractor_id, a.pay, s.name FROM job_subcontractors a JOIN subcontractors s ON s.id=a.subcontractor_id ORDER BY a.job_id").all() as any[])
      .map(r => ({ jobId: r.job_id, subcontractorId: r.subcontractor_id, pay: r.pay, subcontractorName: r.name })));
  });
  app.get("/api/jobs/:id/subcontractor", (req, res) => {
    const id = Number(req.params.id);
    if (!exists("jobs", id)) fail(404, "Job not found");
    res.json(assignment(id));
  });
  app.put("/api/jobs/:id/subcontractor", (req, res) => {
    const id = Number(req.params.id);
    if (!exists("jobs", id)) fail(404, "Job not found");
    const d = parse(assignSchema, req.body);
    if (d.subcontractorId === null) {
      sqlite.prepare("DELETE FROM job_subcontractors WHERE job_id=?").run(id);
      return res.json(null);
    }
    const s = sqlite.prepare("SELECT * FROM subcontractors WHERE id=?").get(d.subcontractorId) as any;
    if (!s) fail(400, "That subcontractor no longer exists.");
    const pay = cents(d.pay ?? s.default_pay ?? 0);
    sqlite.prepare(`INSERT INTO job_subcontractors (job_id,subcontractor_id,pay,assigned_at,assigned_by) VALUES (?,?,?,?,?)
      ON CONFLICT(job_id) DO UPDATE SET subcontractor_id=excluded.subcontractor_id, pay=excluded.pay, assigned_at=excluded.assigned_at, assigned_by=excluded.assigned_by`)
      .run(id, s.id, pay, now(), actor(res));
    res.json(assignment(id));
  });

  // ---------------- payments ----------------
  app.get("/api/subcontractor-payments", (_req, res) => {
    res.json((sqlite.prepare("SELECT * FROM subcontractor_payments ORDER BY paid_date DESC, id DESC").all() as any[]).map(payment));
  });
  app.post("/api/subcontractor-payments", (req, res) => {
    const d = parse(paymentSchema, req.body);
    if (!exists("subcontractors", d.subcontractorId)) fail(400, "That subcontractor no longer exists.");
    if (d.jobId && !exists("jobs", d.jobId)) fail(400, "That job no longer exists.");
    const info = sqlite.prepare("INSERT INTO subcontractor_payments (subcontractor_id,paid_date,amount,method,reference,job_id,note,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(d.subcontractorId, d.paidDate, cents(d.amount), d.method, d.reference, d.jobId, d.note, now(), actor(res));
    res.status(201).json(payment(sqlite.prepare("SELECT * FROM subcontractor_payments WHERE id=?").get(info.lastInsertRowid)));
  });
  app.delete("/api/subcontractor-payments/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!exists("subcontractor_payments", id)) fail(404, "Payment not found");
    sqlite.prepare("DELETE FROM subcontractor_payments WHERE id=?").run(id);
    res.status(204).send();
  });
}
