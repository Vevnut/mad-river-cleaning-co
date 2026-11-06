import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";

// Disposable database. Records saved through the app must get their dates from the code,
// because the Postgres tables have no default for them.
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("stays-setup").digest("hex");
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
async function call(method: string, path: string, body?: any) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
const isRecent = (s: unknown) => typeof s === "string" && Math.abs(Date.now() - Date.parse(s)) < 60000;

try {
  check("stays require sign-in", (await call("POST", "/api/stays", {})).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "stays@example.test", password: "Stays-test-only-123", setupToken: "stays-setup" })).body.token;
  const property = (await db.get("SELECT id, customer_id FROM properties ORDER BY id LIMIT 1"))!;
  const stay = { propertyId: property.id, guestName: "Test Guest", guestPhone: null, guestCount: 4, platform: "airbnb", checkInDate: "2026-12-01", checkOutDate: "2026-12-04", status: "confirmed", notes: null };
  const made = await call("POST", "/api/stays", stay);
  check("a new stay saves", made.status === 201 && made.body.guestName === "Test Guest");
  check("it gets today's date", isRecent(made.body.createdAt));
  const blank = await call("POST", "/api/stays", { propertyId: property.id, guestName: "Only Required", checkInDate: "2026-12-05", checkOutDate: "2026-12-06" });
  check("a stay with only the required fields saves", blank.status === 201);
  check("check-out must be after check-in", (await call("POST", "/api/stays", { ...stay, checkOutDate: "2026-11-30" })).status === 400);
  check("a stay can be edited", (await call("PATCH", `/api/stays/${made.body.id}`, { guestCount: 6 })).body.guestCount === 6);
  check("a stay can be deleted", (await call("DELETE", `/api/stays/${made.body.id}`)).status === 204);
  const customer = await call("POST", "/api/customers", { name: "Test Owner", customerType: "individual", email: "owner@example.test", phone: "603-555-0100", preferredContact: "email", billingAddressLine1: "1 Main St", billingCity: "Lincoln", billingState: "NH", billingZip: "03251" });
  check("a new customer gets today's date", customer.status === 201 && isRecent(customer.body.createdAt));
  const note = await call("POST", "/api/notes", { customerId: property.customer_id, body: "Test note" });
  check("a new note gets today's date", note.status === 201 && isRecent(note.body.createdAt));
  console.log(`${count} stay checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
