import type { Express } from "express";

/**
 * The one-zip "full backup" was built for moving off the old SQLite host: it copied the
 * database file and every photo into one download. On Vercel + Neon:
 *  - Neon keeps the database's point-in-time history (restore from the Neon console), and
 *  - photos and receipts live in a private Vercel Blob store,
 * and a Vercel response can't exceed 4.5 MB, so this download is turned off here.
 * script/import-sqlite.ts reads the old zip's contents when moving data in.
 */
export function registerFullBackup(app: Express) {
  app.post("/api/backup/full", (_req, res) => {
    if (res.locals.user?.role !== "owner") return res.status(403).json({ message: "Only the owner can download a full backup." });
    res.status(501).json({ message: "Full backup downloads aren't available on this hosting. Your data is backed up automatically by Neon; ask your developer for an export if you need one." });
  });
}
