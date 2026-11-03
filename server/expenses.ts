import { isJpeg, IMAGE_HEADERS } from "./jpeg";
import express, { type Express } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { saveFile, loadFile, deleteFile } from "./files";
import { SUPPLY_CATEGORIES, PAYMENT_METHODS, roundCents } from "@shared/expenses";

/**
 * Expense tracker: gas and supply costs, with optional receipt photos.
 * Every route is registered after the sign-in gate. Receipts are resized and
 * re-encoded to JPEG in the browser (dropping location data); the server only
 * accepts real JPEG bytes.
 */
// Vercel caps a request body at 4.5 MB; receipts are shrunk to JPEG in the browser well below this.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const MAX_RECEIPTS_PER_EXPENSE = 5;
const SAFE_FILE = /^[a-f0-9]{32}\.jpg$/;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Enter a valid date");
const text = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);
const shared = {
  expenseDate: date,
  description: z.string().trim().max(300).default(""),
  propertyId: z.number().int().positive().nullable().optional().default(null),
  jobId: z.number().int().positive().nullable().optional().default(null),
  notes: text(2000),
};
// Gas: just the dollars spent. (Stored as kind "mileage" so older mileage entries keep working.)
const gasSchema = z.object({
  kind: z.literal("mileage"), ...shared,
  amount: z.number().finite().min(0.01, "Enter the amount spent on gas").max(100000),
  vendor: text(120),
  paymentMethod: z.enum(PAYMENT_METHODS.map(m => m.value) as [string, ...string[]]).nullable().optional().default(null),
});
const supplySchema = z.object({
  kind: z.literal("supply"), ...shared,
  amount: z.number().finite().min(0.01, "Enter the amount").max(100000),
  category: z.enum(SUPPLY_CATEGORIES.map(c => c.value) as [string, ...string[]]).default("cleaning_supplies"),
  vendor: text(120),
  paymentMethod: z.enum(PAYMENT_METHODS.map(m => m.value) as [string, ...string[]]).nullable().optional().default(null),
});
const expenseSchema = z.discriminatedUnion("kind", [gasSchema, supplySchema]);

function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const row = (r: any) => r && ({
  id: r.id, kind: r.kind, expenseDate: r.expense_date, description: r.description, category: r.category,
  vendor: r.vendor, amount: r.amount, miles: r.miles, roundTrip: !!r.round_trip, totalMiles: r.total_miles,
  ratePerMile: r.rate_per_mile, fromLocation: r.from_location, toLocation: r.to_location,
  propertyId: r.property_id, jobId: r.job_id, paymentMethod: r.payment_method, notes: r.notes,
  receiptCount: r.receipt_count ?? 0, createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at,
});
const SELECT = "SELECT e.*, (SELECT count(*) FROM expense_receipts r WHERE r.expense_id=e.id) receipt_count FROM expenses e";
const get = async (id: number) => row((await db.get(`${SELECT} WHERE e.id=?`, id)));

/** Validate and turn a request body into database columns. */
async function columns(body: unknown) {
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) fail(400, parsed.error.issues[0]?.message || "Check the expense details.");
  const d = parsed.data;
  if (d.propertyId && !(await db.get("SELECT 1 FROM properties WHERE id=?", d.propertyId))) fail(400, "That property no longer exists.");
  if (d.jobId && !(await db.get("SELECT 1 FROM jobs WHERE id=?", d.jobId))) fail(400, "That job no longer exists.");
  const common = { expense_date: d.expenseDate, property_id: d.propertyId, job_id: d.jobId, notes: d.notes };
  if (d.kind === "mileage") {
    return { ...common, kind: "mileage", description: d.description || "Gas", category: "gas",
      vendor: d.vendor, amount: roundCents(d.amount), miles: null, round_trip: 0, total_miles: null,
      rate_per_mile: null, from_location: null, to_location: null, payment_method: d.paymentMethod };
  }
  return { ...common, kind: "supply", description: d.description || (SUPPLY_CATEGORIES.find(c => c.value === d.category)?.label ?? "Supplies"),
    category: d.category, vendor: d.vendor, amount: roundCents(d.amount), miles: null, round_trip: 0, total_miles: null,
    rate_per_mile: null, from_location: null, to_location: null, payment_method: d.paymentMethod };
}

async function removeReceiptFile(fileName: string) {
  if (SAFE_FILE.test(fileName)) await deleteFile("expense-receipts", fileName);
}

export function registerExpenses(app: Express) {
  const actor = (res: express.Response) => res.locals.user?.email || "Workspace user";

  app.get("/api/expenses", async (_req, res) => {
    res.json(((await db.all(`${SELECT} ORDER BY e.expense_date DESC, e.id DESC`)) as any[]).map(row));
  });

  app.post("/api/expenses", async (req, res) => {
    const c = await columns(req.body);
    const now = new Date().toISOString();
    const keys = Object.keys(c);
    const info = (await db.run(`INSERT INTO expenses (${keys.join(",")},created_at,created_by,updated_at) VALUES (${keys.map(() => "?").join(",")},?,?,?) RETURNING id`, ...Object.values(c), now, actor(res), now));
    res.status(201).json(await get(Number(info.rows[0].id)));
  });

  app.patch("/api/expenses/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!(await get(id))) fail(404, "Expense not found");
    const c = await columns(req.body);
    (await db.run(`UPDATE expenses SET ${Object.keys(c).map(k => `${k}=?`).join(",")}, updated_at=? WHERE id=?`, ...Object.values(c), new Date().toISOString(), id));
    res.json(await get(id));
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!(await get(id))) fail(404, "Expense not found");
    const files = ((await db.all("SELECT file_name FROM expense_receipts WHERE expense_id=?", id)) as any[]).map(r => r.file_name);
    await db.tx(async () => {
      (await db.run("DELETE FROM expense_receipts WHERE expense_id=?", id));
      (await db.run("DELETE FROM expenses WHERE id=?", id));
    });
    for (const f of files) await removeReceiptFile(f);
    res.status(204).send();
  });

  // ---------------- receipts ----------------
  const receipt = (r: any) => r && ({ id: r.id, expenseId: r.expense_id, originalName: r.original_name, size: r.size, createdAt: r.created_at });

  app.get("/api/expenses/:id/receipts", async (req, res) => {
    const id = Number(req.params.id);
    if (!(await get(id))) fail(404, "Expense not found");
    res.json(((await db.all("SELECT * FROM expense_receipts WHERE expense_id=? ORDER BY id", id)) as any[]).map(receipt));
  });

  app.post("/api/expenses/:id/receipts", express.raw({ type: "image/jpeg", limit: MAX_RECEIPT_BYTES }), async (req, res) => {
    const id = Number(req.params.id);
    if (!(await get(id))) fail(404, "Expense not found");
    const body = req.body;
    if (!isJpeg(body))
      fail(400, "Upload a photo of the receipt (JPEG).");
    const n = ((await db.get("SELECT count(*) n FROM expense_receipts WHERE expense_id=?", id)) as any).n;
    if (n >= MAX_RECEIPTS_PER_EXPENSE) fail(400, `An expense can have up to ${MAX_RECEIPTS_PER_EXPENSE} receipt photos.`);
    const fileName = `${randomBytes(16).toString("hex")}.jpg`;
    const originalName = String(req.query.name || "receipt.jpg").replace(/[^\w .()-]/g, "").slice(0, 120) || "receipt.jpg";
    await saveFile("expense-receipts", fileName, body);
    try {
      const info = (await db.run("INSERT INTO expense_receipts (expense_id,file_name,original_name,size,created_at,created_by) VALUES (?,?,?,?,?,?) RETURNING id", id, fileName, originalName, body.length, new Date().toISOString(), actor(res)));
      res.status(201).json(receipt((await db.get("SELECT * FROM expense_receipts WHERE id=?", info.rows[0].id))));
    } catch (err) {
      await removeReceiptFile(fileName);
      throw err;
    }
  });

  app.get("/api/expense-receipts/:id/file", async (req, res) => {
    const r = (await db.get("SELECT file_name FROM expense_receipts WHERE id=?", Number(req.params.id))) as any;
    const bytes = r && SAFE_FILE.test(r.file_name) ? await loadFile("expense-receipts", r.file_name) : null;
    if (!bytes) fail(404, "Receipt not found");
    res.set(IMAGE_HEADERS);
    res.send(bytes);
  });

  app.delete("/api/expense-receipts/:id", async (req, res) => {
    const r = (await db.get("SELECT * FROM expense_receipts WHERE id=?", Number(req.params.id))) as any;
    if (!r) fail(404, "Receipt not found");
    (await db.run("DELETE FROM expense_receipts WHERE id=?", r.id));
    await removeReceiptFile(r.file_name);
    res.status(204).send();
  });
}
