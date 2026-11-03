import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Stripe from "stripe";
import { startTestDatabase } from "./pg";
process.env.AUTH_SETUP_TOKEN = "test-provider-setup";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update(process.env.AUTH_SETUP_TOKEN).digest("hex");
process.env.STRIPE_SECRET_KEY = "sk_test_NOT_A_REAL_KEY";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_offline_test";
process.env.RESEND_API_KEY = "offline_test";
process.env.INVOICE_FROM_EMAIL = "billing@example.test";
process.env.PUBLIC_APP_URL = "https://example.test";
const testDb = await startTestDatabase();
const { registerRoutes } = await import("../server/routes");
const { billingProviders } = await import("../server/billing");
const { db } = await import("../server/db");
// Account setup must be isolated from any users in the copied source database.
await db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json({ verify: (req: any, _, buffer) => { req.rawBody = buffer; } }));
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || (err.name === "ZodError" ? 400 : 500)).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0, sends = 0, sessionCreates = 0;
const check = (s: string, fn: () => void = () => {}) => { fn(); count++; console.log(`PASS ${s}`); };
async function api(method: string, path: string, data?: any, expected = 200, auth = true, extraHeaders: any = {}) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body: data ? (typeof data === "string" ? data : JSON.stringify(data)) : undefined });
  const text = await r.text(); assert.equal(r.status, expected, text); return text ? JSON.parse(text) : null;
}
const real = new Stripe("sk_test_NOT_A_REAL_KEY");
const sessions = new Map<string, any>();
billingProviders.stripeClient = () => ({
  webhooks: real.webhooks,
  checkout: { sessions: {
    create: async (params: any, opts: any) => {
      sessionCreates++;
      let s = sessions.get(opts.idempotencyKey);
      if (!s) {
        s = { id: "cs_test_" + randomUUID(), url: "https://checkout.stripe.com/test", status: "open", payment_status: "unpaid", currency: "usd", amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata, payment_intent: "pi_test_" + randomUUID() };
        sessions.set(opts.idempotencyKey, s);
      }
      assert.equal(params.payment_method_types[0], "card");
      return s;
    },
    retrieve: async (id: string) => Array.from(sessions.values()).find(s => s.id === id),
    expire: async (id: string) => { const s = Array.from(sessions.values()).find(s => s.id === id); s.status = "expired"; return s; },
    list: async () => ({ data: Array.from(sessions.values()) }),
  } },
}) as any;
let lastEmail: any;
billingProviders.sendEmail = async (payload: string) => { sends++; lastEmail = JSON.parse(payload); return new Response(JSON.stringify({ id: "email_offline_test" }), { status: 200 }); };
await api("POST", "/api/auth/setup", { email: "provider@example.test", password: "Offline-test-password", setupToken: "wrong-code" }, 403, false);
token = (await api("POST", "/api/auth/setup", { email: "provider@example.test", password: "Offline-test-password", setupToken: "test-provider-setup" }, 200, false)).token;
await check("first-account setup accepts only the configured bootstrap digest");
const p = (await api("GET", "/api/properties"))[0];
const create = () => api("POST", "/api/invoices", { customerId: p.customerId, propertyId: p.id, issueDate: "2026-09-22", dueDate: "2026-10-07", rateType: "standard", requestKey: randomUUID() }, 201);
const inv = await create();
const send = { recipient: "owner@example.test", subject: "Review invoice", message: "Thanks <script>alert(1)</script>", requestKey: randomUUID() };
await api("POST", `/api/invoices/${inv.id}/send`, send);
await api("POST", `/api/invoices/${inv.id}/send`, send);
await check("send retries dispatch once and track sent time", async () => { assert.equal(sends, 1); assert((await db.get("SELECT sent_at FROM invoices WHERE id=?", inv.id)).sent_at); });
await check("email has hosted payment link and safely escaped message", async () => { assert(lastEmail.html.includes("View &amp; Pay") || lastEmail.html.includes("View & Pay")); assert(!lastEmail.html.includes("<script>")); assert(lastEmail.html.includes("/#/pay/")); });
const tokenPublic = (await db.get("SELECT public_token FROM invoices WHERE id=?", inv.id)).public_token;
const link = `/api/public/invoices/${tokenPublic}`;
await api("POST", `${link}/checkout`, {}, 200, false);
await api("POST", `${link}/checkout`, {}, 200, false);
await check("repeated checkout reuses a single reservation/session", async () => assert.equal(sessionCreates, 1));
await api("POST", "/api/payments", { invoiceId: inv.id, amount: 1, method: "cash", paidDate: "2026-09-22", requestKey: randomUUID() }, 409);
await api("PATCH", `/api/invoices/${inv.id}`, { notes: "Changed" }, 409);
await check("active checkout locks manual payment and invoice edits");
const s = Array.from(sessions.values())[0];
s.status = "complete"; s.payment_status = "paid";
const event = { id: "evt_offline_" + randomUUID(), object: "event", type: "checkout.session.completed", data: { object: s } };
const body = JSON.stringify(event);
const signature = real.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET! });
await api("POST", "/api/stripe/webhook", body, 400, false, { "Stripe-Signature": "invalid" });
await check("bad webhook signature is rejected");
const wrongBody = JSON.stringify({ ...event, data: { object: { ...s, amount_total: 1 } } });
await api("POST", "/api/stripe/webhook", wrongBody, 400, false, { "Stripe-Signature": real.webhooks.generateTestHeaderString({ payload: wrongBody, secret: process.env.STRIPE_WEBHOOK_SECRET! }) });
await check("signed event with wrong amount is rejected");
await api("POST", "/api/stripe/webhook", body, 200, false, { "Stripe-Signature": signature });
await api("POST", "/api/stripe/webhook", body, 200, false, { "Stripe-Signature": signature });
const secondBody = JSON.stringify({ ...event, id: "evt_second_" + randomUUID() });
await api("POST", "/api/stripe/webhook", secondBody, 200, false, { "Stripe-Signature": real.webhooks.generateTestHeaderString({ payload: secondBody, secret: process.env.STRIPE_WEBHOOK_SECRET! }) });
const paid = await api("GET", `/api/invoices/${inv.id}`);
await check("verified webhook settles balance and deduplicates event/transaction", async () => { assert.equal(paid.balanceDue, 0); assert.equal(paid.status, "paid"); assert.equal((await db.get("SELECT COUNT(*) n FROM payments WHERE invoice_id=?", inv.id)).n, 1); });
const inv2 = await create();
await api("POST", "/api/payments", { invoiceId: inv2.id, amount: 25, method: "cash", paidDate: "2026-09-22", requestKey: randomUUID() }, 201);
await api("POST", `/api/invoices/${inv2.id}/send`, { ...send, requestKey: randomUUID() });
const token2 = (await db.get("SELECT public_token FROM invoices WHERE id=?", inv2.id)).public_token;
await api("POST", `/api/public/invoices/${token2}/checkout`, {}, 200, false);
await check("checkout collects outstanding balance, not original total", async () => assert.equal(Array.from(sessions.values())[1].amount_total, Math.round((inv2.total - 25) * 100)));
await api("POST", `/api/invoices/${inv2.id}/cancel-checkout`, {});
await api("POST", "/api/payments", { invoiceId: inv2.id, amount: inv2.total - 25, method: "check", paidDate: "2026-09-22", requestKey: randomUUID() }, 201);
await check("expiration confirmation unlocks offline settlement");
const retryInv = await create();
const retrySend = { ...send, requestKey: randomUUID() };
billingProviders.sendEmail = async () => { throw new Error("Simulated connection loss"); };
await api("POST", `/api/invoices/${retryInv.id}/send`, retrySend, 502);
const recovered = await api("GET", `/api/invoices/${retryInv.id}/pending-send`);
await check("uncertain email review can be recovered after refresh", async () => assert.deepEqual(recovered, retrySend));
await api("PATCH", `/api/invoices/${retryInv.id}`, { notes: "Would change the reviewed payload" }, 409);
billingProviders.sendEmail = async () => new Response(JSON.stringify({ id: "recovered_email" }), { status: 200 });
await api("POST", `/api/invoices/${retryInv.id}/send`, recovered);
await check("same-key retry clears pending send and records one sent activity", async () => {
  assert.equal((await db.get("SELECT COUNT(*) n FROM invoice_activity WHERE invoice_id=? AND activity_type='sent'", retryInv.id)).n, 1);
  assert.equal((await db.get("SELECT status FROM invoice_sends WHERE request_key=?", retrySend.requestKey)).status, "sent");
});
// Simulate a valid session issued for a DIFFERENT organization. Database scope
// checks must deny it, even if someone accidentally imports a foreign user row.
const uid = (await db.get("SELECT id FROM auth_users LIMIT 1")).id;
db.pragma("foreign_keys=OFF"); (await db.run("UPDATE auth_users SET organization_id='foreign-business' WHERE id=?", uid)); db.pragma("foreign_keys=ON");
await api("GET", "/api/customers", undefined, 401);
await api("GET", `/api/invoices/${inv.id}`, undefined, 401);
await check("foreign-organization session cannot read workspace records");
for (let n = 0; n < 20; n++) await api("POST", "/api/auth/login", { email: "invalid" }, 400, false);
await api("POST", "/api/auth/login", { email: "invalid" }, 429, false);
await check("failed-login throttling persists in the database", async () => {
  assert.equal((await db.get("SELECT MAX(count) n FROM auth_rate_limits")).n, 21);
});
console.log(`\n${count} offline provider/auth checks passed. Stripe signature library is real; all Checkout/email provider calls are mocked. No live transactions or email.`);
await new Promise<void>(r => server.close(() => r())); db.close();
