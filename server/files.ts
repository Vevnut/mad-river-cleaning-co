import { put, get, del } from "@vercel/blob";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Where job photos and expense receipts are kept.
 *  - On Vercel (BLOB_READ_WRITE_TOKEN set): a *private* Vercel Blob store, so files are
 *    never reachable by URL; the app streams them after its own permission checks.
 *  - Locally and in tests: folders on disk (PHOTO_DIR / RECEIPT_DIR), as before.
 * Names are always server-generated random hex, never user input.
 */
export type Bucket = "job-photos" | "expense-receipts";
export const SAFE_NAME = /^[a-f0-9]{16,64}\.[a-z0-9]{2,5}$/;

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const folder = (bucket: Bucket) => resolve(bucket === "job-photos"
  ? process.env.PHOTO_DIR || "uploads/job-photos"
  : process.env.RECEIPT_DIR || "uploads/expense-receipts");
function checked(name: string) {
  if (!SAFE_NAME.test(name)) throw new Error("Unsafe file name");
  return name;
}

export async function saveFile(bucket: Bucket, name: string, body: Buffer, contentType = "image/jpeg") {
  if (useBlob()) {
    await put(`${bucket}/${checked(name)}`, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
    return;
  }
  mkdirSync(folder(bucket), { recursive: true, mode: 0o700 });
  writeFileSync(join(folder(bucket), checked(name)), body, { mode: 0o600, flag: "wx" });
}

/** The file's bytes, or null if it's missing. */
export async function loadFile(bucket: Bucket, name: string): Promise<Buffer | null> {
  if (useBlob()) {
    const r = await get(`${bucket}/${checked(name)}`, { access: "private", useCache: false }).catch(() => null);
    if (!r || r.statusCode !== 200) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  const path = join(folder(bucket), checked(name));
  return existsSync(path) ? readFileSync(path) : null;
}

export async function deleteFile(bucket: Bucket, name: string) {
  if (useBlob()) { await del(`${bucket}/${checked(name)}`).catch(() => {}); return; }
  const path = join(folder(bucket), checked(name));
  if (existsSync(path)) unlinkSync(path);
}
