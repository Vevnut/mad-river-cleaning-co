import type { Express, Response } from "express";
import { z } from "zod";
import { db } from "./db";

/**
 * What cleaners send the office from a job: messages about problems at the house, plus the
 * job's start time and the deep-cleaning tasks ticked on it. Owner-only (registered after the
 * sign-in gate); cleaners write through /api/cleaner/*.
 */
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const actor = (res: Response) => res.locals.user?.email || "Workspace user";
const issue = (i: any) => ({
  id: Number(i.id), jobId: Number(i.job_id), body: i.body, createdAt: i.created_at, createdBy: i.created_by, createdByName: i.created_by_name || i.created_by,
  resolvedAt: i.resolved_at ?? null, resolvedBy: i.resolved_by ?? null,
  ...(i.property_name !== undefined && { propertyName: i.property_name, scheduledDate: i.scheduled_date }),
});

export function registerJobIssues(app: Express) {
  // Open messages from cleaners, newest first, for the dashboard.
  app.get("/api/job-issues", async (_req, res) => {
    const rows = await db.all(`SELECT i.*, p.name property_name, j.scheduled_date FROM job_issues i JOIN jobs j ON j.id=i.job_id JOIN properties p ON p.id=j.property_id
      WHERE i.resolved_at IS NULL ORDER BY i.created_at DESC, i.id DESC LIMIT 100`);
    res.json(rows.map(issue));
  });

  app.get("/api/jobs/:id/cleaner-activity", async (req, res) => {
    const id = Number(req.params.id);
    const job = Number.isSafeInteger(id) ? await db.get("SELECT id, started_at, completed_at FROM jobs WHERE id=?", id) : undefined;
    if (!job) fail(404, "Job not found");
    const issues = await db.all("SELECT * FROM job_issues WHERE job_id=? ORDER BY created_at, id", id);
    const upkeep = await db.all("SELECT task, done_on, created_by FROM upkeep_log WHERE job_id=? ORDER BY id", id);
    res.json({ startedAt: job.started_at ?? null, completedAt: job.completed_at ?? null, issues: issues.map(issue), upkeep: upkeep.map(u => ({ task: u.task, doneOn: u.done_on, createdBy: u.created_by })) });
  });

  app.patch("/api/job-issues/:id", async (req, res) => {
    const parsed = z.object({ resolved: z.boolean() }).safeParse(req.body);
    if (!parsed.success) fail(400, "Say whether it's resolved.");
    const id = Number(req.params.id);
    const r = Number.isSafeInteger(id)
      ? await db.run("UPDATE job_issues SET resolved_at=?, resolved_by=? WHERE id=?", parsed.data.resolved ? new Date().toISOString() : null, parsed.data.resolved ? actor(res) : null, id)
      : { changes: 0 };
    if (!r.changes) fail(404, "Message not found");
    res.json(issue(await db.get("SELECT * FROM job_issues WHERE id=?", id)));
  });
}
