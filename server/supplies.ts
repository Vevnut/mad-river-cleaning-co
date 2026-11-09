import type { Express, Response } from "express";
import { z } from "zod";
import { db } from "./db";

/**
 * Supplies inventory: what's on hand, either in the company's own stock (no property) or kept
 * at a property for guests. "Reorder at" flags an item as low. Owner-only, registered after
 * the sign-in gate. Counts change with +/- through /adjust, which can't race below zero.
 */
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const actor = (res: Response) => res.locals.user?.email || "Workspace user";
const amount = z.number().finite().min(0, "Counts can't be below zero.").max(1_000_000);
const supplySchema = z.object({
  name: z.string().trim().min(1, "Name the item.").max(120),
  propertyId: z.number().int().positive().nullable().optional().default(null),
  quantity: amount.default(0),
  unit: z.string().trim().max(30).optional().default(""),
  reorderAt: amount.nullable().optional().default(null),
  notes: z.string().trim().max(500).optional().default(""),
});
const round = (n: number) => Math.round(n * 100) / 100;
const row = (r: any) => r && ({
  id: Number(r.id), name: r.name, propertyId: r.property_id == null ? null : Number(r.property_id), propertyName: r.property_name ?? null,
  quantity: Number(r.quantity), unit: r.unit, reorderAt: r.reorder_at == null ? null : Number(r.reorder_at), notes: r.notes,
  low: r.reorder_at != null && Number(r.quantity) <= Number(r.reorder_at), updatedAt: r.updated_at, updatedBy: r.updated_by,
});
const SELECT = "SELECT s.*, p.name property_name FROM supplies s LEFT JOIN properties p ON p.id=s.property_id";
const get = async (id: number) => (Number.isSafeInteger(id) ? row(await db.get(`${SELECT} WHERE s.id=?`, id)) : undefined);

async function parse(body: unknown) {
  const parsed = supplySchema.safeParse(body);
  if (!parsed.success) fail(400, parsed.error.issues[0]?.message || "Check the item details.");
  const d = parsed.data;
  if (d.propertyId && !(await db.get("SELECT 1 FROM properties WHERE id=?", d.propertyId))) fail(400, "That property no longer exists.");
  return { name: d.name, property_id: d.propertyId, quantity: round(d.quantity), unit: d.unit, reorder_at: d.reorderAt == null ? null : round(d.reorderAt), notes: d.notes };
}

export function registerSupplies(app: Express) {
  app.get("/api/supplies", async (_req, res) => {
    res.json((await db.all(`${SELECT} ORDER BY s.property_id NULLS FIRST, p.name, lower(s.name), s.id`)).map(row));
  });

  app.post("/api/supplies", async (req, res) => {
    const c = await parse(req.body);
    const now = new Date().toISOString();
    const id = await db.insertId("INSERT INTO supplies (name,property_id,quantity,unit,reorder_at,notes,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)",
      c.name, c.property_id, c.quantity, c.unit, c.reorder_at, c.notes, now, now, actor(res));
    res.status(201).json(await get(id));
  });

  app.patch("/api/supplies/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!(await get(id))) fail(404, "Item not found");
    const c = await parse(req.body);
    await db.run("UPDATE supplies SET name=?,property_id=?,quantity=?,unit=?,reorder_at=?,notes=?,updated_at=?,updated_by=? WHERE id=?",
      c.name, c.property_id, c.quantity, c.unit, c.reorder_at, c.notes, new Date().toISOString(), actor(res), id);
    res.json(await get(id));
  });

  // +1 / -1 (or any step) from the list. Stops at zero instead of failing.
  app.post("/api/supplies/:id/adjust", async (req, res) => {
    const id = Number(req.params.id);
    const parsed = z.object({ delta: z.number().finite().min(-1_000_000).max(1_000_000) }).safeParse(req.body);
    if (!parsed.success) fail(400, "Enter how many to add or take away.");
    const r = Number.isSafeInteger(id)
      ? await db.run("UPDATE supplies SET quantity=round(LEAST(GREATEST(quantity + ?::double precision, 0), 1000000)::numeric, 2), updated_at=?, updated_by=? WHERE id=?", parsed.data.delta, new Date().toISOString(), actor(res), id)
      : { changes: 0 };
    if (!r.changes) fail(404, "Item not found");
    res.json(await get(id));
  });

  app.delete("/api/supplies/:id", async (req, res) => {
    const id = Number(req.params.id);
    const r = Number.isSafeInteger(id) ? await db.run("DELETE FROM supplies WHERE id=?", id) : { changes: 0 };
    if (!r.changes) fail(404, "Item not found");
    res.status(204).send();
  });
}
