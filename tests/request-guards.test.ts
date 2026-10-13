import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { errorHandler } from "../server/errors";

// Disposable copy of the database. Never touches real data.
mkdirSync("tests/.data", { recursive: true });
process.env.DATABASE_PATH = "tests/.data/request-guards.db";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("guards-test-setup").digest("hex");
const original = new Database("data.db", { readonly: true });
await original.backup(process.env.DATABASE_PATH);
original.close();
const { registerRoutes } = await import("../server/routes");
const { sqlite: db } = await import("../server/storage");
db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.set("trust proxy", 1); // same as server/index.ts behind the host's proxy
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.get("/test/crash-500", () => { throw Object.assign(new Error("SQLITE_IOERR at /srv/data.db secret_path"), { status: 500 }); });
app.get("/test/crash", () => { throw new TypeError("Cannot read properties of undefined (reading 'secret_column')"); });
app.use(errorHandler); // the real handler from server/index.ts
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
async function call(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const r = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }
const email = "guards@example.test", password = "Guards-test-only-123";
const login = (from: string, pw = password, who = email) => call("POST", "/api/auth/login", { email: who, password: pw }, { "X-Forwarded-For": from });

try {
  token = (await call("POST", "/api/auth/setup", { email, password, setupToken: "guards-test-setup" })).body.token;
  check("setup signs in", !!token);

  // Requests with no body used to crash the property/job checks with a 500.
  check("adding a property with no body is a 400, not a crash", (await call("POST", "/api/properties")).status === 400);
  check("adding a job with no body is a 400, not a crash", (await call("POST", "/api/jobs")).status === 400);

  // Unexpected crashes don't show internal details; known database conflicts get a clear message.
  const crash = await call("GET", "/test/crash");
  check("a crash returns a plain message without internal details", crash.status === 500 && !crash.body.message.includes("secret_column"));
  const crash500 = await call("GET", "/test/crash-500");
  check("a server error with a status still hides internal details", crash500.status === 500 && !crash500.body.message.includes("secret_path"));
  const dupe = await call("POST", "/api/team", { email, password });
  check("adding an account that exists says so", dupe.status === 409 && dupe.body.message === "An account with this email already exists.");

  // "$'" and "$&" in a property name used to splice extra HTML into the printed invoice.
  const p = db.prepare("SELECT id, customer_id FROM properties ORDER BY id LIMIT 1").get() as any;
  db.prepare("UPDATE properties SET name=? WHERE id=?").run("Cabin $' Lodge", p.id);
  const inv = (await call("POST", "/api/invoices", { customerId: p.customer_id, propertyId: p.id, issueDate: "2026-09-20", dueDate: "2026-10-05",
    items: [{ description: "Test clean", quantity: 1, unitPrice: 120 }] })).body;
  const print = await fetch(`${base}/api/invoices/${inv.id}/print`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text());
  check("a property name with $ prints exactly as typed", print.includes("Cabin $&#39; Lodge") && !print.includes("Cabin <table>"));
  token = "";

  // Behind the proxy each visitor gets their own sign-in limit.
  for (let i = 0; i < 20; i++) await login("203.0.113.1", "wrong-password-123", `nobody${i}@example.test`);
  check("one visitor is limited after 20 tries", (await login("203.0.113.1")).status === 429);
  check("another visitor can still sign in", (await login("203.0.113.2")).status === 200);

  // Spreading guesses across many addresses still stops at the per-account limit.
  db.exec("DELETE FROM auth_rate_limits");
  for (let i = 0; i < 50; i++) assert.equal((await login(`198.51.100.${i}`, "wrong-password-123")).status, 401);
  check("guessing one account from many addresses is limited", (await login("198.51.100.200")).status === 429);
  check("other accounts are not affected", (await login("198.51.100.201", "wrong-password-123", "other@example.test")).status === 401);
  console.log(`${count} request-guard checks passed.`);
} finally {
  server.close();
  db.close();
}
