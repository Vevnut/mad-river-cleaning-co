import { isJpeg, IMAGE_HEADERS } from "./jpeg";
import express, { type Express, type Response } from "express";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { sqlite } from "./storage";

/**
 * Damage and Final Walkthrough photos for jobs. Private to the workspace:
 * every route here is registered after the sign-in gate. Photos are resized and
 * re-encoded to JPEG in the browser (which also strips location data), and the
 * server only accepts real JPEG bytes. The helpers are shared with the cleaner
 * routes (server/cleaner.ts), which check that the job is the cleaner's first.
 */
export const PHOTO_SECTIONS = ["damage", "final_walkthrough"] as const;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_SECTION = 30;
const dir = resolve(process.env.PHOTO_DIR || "uploads/job-photos");

function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const row = (r: any) => r && ({ id: r.id, jobId: r.job_id, section: r.section, originalName: r.original_name, size: r.size, createdAt: r.created_at, createdBy: r.created_by });
const safeName = (fileName: string) => /^[a-f0-9]{32}\.jpg$/.test(fileName);

export const photoUpload = express.raw({ type: "image/jpeg", limit: MAX_PHOTO_BYTES });
export const findJobPhoto = (id: number) => sqlite.prepare("SELECT * FROM job_photos WHERE id=?").get(id) as any;

export function listJobPhotos(jobId: number) {
  return (sqlite.prepare("SELECT * FROM job_photos WHERE job_id=? ORDER BY created_at, id").all(jobId) as any[]).map(row);
}

export function addJobPhoto(jobId: number, section: string, body: Buffer, name: unknown, actor: string) {
  if (!(PHOTO_SECTIONS as readonly string[]).includes(section)) fail(400, "Choose Damage or Final Walkthrough.");
  if (!isJpeg(body)) fail(400, "Upload a photo (JPEG).");
  const n = (sqlite.prepare("SELECT count(*) n FROM job_photos WHERE job_id=? AND section=?").get(jobId, section) as any).n;
  if (n >= MAX_PHOTOS_PER_SECTION) fail(400, `This section already has ${MAX_PHOTOS_PER_SECTION} photos.`);
  const fileName = `${randomBytes(16).toString("hex")}.jpg`;
  const originalName = String(name || "photo.jpg").replace(/[^\w .()-]/g, "").slice(0, 120) || "photo.jpg";
  writeFileSync(join(dir, fileName), body, { mode: 0o600, flag: "wx" });
  try {
    const info = sqlite.prepare("INSERT INTO job_photos (job_id,section,file_name,original_name,size,created_at,created_by) VALUES (?,?,?,?,?,?,?)")
      .run(jobId, section, fileName, originalName, body.length, new Date().toISOString(), actor);
    return row(findJobPhoto(Number(info.lastInsertRowid)));
  } catch (err) {
    unlinkSync(join(dir, fileName));
    throw err;
  }
}

export function sendJobPhoto(res: Response, photo: any) {
  const path = photo && join(dir, photo.file_name);
  if (!path || !safeName(photo.file_name) || !existsSync(path)) fail(404, "Photo not found");
  res.set(IMAGE_HEADERS);
  res.send(readFileSync(path));
}

export function deleteJobPhoto(photo: any) {
  sqlite.prepare("DELETE FROM job_photos WHERE id=?").run(photo.id);
  const path = join(dir, photo.file_name);
  if (safeName(photo.file_name) && existsSync(path)) unlinkSync(path);
}

export function registerJobPhotos(app: Express) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const job = (id: number) => sqlite.prepare("SELECT id FROM jobs WHERE id=?").get(id);

  app.get("/api/jobs/:id/photos", (req, res) => {
    const id = Number(req.params.id);
    if (!job(id)) return res.status(404).json({ message: "Job not found" });
    res.json(listJobPhotos(id));
  });

  app.post("/api/jobs/:id/photos", photoUpload, (req, res) => {
    const id = Number(req.params.id);
    if (!job(id)) return res.status(404).json({ message: "Job not found" });
    res.status(201).json(addJobPhoto(id, String(req.query.section || ""), req.body, req.query.name, res.locals.user?.email || "Workspace user"));
  });

  app.get("/api/job-photos/:id/file", (req, res) => sendJobPhoto(res, findJobPhoto(Number(req.params.id))));

  app.delete("/api/job-photos/:id", (req, res) => {
    const photo = findJobPhoto(Number(req.params.id));
    if (!photo) return res.status(404).json({ message: "Photo not found" });
    deleteJobPhoto(photo);
    res.status(204).send();
  });
}
