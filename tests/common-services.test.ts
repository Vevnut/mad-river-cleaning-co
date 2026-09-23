import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

// Dedicated disposable database. No external providers and no live writes.
mkdirSync("tests/.data", { recursive: true });
process.env.DATABASE_PATH = "tests/.data/common-services.db";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("common-jobs-test-setup").digest("hex");
const original = new Database("data.db", { readonly: true });
const originalInvoices = original.prepare("SELECT * FROM invoices ORDER BY id").all();
await original.backup(process.env.DATABASE_PATH);
original.close();
const { registerRoutes } = await import("../server/routes");
const { sqlite: db } = await import("../server/storage");
// Reset access only in this disposable QA copy.
db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err.status || (err.name === "ZodError" ? 400 : 500)).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
async function api(method: string, path: string, data?: any, expected = 200, auth = true) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const text = await r.text(); assert.equal(r.status, expected, `${path}: ${text}`); return JSON.parse(text);
}
function check(message: string, test: () => void = () => {}) { test(); count++; console.log(`PASS ${message}`); }
try {
  await api("POST", "/api/properties/1/common-services", {}, 401, false);
  check("new common-job route requires authentication");
  token = (await api("POST", "/api/auth/setup", { email: "common-jobs@example.test", password: "Common-jobs-test-only", setupToken: "common-jobs-test-setup" }, 200, false)).token;
  const [p, p2] = await api("GET", "/api/properties");
  const payload = { customName: "QA common trash run", customPrice: 25, customDescription: "Collect trash", category: "Trash",
    invoiceBehavior: "suggested", internalNotes: "Private bin instructions" };
  const service = await api("POST", `/api/properties/${p.id}/common-services`, payload, 201);
  const catalog = (await api("GET", "/api/services")).find((c: any) => c.id === service.serviceId);
  check("creating from a property saves both library and property service", () => {
    assert.equal(catalog.name, payload.customName); assert.equal(catalog.category, "Trash"); assert.equal(service.customPrice, 25);
    assert.equal(service.internalNotes, payload.internalNotes); assert(!JSON.stringify(catalog).includes(payload.internalNotes));
  });
  await api("POST", `/api/properties/${p.id}/common-services`, payload, 409);
  await api("POST", `/api/properties/${p.id}/common-services`, { ...payload, customName: "  qa COMMON trash run " }, 409);
  check("repeated saves and case-variant names cannot duplicate common jobs");
  await api("POST", `/api/properties/${p.id}/services`, { ...payload, serviceId: catalog.id }, 409);
  check("same common job cannot be added twice to one property");
  const second = await api("POST", `/api/properties/${p2.id}/services`, { ...payload, serviceId: catalog.id, customPrice: 35 });
  await api("PATCH", `/api/properties/${p.id}/services/${service.id}`, { ...service, customPrice: 30 });
  check("property price overrides do not change library or another property", () => {
    assert.equal(db.prepare("SELECT default_price price FROM service_catalog WHERE id=?").get(catalog.id).price, 25);
    assert.equal(db.prepare("SELECT custom_price price FROM property_services WHERE id=?").get(second.id).price, 35);
  });
  const before = db.prepare("SELECT count(*) n FROM service_catalog").get().n;
  await api("POST", `/api/properties/${p.id}/common-services`, { ...payload, customName: "Invalid negative", customPrice: -1 }, 400);
  await api("POST", `/api/properties/${p.id}/common-services`, { ...payload, customName: "Invalid exclusion", excludesPropertyServiceId: second.id }, 400);
  await api("POST", "/api/properties/999999/common-services", { ...payload, customName: "Missing property" }, 404);
  check("invalid prices, missing properties, and cross-property exclusions leave no catalog entry", () => {
    assert.equal(db.prepare("SELECT count(*) n FROM service_catalog").get().n, before);
  });
  await api("PATCH", `/api/properties/${p.id}/services/${second.id}`, second, 404);
  check("property service edits reject mismatched property IDs");
  const local = await api("POST", `/api/properties/${p.id}/services`, { ...payload, customName: "Property-only special task" });
  check("property-only special tasks remain outside shared library", () => {
    assert.equal(local.serviceId, null); assert.equal(db.prepare("SELECT count(*) n FROM service_catalog").get().n, before);
  });
  await api("PATCH", `/api/services/${catalog.id}`, { active: false });
  await api("POST", `/api/properties/${p2.id}/services`, { ...payload, serviceId: catalog.id }, 400);
  await api("PATCH", `/api/services/${catalog.id}`, { active: true });
  check("inactive common jobs cannot be newly assigned");
  const preserved = (await api("GET", "/api/services")).find((c: any) => c.id === catalog.id);
  check("partial catalog edits preserve category, price, and invoice behavior", () => {
    assert.equal(preserved.category, "Trash"); assert.equal(preserved.defaultPrice, 25);
    assert.equal(preserved.defaultInclusionBehavior, "suggested");
  });
  const defaults = await api("GET", `/api/properties/${p.id}/invoice-defaults?rateType=custom`);
  check("suggested common jobs stay optional rather than automatically charged", () => {
    assert(!defaults.items.some((i: any) => i.sourcePropertyServiceId === service.id));
    assert(defaults.services.some((s: any) => s.id === service.id));
  });
  await api("PATCH", `/api/properties/${p.id}/services/${service.id}`, { ...service, customPrice: 30, invoiceBehavior: "auto_include" });
  const auto = await api("GET", `/api/properties/${p.id}/invoice-defaults?rateType=custom`);
  check("automatic behavior includes the property-specific price exactly once", () => {
    const lines = auto.items.filter((i: any) => i.sourcePropertyServiceId === service.id);
    assert.equal(lines.length, 1); assert.equal(lines[0].unitPrice, 30);
  });
  check("existing invoice records remain unchanged", () => assert.deepEqual(db.prepare("SELECT * FROM invoices ORDER BY id").all(), originalInvoices));
  console.log(`${count} common-job checks passed.`);
} finally { server.close(); db.close(); }
