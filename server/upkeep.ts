import type { Express, Response } from "express";
import { z } from "zod";
import { db } from "./db";
import { UPKEEP_KEYS, HOT_TUB_DRAIN } from "@shared/upkeep";

/**
 * Deep-cleaning tasks and hot tub drains, logged per property. Each entry records one task done
 * on one day; "last done" is the latest entry, so a wrong entry is fixed by deleting it.
 * Owner-only: registered after the sign-in gate, which keeps cleaner logins out of /api/*.
 */
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const actor = (res: Response) => res.locals.user?.email || "Workspace user";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Enter a valid date");
const logSchema = z.object({
  tasks: z.array(z.enum(UPKEEP_KEYS as [string, ...string[]])).min(1, "Tick at least one task.").max(UPKEEP_KEYS.length),
  doneOn: date,
  note: z.string().trim().max(300).optional().default(""),
});
const entry = (r: any) => ({ id: Number(r.id), propertyId: Number(r.property_id), task: r.task, doneOn: r.done_on, note: r.note, createdAt: r.created_at, createdBy: r.created_by });

async function findProperty(id: number) {
  const p = Number.isSafeInteger(id) ? await db.get("SELECT id, name, has_hot_tub FROM properties WHERE id=?", id) : undefined;
  if (!p) fail(404, "Property not found");
  return p;
}

/** Latest date per task for each property, as { [propertyId]: { [task]: "YYYY-MM-DD" } }. */
async function lastDone(propertyId?: number) {
  const rows = await db.all(`SELECT property_id, task, max(done_on) last FROM upkeep_log ${propertyId ? "WHERE property_id=?" : ""} GROUP BY property_id, task`, ...(propertyId ? [propertyId] : []));
  const out: Record<number, Record<string, string>> = {};
  for (const r of rows) (out[Number(r.property_id)] ??= {})[r.task] = r.last;
  return out;
}

export function registerUpkeep(app: Express) {
  // Every active property, for the Deep Cleaning overview.
  app.get("/api/upkeep", async (_req, res) => {
    const props = await db.all("SELECT id, name, has_hot_tub FROM properties WHERE active=1 ORDER BY name, id");
    const last = await lastDone();
    res.json(props.map(p => ({ propertyId: Number(p.id), name: p.name, hasHotTub: !!Number(p.has_hot_tub), lastDone: last[Number(p.id)] ?? {} })));
  });

  app.get("/api/properties/:id/upkeep", async (req, res) => {
    const p = await findProperty(Number(req.params.id));
    const history = await db.all("SELECT * FROM upkeep_log WHERE property_id=? ORDER BY done_on DESC, id DESC LIMIT 100", p.id);
    res.json({ propertyId: Number(p.id), hasHotTub: !!Number(p.has_hot_tub), lastDone: (await lastDone(Number(p.id)))[Number(p.id)] ?? {}, history: history.map(entry) });
  });

  app.post("/api/properties/:id/upkeep", async (req, res) => {
    const p = await findProperty(Number(req.params.id));
    const parsed = logSchema.safeParse(req.body);
    if (!parsed.success) fail(400, parsed.error.issues[0]?.message || "Check the tasks and date.");
    const { tasks, doneOn, note } = parsed.data;
    if (tasks.includes(HOT_TUB_DRAIN.key) && !Number(p.has_hot_tub)) fail(400, "This property isn't set up with a hot tub.");
    const now = new Date().toISOString();
    await db.tx(async () => {
      for (const task of Array.from(new Set(tasks)))
        await db.run("INSERT INTO upkeep_log (property_id,task,done_on,note,created_at,created_by) VALUES (?,?,?,?,?,?)", p.id, task, doneOn, note, now, actor(res));
    });
    res.status(201).json({ ok: true });
  });

  app.put("/api/properties/:id/hot-tub", async (req, res) => {
    const p = await findProperty(Number(req.params.id));
    const parsed = z.object({ hasHotTub: z.boolean() }).safeParse(req.body);
    if (!parsed.success) fail(400, "Say whether the property has a hot tub.");
    await db.run("UPDATE properties SET has_hot_tub=? WHERE id=?", parsed.data.hasHotTub ? 1 : 0, p.id);
    res.json({ hasHotTub: parsed.data.hasHotTub });
  });

  app.delete("/api/upkeep-log/:id", async (req, res) => {
    const id = Number(req.params.id);
    const r = Number.isSafeInteger(id) ? await db.run("DELETE FROM upkeep_log WHERE id=?", id) : { changes: 0 };
    if (!r.changes) fail(404, "That entry was already removed.");
    res.status(204).send();
  });
}
