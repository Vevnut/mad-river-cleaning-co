import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { startTestDatabase } from "./pg";

// Disposable database: deep-cleaning and hot tub tracking, and the supplies inventory.
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("upkeep-setup").digest("hex");
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { db } = await import("../server/db");
const { LATEST_MIGRATION } = await import("../server/migrations");
const { DEEP_CLEAN_TASKS, upkeepState, daysBetween } = await import("../shared/upkeep");
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

try {
  check("the database reaches the new migration", Number((await db.get("SELECT max(version) v FROM schema_migrations"))!.v) === LATEST_MIGRATION);
  check("due dates: 30 days is due, 23 is due soon, 5 is fine, never is flagged",
    upkeepState("2026-10-01", "2026-10-31") === "due" && upkeepState("2026-10-01", "2026-10-24") === "soon" && upkeepState("2026-10-01", "2026-10-06") === "ok" && upkeepState(null, "2026-10-06") === "never");
  check("day counts cross months", daysBetween("2026-10-31", "2026-11-02") === 2);

  for (const [m, p] of [["GET", "/api/upkeep"], ["GET", "/api/properties/1/upkeep"], ["POST", "/api/properties/1/upkeep"], ["GET", "/api/supplies"], ["POST", "/api/supplies"]])
    check(`${m} ${p} requires sign-in`, (await call(m, p, m === "POST" ? {} : undefined)).status === 401);
  token = (await call("POST", "/api/auth/setup", { email: "upkeep@example.test", password: "Upkeep-test-only-123", setupToken: "upkeep-setup" })).body.token;
  const [a, b] = (await db.all("SELECT id FROM properties ORDER BY id LIMIT 2")).map(r => Number(r.id));

  // ---- deep cleaning ----
  let up = (await call("GET", `/api/properties/${a}/upkeep`)).body;
  check("a property starts with nothing logged and no hot tub", up.hasHotTub === false && !Object.keys(up.lastDone).length && !up.history.length);
  check("ticked tasks are logged", (await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["mop", "vents"], doneOn: "2026-10-01" })).status === 201);
  await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["mop"], doneOn: "2026-10-20" });
  await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["mop"], doneOn: "2026-09-15" });
  up = (await call("GET", `/api/properties/${a}/upkeep`)).body;
  check("last done is the latest date, even when an older one is logged after", up.lastDone.mop === "2026-10-20" && up.lastDone.vents === "2026-10-01");
  check("history lists newest first", up.history.length === 4 && up.history[0].doneOn === "2026-10-20");
  check("who logged it is recorded", up.history[0].createdBy === "upkeep@example.test");
  const dup = await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["closets", "closets"], doneOn: "2026-10-02" });
  check("a task ticked twice is logged once", dup.status === 201 && Number((await db.get("SELECT count(*) n FROM upkeep_log WHERE task='closets'"))!.n) === 1);
  check("an unknown task is refused", (await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["windows"], doneOn: "2026-10-02" })).status === 400);
  check("no tasks is refused", (await call("POST", `/api/properties/${a}/upkeep`, { tasks: [], doneOn: "2026-10-02" })).status === 400);
  check("a bad date is refused", (await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["mop"], doneOn: "2026-02-30" })).status === 400);
  check("a missing property is 404", (await call("POST", `/api/properties/999999/upkeep`, { tasks: ["mop"], doneOn: "2026-10-02" })).status === 404);
  const latestMop = up.history[0].id;
  check("a wrong entry can be removed", (await call("DELETE", `/api/upkeep-log/${latestMop}`)).status === 204);
  check("removing it brings back the previous date", (await call("GET", `/api/properties/${a}/upkeep`)).body.lastDone.mop === "2026-10-01");
  check("removing it twice is 404", (await call("DELETE", `/api/upkeep-log/${latestMop}`)).status === 404);
  const all = await call("POST", `/api/properties/${b}/upkeep`, { tasks: DEEP_CLEAN_TASKS.map(t => t.key), doneOn: "2026-11-01" });
  check("a full deep clean logs every task at once", all.status === 201 && Object.keys((await call("GET", `/api/properties/${b}/upkeep`)).body.lastDone).length === DEEP_CLEAN_TASKS.length);

  // ---- hot tub ----
  check("a drain can't be logged before the property has a hot tub", (await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["hot_tub_drain"], doneOn: "2026-10-05" })).status === 400);
  check("the hot tub can be switched on", (await call("PUT", `/api/properties/${a}/hot-tub`, { hasHotTub: true })).body.hasHotTub === true);
  check("then the drain is logged", (await call("POST", `/api/properties/${a}/upkeep`, { tasks: ["hot_tub_drain"], doneOn: "2026-10-05" })).status === 201);
  const overview = (await call("GET", "/api/upkeep")).body;
  const rowA = overview.find((r: any) => r.propertyId === a);
  check("the overview shows each property's hot tub and last dates", rowA.hasHotTub === true && rowA.lastDone.hot_tub_drain === "2026-10-05" && rowA.lastDone.mop === "2026-10-01");
  check("the hot tub switch needs a yes or no", (await call("PUT", `/api/properties/${a}/hot-tub`, { hasHotTub: "yes" })).status === 400);
  check("editing the property keeps the hot tub setting", (await call("PATCH", `/api/properties/${a}`, { name: "Renamed for test" })).status === 200
    && (await call("GET", `/api/properties/${a}/upkeep`)).body.hasHotTub === true);

  // ---- supplies ----
  const towels = await call("POST", "/api/supplies", { name: "  Paper towels ", quantity: 6, unit: "rolls", reorderAt: 4 });
  check("an item is added to our stock", towels.status === 201 && towels.body.name === "Paper towels" && towels.body.propertyId === null && towels.body.low === false);
  const soap = await call("POST", "/api/supplies", { name: "Hand soap", propertyId: a, quantity: 1, reorderAt: 2 });
  check("an item can be kept at a property, and shows low", soap.status === 201 && soap.body.propertyName === "Renamed for test" && soap.body.low === true);
  check("an item needs a name", (await call("POST", "/api/supplies", { name: " " })).status === 400);
  check("counts can't be negative", (await call("POST", "/api/supplies", { name: "X", quantity: -1 })).status === 400);
  check("an unknown property is refused", (await call("POST", "/api/supplies", { name: "X", propertyId: 999999 })).status === 400);
  let t = (await call("POST", `/api/supplies/${towels.body.id}/adjust`, { delta: -1 })).body;
  t = (await call("POST", `/api/supplies/${towels.body.id}/adjust`, { delta: -1 })).body;
  check("- takes one away, and at the reorder level it shows low", t.quantity === 4 && t.low === true);
  t = (await call("POST", `/api/supplies/${towels.body.id}/adjust`, { delta: -10 })).body;
  check("counts stop at zero", t.quantity === 0);
  t = (await call("POST", `/api/supplies/${towels.body.id}/adjust`, { delta: 0.5 })).body;
  check("+ adds, including part units", t.quantity === 0.5);
  check("adjusting a missing item is 404", (await call("POST", "/api/supplies/999999/adjust", { delta: 1 })).status === 404);
  const edited = await call("PATCH", `/api/supplies/${soap.body.id}`, { name: "Hand soap", propertyId: null, quantity: 10, reorderAt: null, notes: "Reimbursed by owner" });
  check("an item can be edited and moved to our stock", edited.body.propertyId === null && edited.body.quantity === 10 && edited.body.low === false && edited.body.notes === "Reimbursed by owner");
  check("the list returns every item", (await call("GET", "/api/supplies")).body.length === 2);
  check("an item can be removed", (await call("DELETE", `/api/supplies/${towels.body.id}`)).status === 204 && (await call("GET", "/api/supplies")).body.length === 1);

  // ---- deleting a property with no jobs: its log goes with it, its supplies stay ----
  const bareId = await db.insertId(`INSERT INTO properties (customer_id,name,address_line1,city,state,zip,unit_type,bedrooms,bathrooms,max_occupancy,check_in_time,check_out_time,entry_instructions,cleaning_frequency,base_price)
    SELECT customer_id,'Temp','1 Test Rd','Lincoln','NH','03251','house',1,1,2,'16:00','10:00','Test','as_needed',0 FROM properties WHERE id=?`, a);
  await call("POST", `/api/properties/${bareId}/upkeep`, { tasks: ["mop"], doneOn: "2026-10-01" });
  const kept = await call("POST", "/api/supplies", { name: "Trash bags", propertyId: bareId, quantity: 3 });
  check("deleting the property works", (await call("DELETE", `/api/properties/${bareId}`)).status === 204);
  check("its deep-cleaning log is gone", Number((await db.get("SELECT count(*) n FROM upkeep_log WHERE property_id=?", bareId))!.n) === 0);
  check("its supplies move to our stock", (await call("GET", "/api/supplies")).body.find((s: any) => s.id === kept.body.id)?.propertyId === null);
  console.log(`${count} upkeep checks passed.`);
} finally {
  server.close();
  await testDb.stop();
}
