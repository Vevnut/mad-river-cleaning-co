import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";
import { mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";

// Disposable database and photo folder. Never touches real data or photos.
mkdirSync("tests/.data", { recursive: true });
process.env.PHOTO_DIR = "tests/.data/job-photos";
rmSync(process.env.PHOTO_DIR, { recursive: true, force: true });
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("photo-test-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || 500).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
const auth = () => ({ Authorization: `Bearer ${token}` });
async function call(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const r = await fetch(base + path, { method, headers, body });
  return { status: r.status, text: r.status === 204 ? "" : await r.text(), type: r.headers.get("content-type") };
}
function check(message: string, test: () => void = () => {}) { test(); count++; console.log(`PASS ${message}`); }
const jpeg = readFileSync("tests/fixtures/tiny.jpg");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
try {
  const jobId = ((await db.get("SELECT id FROM jobs ORDER BY id LIMIT 1")) as any).id;
  await check("photo routes require sign-in", async () => {});
  for (const [m, p] of [["GET", `/api/jobs/${jobId}/photos`], ["POST", `/api/jobs/${jobId}/photos?section=damage`], ["GET", "/api/job-photos/1/file"], ["DELETE", "/api/job-photos/1"]])
    assert.equal((await call(m, p, m === "POST" ? jpeg : undefined, { "Content-Type": "image/jpeg" })).status, 401, `${m} ${p}`);
  token = JSON.parse((await call("POST", "/api/auth/setup", JSON.stringify({ email: "photos@example.test", password: "Photo-test-only-123", setupToken: "photo-test-setup" }), { "Content-Type": "application/json" })).text).token;

  const up = async (section: string, body: Buffer, type = "image/jpeg", id = jobId) =>
    call("POST", `/api/jobs/${id}/photos?section=${section}&name=${encodeURIComponent("kitchen <b>crack</b>.jpg")}`, body, { ...auth(), "Content-Type": type });
  const d = await up("damage", jpeg);
  const damage = JSON.parse(d.text);
  await check("damage photo uploads", async () => { assert.equal(d.status, 201); assert.equal(damage.section, "damage"); assert.equal(damage.createdBy, "photos@example.test"); });
  await check("uploaded file names are sanitized", async () => assert(!/[<>]/.test(damage.originalName)));
  const w = await up("final_walkthrough", jpeg);
  await check("final walkthrough photo uploads", async () => assert.equal(w.status, 201));
  await check("unknown sections are rejected", async () => {});
  assert.equal((await up("before", jpeg)).status, 400);
  await check("non-JPEG bytes are rejected even when labelled as JPEG", async () => {});
  assert.equal((await up("damage", png)).status, 400);
  const html = await up("damage", Buffer.from("<script>alert(1)</script>"), "text/html");
  await check("non-image uploads are rejected", async () => assert.equal(html.status, 400));
  await check("photos for missing jobs are rejected", async () => {});
  assert.equal((await up("damage", jpeg, "image/jpeg", 999999)).status, 404);
  const list = JSON.parse((await call("GET", `/api/jobs/${jobId}/photos`, undefined, auth())).text);
  await check("photos list by section", async () => { assert.equal(list.length, 2); assert.deepEqual(list.map((p: any) => p.section).sort(), ["damage", "final_walkthrough"]); });
  await check("stored rows expose no server file paths", async () => assert(!JSON.stringify(list).includes(".jpg\"") || list.every((p: any) => !("fileName" in p))));
  const file = await call("GET", `/api/job-photos/${damage.id}/file`, undefined, auth());
  await check("photo file is served privately as JPEG", async () => assert.equal(file.type, "image/jpeg"));

  const patched = await call("PATCH", `/api/jobs/${jobId}`, JSON.stringify({ damageNotes: "Cracked tile by the sink" }), { ...auth(), "Content-Type": "application/json" });
  await check("damage notes save on the job", async () => assert.equal(JSON.parse(patched.text).damageNotes, "Cracked tile by the sink"));

  const blocked = await call("DELETE", `/api/jobs/${jobId}`, undefined, auth());
  await check("jobs with photos cannot be deleted by accident", async () => { assert.equal(blocked.status, 409); assert.match(blocked.text, /photo/); });

  const before = readdirSync(process.env.PHOTO_DIR!).length;
  assert.equal((await call("DELETE", `/api/job-photos/${damage.id}`, undefined, auth())).status, 204);
  await check("deleting a photo removes its record and file", async () => {
    assert.equal(readdirSync(process.env.PHOTO_DIR!).length, before - 1);
    assert.equal((await db.get("SELECT count(*) n FROM job_photos WHERE id=?", damage.id))!.n, 0);
  });
  await check("missing photos return 404", async () => {});
  assert.equal((await call("GET", `/api/job-photos/${damage.id}/file`, undefined, auth())).status, 404);
  await check("real preview photo folder untouched", async () => assert(!existsSync("uploads/job-photos") || readdirSync("uploads/job-photos").every(f => !readdirSync(process.env.PHOTO_DIR!).includes(f))));
  console.log(`${count} photo checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
