import { isJpeg, IMAGE_HEADERS } from "./jpeg";
import express, { type Express } from "express";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { sqlite } from "./storage";

/**
 * Damage and Final Walkthrough photos for jobs. Private to the workspace:
 * every route here is registered after the sign-in gate. Photos are resized and
 * re-encoded to JPEG in the browser (which also strips location data), and the
 * server only accepts real JPEG bytes.
 */
export const PHOTO_SECTIONS = ["damage", "final_walkthrough"] as const;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_SECTION = 30;
const dir = resolve(process.env.PHOTO_DIR || "uploads/job-photos");

const row = (r: any) => r && ({ id: r.id, jobId: r.job_id, section: r.section, originalName: r.original_name, size: r.size, createdAt: r.created_at, createdBy: r.created_by });

export function registerJobPhotos(app: Express) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const job = (id: number) => sqlite.prepare("SELECT id FROM jobs WHERE id=?").get(id);

  app.get("/api/jobs/:id/photos", (req, res) => {
    const id = Number(req.params.id);
    if (!job(id)) return res.status(404).json({ message: "Job not found" });
    res.json((sqlite.prepare("SELECT * FROM job_photos WHERE job_id=? ORDER BY created_at, id").all(id) as any[]).map(row));
  });

  app.post("/api/jobs/:id/photos", express.raw({ type: "image/jpeg", limit: MAX_PHOTO_BYTES }), (req, res) => {
    const id = Number(req.params.id);
    const section = String(req.query.section || "");
    if (!job(id)) return res.status(404).json({ message: "Job not found" });
    if (!(PHOTO_SECTIONS as readonly string[]).includes(section)) return res.status(400).json({ message: "Choose Damage or Final Walkthrough." });
    const body = req.body;
    if (!isJpeg(body))
      return res.status(400).json({ message: "Upload a photo (JPEG)." });
    const n = (sqlite.prepare("SELECT count(*) n FROM job_photos WHERE job_id=? AND section=?").get(id, section) as any).n;
    if (n >= MAX_PHOTOS_PER_SECTION) return res.status(400).json({ message: `This section already has ${MAX_PHOTOS_PER_SECTION} photos.` });
    const fileName = `${randomBytes(16).toString("hex")}.jpg`;
    const originalName = String(req.query.name || "photo.jpg").replace(/[^\w .()-]/g, "").slice(0, 120) || "photo.jpg";
    writeFileSync(join(dir, fileName), body, { mode: 0o600, flag: "wx" });
    try {
      const info = sqlite.prepare("INSERT INTO job_photos (job_id,section,file_name,original_name,size,created_at,created_by) VALUES (?,?,?,?,?,?,?)")
        .run(id, section, fileName, originalName, body.length, new Date().toISOString(), res.locals.user?.email || "Workspace user");
      res.status(201).json(row(sqlite.prepare("SELECT * FROM job_photos WHERE id=?").get(info.lastInsertRowid)));
    } catch (err) {
      unlinkSync(join(dir, fileName));
      throw err;
    }
  });

  app.get("/api/job-photos/:id/file", (req, res) => {
    const photo = sqlite.prepare("SELECT file_name FROM job_photos WHERE id=?").get(Number(req.params.id)) as any;
    const path = photo && join(dir, photo.file_name);
    if (!path || !/^[a-f0-9]{32}\.jpg$/.test(photo.file_name) || !existsSync(path)) return res.status(404).json({ message: "Photo not found" });
    res.set(IMAGE_HEADERS);
    res.send(readFileSync(path));
  });

  app.delete("/api/job-photos/:id", (req, res) => {
    const photo = sqlite.prepare("SELECT * FROM job_photos WHERE id=?").get(Number(req.params.id)) as any;
    if (!photo) return res.status(404).json({ message: "Photo not found" });
    sqlite.prepare("DELETE FROM job_photos WHERE id=?").run(photo.id);
    const path = join(dir, photo.file_name);
    if (/^[a-f0-9]{32}\.jpg$/.test(photo.file_name) && existsSync(path)) unlinkSync(path);
    res.status(204).send();
  });
}
