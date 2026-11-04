import type { Express, Response } from "express";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { isJpeg, IMAGE_HEADERS } from "./jpeg";
import { saveFile, loadFile, deleteFile, SAFE_NAME } from "./files";
import { photoUpload } from "./job-photos";

/**
 * Photos attached to an invoice. Unlike job photos these go to the customer: they print on the
 * invoice, the PDF and the public invoice page. Adding and removing is owner-only (registered
 * after the sign-in gate); customers only reach them through their invoice link.
 *
 * A Vercel response is capped at 4.5 MB and the PDF and preview carry the photos inside them,
 * so the limits are per invoice, not per photo. 3 MB stays under the cap even as base64 in the HTML.
 */
export const MAX_INVOICE_PHOTOS = 6;
export const MAX_INVOICE_PHOTO_BYTES = 3 * 1024 * 1024;

function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const row = (r: any) => r && ({ id: Number(r.id), invoiceId: Number(r.invoice_id), originalName: r.original_name, size: Number(r.size), createdAt: r.created_at, createdBy: r.created_by });

const findPhoto = (id: number) => (Number.isSafeInteger(id) ? db.get("SELECT * FROM invoice_photos WHERE id=?", id) : Promise.resolve(undefined));
const findInvoice = async (id: number) => {
  const inv = Number.isSafeInteger(id) ? await db.get("SELECT id, status FROM invoices WHERE id=?", id) : undefined;
  if (!inv) fail(404, "Invoice not found");
  return inv;
};
const assertNotVoid = (inv: any) => { if (inv.status === "canceled") fail(409, "This invoice is void, so its photos can't be changed."); };
const logActivity = (invoiceId: number, type: string, name: string, actor: string) =>
  db.run("INSERT INTO invoice_activity (invoice_id,activity_type,actor,details,created_at) VALUES (?,?,?,?,?)", invoiceId, type, actor, JSON.stringify({ name }), new Date().toISOString());

export async function listInvoicePhotos(invoiceId: number) {
  return (await db.all("SELECT * FROM invoice_photos WHERE invoice_id=? ORDER BY created_at, id", invoiceId)).map(row);
}

/** The photos' bytes, for embedding in the PDF and printable invoice. A missing file is left out. */
export async function loadInvoicePhotos(invoiceId: number): Promise<Buffer[]> {
  const list = await db.all("SELECT file_name FROM invoice_photos WHERE invoice_id=? ORDER BY created_at, id", invoiceId);
  const files = await Promise.all(list.map(p => loadFile("invoice-photos", p.file_name)));
  if (files.includes(null)) console.error(`Invoice ${invoiceId}: a photo file is missing from storage.`);
  return files.filter((f): f is Buffer => !!f);
}

async function addInvoicePhoto(invoiceId: number, body: Buffer, name: unknown, actor: string) {
  if (!isJpeg(body)) fail(400, "Upload a photo (JPEG).");
  const used = (await db.get("SELECT count(*) n, coalesce(sum(size),0) bytes FROM invoice_photos WHERE invoice_id=?", invoiceId))!;
  if (Number(used.n) >= MAX_INVOICE_PHOTOS) fail(400, `An invoice can have ${MAX_INVOICE_PHOTOS} photos. Remove one first.`);
  if (Number(used.bytes) + body.length > MAX_INVOICE_PHOTO_BYTES) fail(400, "These photos are too large to fit on one invoice. Remove one first.");
  const fileName = `${randomBytes(16).toString("hex")}.jpg`;
  const originalName = String(name || "photo.jpg").replace(/[^\w .()-]/g, "").slice(0, 120) || "photo.jpg";
  await saveFile("invoice-photos", fileName, body);
  try {
    return await db.tx(async () => {
      const id = await db.insertId("INSERT INTO invoice_photos (invoice_id,file_name,original_name,size,created_at,created_by) VALUES (?,?,?,?,?,?)",
        invoiceId, fileName, originalName, body.length, new Date().toISOString(), actor);
      await logActivity(invoiceId, "photo_added", originalName, actor);
      return row(await findPhoto(id));
    });
  } catch (err) {
    await deleteFile("invoice-photos", fileName);
    throw err;
  }
}

async function sendPhoto(res: Response, photo: any) {
  const bytes = photo && SAFE_NAME.test(photo.file_name) ? await loadFile("invoice-photos", photo.file_name) : null;
  if (!bytes) fail(404, "Photo not found");
  res.set(IMAGE_HEADERS);
  res.send(bytes);
}

/** For the public invoice page: the photo must belong to the invoice the link opens. */
export async function sendPublicInvoicePhoto(res: Response, invoiceId: number, photoId: number) {
  const photo = await findPhoto(photoId);
  if (!photo || Number(photo.invoice_id) !== Number(invoiceId)) fail(404, "Photo not found");
  await sendPhoto(res, photo);
}

export function registerInvoicePhotos(app: Express) {
  app.get("/api/invoices/:id/photos", async (req, res) => {
    const inv = await findInvoice(Number(req.params.id));
    res.json(await listInvoicePhotos(inv.id));
  });

  app.post("/api/invoices/:id/photos", photoUpload, async (req, res) => {
    const inv = await findInvoice(Number(req.params.id));
    assertNotVoid(inv);
    res.status(201).json(await addInvoicePhoto(inv.id, req.body, req.query.name, res.locals.user?.email || "Workspace user"));
  });

  app.get("/api/invoice-photos/:id/file", async (req, res) => sendPhoto(res, await findPhoto(Number(req.params.id))));

  app.delete("/api/invoice-photos/:id", async (req, res) => {
    const photo = await findPhoto(Number(req.params.id));
    if (!photo) return res.status(404).json({ message: "Photo not found" });
    assertNotVoid(await findInvoice(Number(photo.invoice_id)));
    await db.tx(async () => {
      await db.run("DELETE FROM invoice_photos WHERE id=?", photo.id);
      await logActivity(Number(photo.invoice_id), "photo_removed", photo.original_name, res.locals.user?.email || "Workspace user");
    });
    if (SAFE_NAME.test(photo.file_name)) await deleteFile("invoice-photos", photo.file_name);
    res.status(204).send();
  });
}
