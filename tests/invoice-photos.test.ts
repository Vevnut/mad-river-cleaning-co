import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import express from "express";
import { startTestDatabase } from "./pg";

// Disposable database and photo folder. Never touches real data or photos.
mkdirSync("tests/.data", { recursive: true });
process.env.INVOICE_PHOTO_DIR = "tests/.data/invoice-photos";
rmSync(process.env.INVOICE_PHOTO_DIR, { recursive: true, force: true });
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("invoice-photo-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
const { LATEST_MIGRATION } = await import("../server/migrations");
const { MAX_INVOICE_PHOTOS } = await import("../server/invoice-photos");
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || 500).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
const auth = (): Record<string, string> => ({ Authorization: `Bearer ${token}` });
async function call(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const r = await fetch(base + path, { method, headers, body });
  const bytes = Buffer.from(await r.arrayBuffer());
  return { status: r.status, bytes, text: bytes.toString("utf8"), type: r.headers.get("content-type") };
}
const json = (m: string, p: string, b?: any) => call(m, p, b === undefined ? undefined : JSON.stringify(b), { ...auth(), "Content-Type": "application/json" });
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
const jpeg = readFileSync("tests/fixtures/tiny.jpg");
const upload = (id: number, body: Buffer, name = "kitchen <b>sink</b>.jpg", headers = auth()) =>
  call("POST", `/api/invoices/${id}/photos?name=${encodeURIComponent(name)}`, body, { ...headers, "Content-Type": "image/jpeg" });
const stored = () => readdirSync(process.env.INVOICE_PHOTO_DIR!).length;
// A real JPEG made large with comment segments.
function padded(kb: number) {
  const segment = Buffer.concat([Buffer.from([0xff, 0xfe, 0xff, 0xff]), Buffer.alloc(65533)]);
  return Buffer.concat([jpeg.subarray(0, 2), ...Array(Math.ceil(kb / 64)).fill(segment), jpeg.subarray(2)]);
}

try {
  const customerId = ((await db.get("SELECT id FROM customers ORDER BY id LIMIT 1")) as any).id;
  check("the database reaches the new migration", Number((await db.get("SELECT max(version) v FROM schema_migrations"))!.v) === LATEST_MIGRATION);

  for (const [m, p] of [["GET", "/api/invoices/1/photos"], ["GET", "/api/invoice-photos/1/file"], ["DELETE", "/api/invoice-photos/1"]])
    check(`${m} ${p} requires sign-in`, (await call(m, p)).status === 401);
  check("uploading requires sign-in", (await upload(1, jpeg, "x.jpg", {})).status === 401);
  token = JSON.parse((await call("POST", "/api/auth/setup", JSON.stringify({ email: "invoice-photos@example.test", password: "Photo-test-only-123", setupToken: "invoice-photo-setup" }), { "Content-Type": "application/json" })).text).token;

  const make = async () => JSON.parse((await json("POST", "/api/invoices", { customerId, issueDate: "2026-09-20", dueDate: "2026-10-05", items: [{ description: "Test clean", quantity: 1, unitPrice: 120 }] })).text);
  const a = await make(), b = await make();

  const plainPdf = (await json("GET", `/api/invoices/${a.id}/pdf`)).bytes.length;
  check("an invoice with no photos prints no photo section", !(await json("GET", `/api/invoices/${a.id}/print`)).text.includes('class="photos'));

  const up = await upload(a.id, jpeg);
  const photo = JSON.parse(up.text);
  check("a photo uploads", up.status === 201 && photo.invoiceId === a.id && photo.createdBy === "invoice-photos@example.test");
  check("file names are sanitized", !/[<>]/.test(photo.originalName));
  check("the list exposes no stored file name", !("fileName" in JSON.parse((await json("GET", `/api/invoices/${a.id}/photos`)).text)[0]));
  check("adding a photo is recorded in the invoice activity", JSON.parse((await json("GET", `/api/invoices/${a.id}/activity`)).text).some((h: any) => h.activityType === "photo_added"));
  check("non-JPEG bytes are refused", (await upload(a.id, Buffer.from("<script>alert(1)</script>".padEnd(100)))).status === 400);
  check("a missing invoice is refused", (await upload(999999, jpeg)).status === 404);
  check("a non-numeric invoice id is a clean 404", (await json("GET", "/api/invoices/abc/photos")).status === 404);
  check("a non-numeric photo id is a clean 404", (await json("GET", "/api/invoice-photos/abc/file")).status === 404);

  const file = await call("GET", `/api/invoice-photos/${photo.id}/file`, undefined, auth());
  check("the owner gets the same bytes back as a JPEG", file.status === 200 && file.type === "image/jpeg" && file.bytes.equals(jpeg));

  const html = (await json("GET", `/api/invoices/${a.id}/print`)).text;
  check("the printable invoice carries the photo", html.includes('class="photos') && html.includes(`data:image/jpeg;base64,${jpeg.toString("base64")}`));
  const pdf = await json("GET", `/api/invoices/${a.id}/pdf`);
  check("the PDF grows by carrying the photo", pdf.status === 200 && pdf.bytes.subarray(0, 4).toString() === "%PDF" && pdf.bytes.length > plainPdf);

  // Customers reach photos only through their own invoice link.
  // Links exist once an invoice is sent; set them directly since no email goes out here.
  const tokenA = "a".repeat(64), tokenB = "b".repeat(64);
  await db.run("UPDATE invoices SET public_token=?, public_enabled=1 WHERE id=?", tokenA, a.id);
  await db.run("UPDATE invoices SET public_token=?, public_enabled=1 WHERE id=?", tokenB, b.id);
  const pub = JSON.parse((await call("GET", `/api/public/invoices/${tokenA}`)).text);
  check("the customer's invoice lists the photo", pub.photos.length === 1 && pub.photos[0].id === photo.id);
  const seen = await call("GET", `/api/public/invoices/${tokenA}/photos/${photo.id}`);
  check("the customer can open the photo with no sign-in", seen.status === 200 && seen.bytes.equals(jpeg));
  check("another invoice's link can't open it", (await call("GET", `/api/public/invoices/${tokenB}/photos/${photo.id}`)).status === 404);
  check("a made-up link can't open it", (await call("GET", `/api/public/invoices/${"0".repeat(64)}/photos/${photo.id}`)).status === 404);
  const pdfPublic = await call("GET", `/api/public/invoices/${tokenA}/pdf`);
  check("the customer's PDF carries the photo", pdfPublic.status === 200 && pdfPublic.bytes.length > plainPdf);

  // Notes.
  const noted = await json("PATCH", `/api/invoice-photos/${photo.id}`, { note: "  Scratch by the <b>sink</b>  " });
  check("a photo can have a note", noted.status === 200 && JSON.parse(noted.text).note === "Scratch by the <b>sink</b>");
  check("notes need sign-in", (await call("PATCH", `/api/invoice-photos/${photo.id}`, JSON.stringify({ note: "x" }), { "Content-Type": "application/json" })).status === 401);
  check("very long notes are refused", (await json("PATCH", `/api/invoice-photos/${photo.id}`, { note: "x".repeat(201) })).status >= 400);
  check("the note is recorded in the invoice activity", JSON.parse((await json("GET", `/api/invoices/${a.id}/activity`)).text).some((h: any) => h.activityType === "photo_note_changed"));
  const notedHtml = (await json("GET", `/api/invoices/${a.id}/print`)).text;
  check("the printable invoice shows the note, safely", notedHtml.includes("<figcaption>Scratch by the &lt;b&gt;sink&lt;/b&gt;</figcaption>"));
  check("the customer's link carries the note", JSON.parse((await call("GET", `/api/public/invoices/${tokenA}`)).text).photos[0].note === "Scratch by the <b>sink</b>");
  check("the PDF still renders with a note", (await call("GET", `/api/public/invoices/${tokenA}/pdf`)).bytes.subarray(0, 4).toString() === "%PDF");
  await json("PATCH", `/api/invoice-photos/${photo.id}`, { note: "" });
  check("a note can be cleared", !(await json("GET", `/api/invoices/${a.id}/print`)).text.includes("<figcaption>"));

  // Limits.
  for (let i = 1; i < MAX_INVOICE_PHOTOS; i++) assert.equal((await upload(a.id, jpeg)).status, 201);
  const over = await upload(a.id, jpeg);
  check("a seventh photo is refused with a clear message", over.status === 400 && JSON.parse(over.text).message.includes("Remove one"));
  check("the padded fixture is still a real JPEG", (await upload(b.id, padded(64))).status === 201);
  check("one photo can't push an invoice past the size limit", (await upload(b.id, padded(3200))).status === 400);
  const filesBefore = stored();
  check("a refused photo leaves no file behind", (await upload(a.id, jpeg)).status === 400 && stored() === filesBefore);

  // Removing.
  const removeMe = JSON.parse((await upload(b.id, jpeg)).text);
  check("a photo can be removed", (await json("DELETE", `/api/invoice-photos/${removeMe.id}`)).status === 204);
  check("its file is gone too", (await json("GET", `/api/invoice-photos/${removeMe.id}/file`)).status === 404 && stored() === filesBefore);
  check("removing is recorded", JSON.parse((await json("GET", `/api/invoices/${b.id}/activity`)).text).some((h: any) => h.activityType === "photo_removed"));

  // Void invoices.
  const c = await make();
  const cPhoto = JSON.parse((await upload(c.id, jpeg)).text);
  assert.equal((await json("POST", `/api/invoices/${c.id}/void`, {})).status, 200);
  check("a void invoice can't gain photos", (await upload(c.id, jpeg)).status === 409);
  check("a void invoice's notes can't change", (await json("PATCH", `/api/invoice-photos/${cPhoto.id}`, { note: "x" })).status === 409);
  check("a void invoice can't lose photos", (await json("DELETE", `/api/invoice-photos/${cPhoto.id}`)).status === 409);

  // Deleting the invoice keeps a restorable copy.
  const del = await json("POST", `/api/invoices/${a.id}/delete`, { confirmInvoiceNumber: a.invoiceNumber, understood: true });
  check("an invoice with photos can be deleted", del.status === 200);
  const snapshot = JSON.parse(((await db.get("SELECT snapshot FROM deleted_invoices WHERE invoice_id=?", a.id)) as any).snapshot);
  check("the saved copy lists its photos", snapshot.photos.length === MAX_INVOICE_PHOTOS);
  check("the photo files are kept for that copy", stored() === filesBefore + 1);
  check("the deleted invoice's link no longer opens photos", (await call("GET", `/api/public/invoices/${tokenA}/photos/${photo.id}`)).status === 404);

  console.log(`${count} invoice-photo checks passed.`);
} finally {
  server.close();
  await testDb.stop();
  rmSync(process.env.INVOICE_PHOTO_DIR!, { recursive: true, force: true });
}
