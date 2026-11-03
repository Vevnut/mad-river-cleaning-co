import { isJpeg, IMAGE_HEADERS } from "./jpeg";
import express, { type Express, type Response } from "express";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { saveFile, loadFile, deleteFile, SAFE_NAME } from "./files";

/**
 * Damage and Final Walkthrough photos for jobs. Private to the workspace:
 * every route here is registered after the sign-in gate. Photos are resized and
 * re-encoded to JPEG in the browser (which also strips location data), and the
 * server only accepts real JPEG bytes. The helpers are shared with the cleaner
 * routes (server/cleaner.ts), which check that the job is the cleaner's first.
 * Files live in a private Vercel Blob store in production (server/files.ts).
 */
export const PHOTO_SECTIONS = ["damage", "final_walkthrough"] as const;
// Vercel caps a request body at 4.5 MB; photos are shrunk to JPEG in the browser well below this.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_PHOTOS_PER_SECTION = 30;

function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const row = (r: any) => r && ({ id: r.id, jobId: r.job_id, section: r.section, originalName: r.original_name, size: r.size, createdAt: r.created_at, createdBy: r.created_by });

export const photoUpload = express.raw({ type: "image/jpeg", limit: MAX_PHOTO_BYTES });
export const findJobPhoto = (id: number) => db.get("SELECT * FROM job_photos WHERE id=?", id);

export async function listJobPhotos(jobId: number) {
  return (await db.all("SELECT * FROM job_photos WHERE job_id=? ORDER BY created_at, id", jobId)).map(row);
}

export async function addJobPhoto(jobId: number, section: string, body: Buffer, name: unknown, actor: string) {
  if (!(PHOTO_SECTIONS as readonly string[]).includes(section)) fail(400, "Choose Damage or Final Walkthrough.");
  if (!isJpeg(body)) fail(400, "Upload a photo (JPEG).");
  const n = Number((await db.get("SELECT count(*) n FROM job_photos WHERE job_id=? AND section=?", jobId, section))!.n);
  if (n >= MAX_PHOTOS_PER_SECTION) fail(400, `This section already has ${MAX_PHOTOS_PER_SECTION} photos.`);
  const fileName = `${randomBytes(16).toString("hex")}.jpg`;
  const originalName = String(name || "photo.jpg").replace(/[^\w .()-]/g, "").slice(0, 120) || "photo.jpg";
  await saveFile("job-photos", fileName, body);
  try {
    const id = await db.insertId("INSERT INTO job_photos (job_id,section,file_name,original_name,size,created_at,created_by) VALUES (?,?,?,?,?,?,?)",
      jobId, section, fileName, originalName, body.length, new Date().toISOString(), actor);
    return row(await findJobPhoto(id));
  } catch (err) {
    await deleteFile("job-photos", fileName);
    throw err;
  }
}

export async function sendJobPhoto(res: Response, photo: any) {
  const bytes = photo && SAFE_NAME.test(photo.file_name) ? await loadFile("job-photos", photo.file_name) : null;
  if (!bytes) fail(404, "Photo not found");
  res.set(IMAGE_HEADERS);
  res.send(bytes);
}

export async function deleteJobPhoto(photo: any) {
  await db.run("DELETE FROM job_photos WHERE id=?", photo.id);
  if (SAFE_NAME.test(photo.file_name)) await deleteFile("job-photos", photo.file_name);
}

export function registerJobPhotos(app: Express) {
  const job = (id: number) => db.get("SELECT id FROM jobs WHERE id=?", id);

  app.get("/api/jobs/:id/photos", async (req, res) => {
    const id = Number(req.params.id);
    if (!(await job(id))) return res.status(404).json({ message: "Job not found" });
    res.json(await listJobPhotos(id));
  });

  app.post("/api/jobs/:id/photos", photoUpload, async (req, res) => {
    const id = Number(req.params.id);
    if (!(await job(id))) return res.status(404).json({ message: "Job not found" });
    res.status(201).json(await addJobPhoto(id, String(req.query.section || ""), req.body, req.query.name, res.locals.user?.email || "Workspace user"));
  });

  app.get("/api/job-photos/:id/file", async (req, res) => sendJobPhoto(res, await findJobPhoto(Number(req.params.id))));

  app.delete("/api/job-photos/:id", async (req, res) => {
    const photo = await findJobPhoto(Number(req.params.id));
    if (!photo) return res.status(404).json({ message: "Photo not found" });
    await deleteJobPhoto(photo);
    res.status(204).send();
  });
}
