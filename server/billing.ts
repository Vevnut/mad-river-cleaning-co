import type { Express } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { sqlite as sql } from "./storage";
import { organizationId } from "./auth";
import { renderInvoicePrintHtml } from "./invoice-print-template";

const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const snake = (s: string) => s.replace(/[A-Z]/g, c => "_" + c.toLowerCase());
export const camel = (row: any): any => row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
const rows = (table: string, where = "1=1", ...args: any[]) => sql.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(...args).map(camel);
const one = (table: string, id: any) => { const r = rows(table, "id=?", id)[0]; if (!r) fail(404, "Record not found"); return r; };
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
function insert(table: string, data: any) {
  const keys = Object.keys(data).filter(k => data[k] !== undefined);
  const info = sql.prepare(`INSERT INTO ${table} (${keys.map(snake).join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .run(...keys.map(k => typeof data[k] === "boolean" ? Number(data[k]) : data[k]));
  return Number(info.lastInsertRowid);
}
function update(table: string, id: any, data: any) {
  const keys = Object.keys(data).filter(k => data[k] !== undefined);
  if (keys.length) sql.prepare(`UPDATE ${table} SET ${keys.map(k => snake(k) + "=?").join(",")} WHERE id=?`)
    .run(...keys.map(k => typeof data[k] === "boolean" ? Number(data[k]) : data[k]), id);
}
const money = z.number().finite().min(0).max(10000000);
const qty = z.number().finite().positive().max(100000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Invalid date");
const rate = z.enum(["standard", "owner", "custom"]);
const behavior = z.enum(["auto_include", "suggested", "manual"]);
const cents = (v: number) => Math.round((v + Number.EPSILON) * 100);
const dollars = (v: number) => v / 100;
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function activity(id: number, type: string, details: any, actor = "Workspace user") {
  insert("invoice_activity", { invoiceId: id, activityType: type, actor, details: JSON.stringify(details), createdAt: now() });
}
export function invoice(id: number) {
  const v = one("invoices", id);
  const balance = cents(v.total) - cents(v.amountPaid);
  if (v.status !== "canceled") {
    if (balance <= 0 && v.total > 0) v.status = "paid";
    else if (v.amountPaid > 0) v.status = "partial";
    else if (v.status !== "draft") v.status = v.dueDate < today() ? "overdue" : v.viewedAt ? "viewed" : "sent";
  }
  return { ...v, balanceDue: dollars(balance) };
}
const serviceSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().max(4000).default(""),
  category: z.enum(["Cleaning", "Hot tub", "Grill", "Trash", "Laundry", "Restocking", "Maintenance", "Damage/extra cleaning", "Other"]).default("Other"),
  defaultPrice: money, defaultQuantity: qty.default(1), unit: z.string().max(60).default("service"),
  active: z.coerce.boolean().default(true), defaultInclusionBehavior: behavior.default("suggested"),
  taxable: z.coerce.boolean().default(false), sortOrder: z.number().int().default(0),
});
const propertyServiceSchema = z.object({
  serviceId: z.number().int().positive().nullable().default(null), customName: z.string().trim().min(1).max(200),
  customDescription: z.string().max(4000).default(""), customPrice: money, defaultQuantity: qty.default(1),
  enabled: z.coerce.boolean().default(true), invoiceBehavior: behavior.default("suggested"), internalNotes: z.string().max(4000).default(""),
  excludesPropertyServiceId: z.number().int().positive().nullable().default(null),
});
export function defaults(propertyId: number, rateType: string = "standard") {
  rate.parse(rateType);
  const p = one("properties", propertyId);
  const services = rows("property_services", "property_id=? AND enabled=1", propertyId);
  const price = rateType === "standard" ? p.standardDepartureRate : rateType === "owner" ? p.ownerRate : null;
  const items: any[] = [];
  if (price != null) items.push({
    description: (rateType === "owner" ? p.ownerRateName : p.standardDepartureRateName) || "Property Base Service",
    quantity: 1, unitPrice: price, itemType: "service", isAutoAdded: true,
    lineItemType: rateType === "owner" ? "owner_rate" : "standard_rate", sourcePropertyServiceId: null,
  });
  const serviceItem = (s: any) => ({
    description: s.customName, descriptionSnapshot: s.customDescription, quantity: s.defaultQuantity,
    unitPrice: s.customPrice, itemType: "addon", lineItemType: "add_on", isAutoAdded: s.invoiceBehavior === "auto_include",
    sourcePropertyServiceId: s.id, excludesPropertyServiceId: s.excludesPropertyServiceId,
  });
  const auto = services.filter(s => s.invoiceBehavior === "auto_include");
  const excluded = new Set(auto.map(s => s.excludesPropertyServiceId).filter(Boolean));
  items.push(...auto.filter(s => !excluded.has(s.id)).map(serviceItem));
  return { property: p, customerId: p.customerId, notes: p.invoiceNotes || "", rateType, items,
    services: services.map(s => ({ ...s, item: serviceItem(s) })) };
}
const itemSchema = z.object({
  description: z.string().trim().min(1).max(500), descriptionSnapshot: z.string().max(4000).nullable().optional(),
  itemType: z.enum(["service", "labor", "supplies", "addon", "fee", "discount"]).default("service"),
  quantity: qty, unitPrice: money, sourcePropertyServiceId: z.number().int().positive().nullable().optional(),
  isAutoAdded: z.coerce.boolean().default(false), lineItemType: z.enum(["standard_rate", "owner_rate", "add_on", "manual"]).default("manual"),
});
const invoiceSchema = z.object({
  customerId: z.number().int().positive(), propertyId: z.number().int().positive().nullable().default(null),
  jobId: z.number().int().positive().nullable().default(null), invoiceNumber: z.string().trim().min(1).max(80).optional(),
  issueDate: date, dueDate: date, rateType: rate.default("custom"),
  notes: z.string().max(10000).nullable().default(""), internalNotes: z.string().max(10000).nullable().default(""),
  discountAmount: money.default(0), travelFee: money.default(0), rushFee: money.default(0),
  items: z.array(itemSchema).max(200).optional(), requestKey: z.string().uuid().optional(),
});
function assertUnlocked(id: number) {
  if (rows("checkout_sessions", "invoice_id=? AND status IN ('creating','open')", id).length)
    fail(409, "An online checkout is active. Cancel/reconcile checkout before changing this invoice or recording a manual payment.");
  if (rows("invoice_sends", "invoice_id=? AND status='pending'", id).length)
    fail(409, "An invoice email is pending. Retry that exact send before editing.");
}
export function saveInvoice(input: any, id?: number, actor?: string) {
  return sql.transaction(() => {
    const d = invoiceSchema.parse(input);
    if (d.dueDate < d.issueDate) fail(400, "Due date cannot be before issue date.");
    if (!id && d.requestKey) {
      const old = rows("invoices", "request_key=?", d.requestKey)[0]; if (old) return invoice(old.id);
    }
    const old = id ? invoice(id) : null;
    if (old) { assertUnlocked(id!); if (old.status === "canceled") fail(409, "A void invoice cannot be edited."); }
    const customer = one("customers", d.customerId);
    const p = d.propertyId ? one("properties", d.propertyId) : null;
    if (p && p.customerId !== d.customerId) fail(400, "The selected owner does not own this property.");
    if (d.jobId) {
      const job = one("jobs", d.jobId);
      const existing = rows("invoices", "job_id=? AND status!='canceled'", job.id).find(i => i.id !== id);
      if (existing) { if (!id) return invoice(existing.id); fail(409, "This job already has an invoice."); }
      if (!["completed", "invoiced"].includes(job.status)) fail(400, "Complete the job before invoicing it.");
      if (job.propertyId !== d.propertyId || job.customerId !== d.customerId) fail(400, "Job, property, and owner must match.");
    }
    const items = d.items ?? (p ? defaults(p.id, d.rateType).items : []);
    if (!items.length) fail(400, "Add at least one line item.");
    let baseCount = 0;
    const sources = new Set<number>();
    const lines = items.map((raw: any, sortOrder: number) => {
      const item = itemSchema.parse(raw);
      if (["standard_rate", "owner_rate"].includes(item.lineItemType)) {
        baseCount++;
        if (item.lineItemType !== (d.rateType === "owner" ? "owner_rate" : d.rateType === "standard" ? "standard_rate" : "manual"))
          fail(400, "The base charge must match the selected rate.");
      }
      if (item.sourcePropertyServiceId) {
        if (sources.has(item.sourcePropertyServiceId)) fail(400, "A property service was added twice.");
        sources.add(item.sourcePropertyServiceId);
        const s = one("property_services", item.sourcePropertyServiceId);
        if (s.propertyId !== d.propertyId) fail(400, "Service does not belong to this property.");
      }
      return { ...item, amount: dollars(cents(item.quantity * item.unitPrice)), sortOrder };
    });
    if (baseCount > 1) fail(400, "Choose one base rate, not both owner and standard.");
    for (const source of Array.from(sources)) {
      const s = one("property_services", source);
      if (sources.has(s.excludesPropertyServiceId)) fail(400, `${s.customName} replaces another selected service. Remove the conflicting service.`);
    }
    const subtotal = lines.reduce((n, l) => n + cents(l.amount), 0);
    const total = subtotal - cents(d.discountAmount) + cents(d.travelFee) + cents(d.rushFee);
    if (total < 0 || total > 1000000000) fail(400, "Invoice total is invalid.");
    if (old && total < cents(old.amountPaid)) fail(400, "Total cannot be less than payments already received.");
    const { items: _, requestKey, ...fields } = d;
    const address = p ? [p.name, p.addressLine1, p.addressLine2, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join("\n") : "";
    const saved = {
      ...fields, invoiceNumber: d.invoiceNumber || `${rows("app_settings")[0]?.invoiceNumberPrefix || "INV"}-${new Date().getFullYear()}-${String((sql.prepare("SELECT COALESCE(MAX(id),0)+1 n FROM invoices").get() as any).n).padStart(5, "0")}`,
      subtotal: dollars(subtotal), total: dollars(total), taxRate: 0, taxAmount: 0, updatedAt: now(),
      propertyAddress: old && old.propertyId === d.propertyId ? old.propertyAddress : address,
      customerSnapshot: old && old.customerId === d.customerId ? old.customerSnapshot : JSON.stringify(customer),
    };
    if (id) update("invoices", id, saved);
    else id = insert("invoices", { ...saved, requestKey: requestKey || randomUUID(), publicToken: randomBytes(32).toString("hex"), status: "draft", createdAt: now() });
    sql.prepare("DELETE FROM invoice_items WHERE invoice_id=?").run(id);
    lines.forEach(l => insert("invoice_items", { ...l, invoiceId: id }));
    if (d.jobId) update("jobs", d.jobId, { status: "invoiced" });
    activity(id!, old ? "edited" : "created", { total: saved.total, rateType: d.rateType }, actor);
    return invoice(id!);
  })();
}
const paymentSchema = z.object({
  invoiceId: z.number().int().positive(), amount: money.refine(n => cents(n) > 0 && cents(n) / 100 === n, "Use a positive amount with at most two decimals"),
  method: z.enum(["cash", "check", "venmo", "zelle", "bank_transfer", "manual_card", "other", "card", "ach"]),
  paidDate: date, reference: z.string().max(200).nullable().default(""), note: z.string().max(4000).default(""),
  requestKey: z.string().uuid(),
});
export function recordPayment(input: any, actor = "Workspace user") {
  return sql.transaction(() => {
    const d = paymentSchema.parse(input);
    const existing = rows("payments", "request_key=?", d.requestKey)[0];
    if (existing) {
      if (existing.invoiceId !== d.invoiceId || cents(existing.amount) !== cents(d.amount)) fail(409, "Payment request key was already used.");
      return existing;
    }
    assertUnlocked(d.invoiceId);
    const inv = invoice(d.invoiceId);
    if (inv.status === "canceled") fail(400, "A void invoice cannot accept payment.");
    if (cents(d.amount) > cents(inv.balanceDue)) fail(400, "Payment exceeds the outstanding balance.");
    const id = insert("payments", { ...d, provider: "manual", status: "succeeded", createdAt: now() });
    applyPayment(inv, d.amount);
    activity(inv.id, "payment_recorded", { amount: d.amount, method: d.method, reference: d.reference }, actor);
    return one("payments", id);
  })();
}
function applyPayment(inv: any, amount: number) {
  const paid = cents(inv.amountPaid) + cents(amount);
  update("invoices", inv.id, { amountPaid: dollars(paid), status: paid >= cents(inv.total) ? "paid" : "partial",
    paidAt: paid >= cents(inv.total) ? now() : null, updatedAt: now() });
}
// Dependency seam for offline integration tests; no runtime "mock mode".
export const billingProviders = {
  stripeClient: () => new Stripe(process.env.STRIPE_SECRET_KEY!),
  sendEmail: (body: string, key: string) => fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body, signal: AbortSignal.timeout(20000),
  }),
};
const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) fail(503, "Online payments are not configured. Pay using your usual method or contact the business.");
  return billingProviders.stripeClient();
};
function publicBase() {
  const u = process.env.PUBLIC_APP_URL;
  if (!u || !u.startsWith("https://")) fail(503, "Set PUBLIC_APP_URL to the HTTPS app address before sending invoices or taking online payments.");
  return u!.replace(/\/$/, "");
}
export function integrationStatus() {
  return { stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.PUBLIC_APP_URL),
    email: Boolean(process.env.RESEND_API_KEY && process.env.INVOICE_FROM_EMAIL && process.env.PUBLIC_APP_URL),
    mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
    organizationId, taxEnabled: false };
}
function publicInvoice(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) fail(404, "Invoice link is not available.");
  const inv = rows("invoices", "public_token=? AND public_enabled=1", token)[0];
  if (!inv) fail(404, "Invoice link is not available.");
  return invoice(inv.id);
}
function printable(inv: any) {
  const customer = inv.customerSnapshot ? JSON.parse(inv.customerSnapshot) : one("customers", inv.customerId);
  const settings = rows("app_settings")[0];
  return renderInvoicePrintHtml({ invoice: inv, customer, items: rows("invoice_items", "invoice_id=? ORDER BY sort_order,id", inv.id), business: settings })
    .replace('<table>', `<div class="notes-block"><strong>Service property</strong><br>${esc(inv.propertyAddress || "").replace(/\n/g, "<br>")}</div><table>`);
}
export function completeCheckout(session: any, eventId: string) {
  return sql.transaction(() => {
    if (sql.prepare("SELECT 1 FROM webhook_events WHERE id=?").get(eventId)) return;
    const c = rows("checkout_sessions", "id=?", session.metadata?.checkoutId || "")[0];
    if (!c || session.metadata?.organizationId !== organizationId || String(c.invoiceId) !== session.metadata?.invoiceId) fail(400, "Unknown checkout.");
    if (c.providerId && c.providerId !== session.id) fail(400, "Checkout mismatch.");
    if (session.payment_status !== "paid" || session.currency !== "usd" || session.amount_total !== c.amountCents || !session.payment_intent)
      fail(400, "Payment verification failed.");
    const ref = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
    if (!rows("payments", "provider='stripe' AND provider_transaction_id=?", ref).length) {
      const inv = invoice(c.invoiceId);
      if (inv.status === "canceled" || cents(inv.balanceDue) < c.amountCents) fail(409, "Payment needs reconciliation; invoice balance changed.");
      insert("payments", { invoiceId: inv.id, amount: dollars(c.amountCents), method: "card", provider: "stripe",
        providerTransactionId: ref, paidDate: today(), reference: session.id, status: "succeeded", createdAt: now() });
      applyPayment(inv, dollars(c.amountCents));
      activity(inv.id, "online_payment", { amount: dollars(c.amountCents), transaction: ref }, "Stripe");
    }
    update("checkout_sessions", c.id, { providerId: session.id, status: "complete" });
    sql.prepare("INSERT INTO webhook_events VALUES (?,?)").run(eventId, now());
  })();
}
async function createCheckout(inv: any) {
  const client = stripe();
  const base = publicBase();
  if (["draft", "canceled"].includes(inv.status) || cents(inv.balanceDue) < 50) fail(400, "This invoice is not payable online. Card minimum is $0.50.");
  const c = sql.transaction(() => {
    const existing = rows("checkout_sessions", "invoice_id=? AND status IN ('creating','open')", inv.id)[0];
    if (existing) return existing;
    const id = randomUUID();
    insert("checkout_sessions", { id, invoiceId: inv.id, amountCents: cents(inv.balanceDue), expiresAt: Math.floor(Date.now() / 1000) + 3600, createdAt: now() });
    return one("checkout_sessions", id);
  })();
  if (c.providerId) {
    const session = await client.checkout.sessions.retrieve(c.providerId);
    if (session.status === "complete" && session.payment_status === "paid") { completeCheckout(session, `reconcile:${session.id}`); fail(409, "Payment received. Refresh the invoice."); }
    if (session.status === "expired") { update("checkout_sessions", c.id, { status: "expired" }); return createCheckout(invoice(inv.id)); }
    return { url: session.url };
  }
  // Fixed parameters + persisted idempotency key make retries safe, even after a timeout.
  if (c.expiresAt < Math.floor(Date.now() / 1000) + 1800) fail(409, "Checkout creation needs reconciliation. Ask the business to cancel/reconcile checkout.");
  const session = await client.checkout.sessions.create({
    mode: "payment", payment_method_types: ["card"], expires_at: c.expiresAt,
    client_reference_id: String(inv.id), metadata: { checkoutId: c.id, invoiceId: String(inv.id), organizationId },
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: c.amountCents, product_data: { name: `Invoice ${inv.invoiceNumber}` } } }],
    success_url: `${base}/#/pay/${inv.publicToken}?payment=success`, cancel_url: `${base}/#/pay/${inv.publicToken}`,
  }, { idempotencyKey: c.id });
  sql.prepare("UPDATE checkout_sessions SET provider_id=?,url=?,status='open' WHERE id=? AND status='creating'").run(session.id, session.url, c.id);
  return { url: session.url };
}
export function registerPublicBilling(app: Express) {
  app.post("/api/stripe/webhook", (req, res) => {
    const client = stripe();
    let event: Stripe.Event;
    try { event = client.webhooks.constructEvent(req.rawBody as Buffer, req.headers["stripe-signature"] as string, process.env.STRIPE_WEBHOOK_SECRET!); }
    catch { return res.status(400).json({ message: "Invalid webhook signature." }); }
    if (event.type === "checkout.session.completed") completeCheckout(event.data.object, event.id);
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      sql.prepare("UPDATE checkout_sessions SET status='expired' WHERE provider_id=? AND status IN ('open','creating')").run(session.id);
    }
    res.json({ received: true });
  });
  app.get("/api/public/invoices/:token", (req, res) => {
    const inv = publicInvoice(String(req.params.token));
    if (!inv.viewedAt && inv.sentAt) { update("invoices", inv.id, { viewedAt: now() }); activity(inv.id, "viewed", "Hosted invoice opened (not email-open tracking)", "Invoice link"); }
    const { invoiceNumber, issueDate, dueDate, status, total, subtotal, amountPaid, balanceDue, notes, propertyAddress, discountAmount, travelFee, rushFee } = invoice(inv.id);
    const business = rows("app_settings")[0];
    const customer = inv.customerSnapshot ? JSON.parse(inv.customerSnapshot) : one("customers", inv.customerId);
    res.json({ invoiceNumber, issueDate, dueDate, status, total, subtotal, amountPaid, balanceDue, notes, propertyAddress, discountAmount, travelFee, rushFee,
      customerName: customer.companyName || customer.name, businessName: business.businessName, businessEmail: business.businessEmail,
      businessPhone: business.businessPhone, footer: business.invoiceFooterNote, onlineEnabled: integrationStatus().stripe,
      items: rows("invoice_items", "invoice_id=? ORDER BY sort_order,id", inv.id).map(({ description, descriptionSnapshot, quantity, unitPrice, amount }) => ({ description, descriptionSnapshot, quantity, unitPrice, amount })) });
  });
  app.get("/api/public/invoices/:token/print", (req, res) => res.type("html").send(printable(publicInvoice(String(req.params.token)))));
  app.post("/api/public/invoices/:token/checkout", async (req, res) => res.json(await createCheckout(publicInvoice(String(req.params.token)))));
}

export function registerBilling(app: Express) {
  app.get("/api/integrations", (_req, res) => res.json(integrationStatus()));
  app.get("/api/services", (_req, res) => res.json(rows("service_catalog", "1=1 ORDER BY sort_order,name")));
  app.post("/api/services", (req, res) => {
    const id = insert("service_catalog", { ...serviceSchema.parse(req.body), createdAt: now(), updatedAt: now() });
    res.status(201).json(one("service_catalog", id));
  });
  app.patch("/api/services/:id", (req, res) => {
    const id = Number(req.params.id); one("service_catalog", id);
    const parsed = serviceSchema.partial().parse(req.body);
    // Zod defaults must not reset unrelated fields in a partial catalog edit.
    const changes = Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(req.body, key)));
    update("service_catalog", id, { ...changes, updatedAt: now() });
    res.json(one("service_catalog", id));
  });
  app.get("/api/properties/:id/services", (req, res) => { one("properties", Number(req.params.id)); res.json(rows("property_services", "property_id=?", Number(req.params.id))); });
  // Create the reusable catalog default and this property's override atomically.
  // Property-only instructions and exclusions must never leak into the library.
  app.post("/api/properties/:id/common-services", (req, res) => {
    const propertyId = Number(req.params.id); one("properties", propertyId);
    const d = propertyServiceSchema.parse(req.body);
    if (d.serviceId) fail(400, "Choose the existing common job instead of creating another.");
    const c = serviceSchema.parse({ name: d.customName, description: d.customDescription, category: req.body.category,
      defaultPrice: d.customPrice, defaultQuantity: d.defaultQuantity, defaultInclusionBehavior: d.invoiceBehavior });
    if (d.excludesPropertyServiceId && one("property_services", d.excludesPropertyServiceId).propertyId !== propertyId)
      fail(400, "An exclusion must be a service at this property.");
    const result = sql.transaction(() => {
      if (sql.prepare("SELECT id FROM service_catalog WHERE lower(trim(name))=lower(?)").get(c.name))
        fail(409, "A common job with this name already exists. Choose it from the library, or use a different name.");
      const serviceId = insert("service_catalog", { ...c, createdAt: now(), updatedAt: now() });
      const id = insert("property_services", { ...d, serviceId, propertyId, createdAt: now(), updatedAt: now() });
      return one("property_services", id);
    })();
    res.status(201).json(result);
  });
  const saveService = (req: any, res: any) => {
    const propertyId = Number(req.params.id); one("properties", propertyId);
    let id = Number(req.params.serviceId);
    if (id && one("property_services", id).propertyId !== propertyId) fail(404, "Service not found.");
    const d = propertyServiceSchema.parse(req.body);
    if (d.serviceId) {
      const catalogService = one("service_catalog", d.serviceId);
      if (!req.params.serviceId && !catalogService.active) fail(400, "This common job is inactive. Enable it in the service catalog first.");
      const existing = sql.prepare("SELECT id FROM property_services WHERE property_id=? AND service_id=? AND id<>?").get(propertyId, d.serviceId, Number(req.params.serviceId) || 0);
      if (existing) fail(409, "This common job is already configured for this property. Edit the existing service instead.");
    }
    if (d.excludesPropertyServiceId) {
      if (d.excludesPropertyServiceId === Number(req.params.serviceId) || one("property_services", d.excludesPropertyServiceId).propertyId !== propertyId)
        fail(400, "An exclusion must be a different service at this property.");
    }
    if (id) {
      update("property_services", id, { ...d, updatedAt: now() });
    } else id = insert("property_services", { ...d, propertyId, createdAt: now(), updatedAt: now() });
    res.json(one("property_services", id));
  };
  app.post("/api/properties/:id/services", saveService);
  app.patch("/api/properties/:id/services/:serviceId", saveService);
  app.get("/api/properties/:id/invoice-defaults", (req, res) => res.json(defaults(Number(req.params.id), String(req.query.rateType || "standard"))));
  app.get("/api/invoices", (req, res) => {
    const list = rows("invoices").filter(i => (!req.query.customerId || i.customerId === Number(req.query.customerId)) && (!req.query.propertyId || i.propertyId === Number(req.query.propertyId)));
    res.json(list.map(i => invoice(i.id)));
  });
  app.get("/api/invoices/:id", (req, res) => res.json(invoice(Number(req.params.id))));
  app.post("/api/invoices", (req, res) => res.status(201).json(saveInvoice(req.body, undefined, res.locals.user.email)));
  app.patch("/api/invoices/:id", (req, res) => {
    const id = Number(req.params.id), old = invoice(id);
    if (Object.keys(req.body).some(k => ["amountPaid", "total", "subtotal", "taxRate", "taxAmount", "status", "publicToken"].includes(k)))
      fail(400, "Use Send Invoice, Record Payment, or Void. Totals and statuses are server-controlled.");
    res.json(saveInvoice({ ...old, items: rows("invoice_items", "invoice_id=? ORDER BY sort_order,id", id), ...req.body }, id, res.locals.user.email));
  });
  app.post("/api/invoices/generate-from-job/:id", (req, res) => {
    const j = one("jobs", Number(req.params.id));
    const existing = rows("invoices", "job_id=? AND status!='canceled'", j.id)[0];
    if (existing) return res.json(invoice(existing.id));
    const d = defaults(j.propertyId, j.rateType);
    const base = d.items.find((i: any) => i.lineItemType.endsWith("_rate"));
    if (base) base.unitPrice = j.price;
    else if (j.price > 0) d.items.unshift({ description: "Job service", quantity: 1, unitPrice: j.price, lineItemType: "manual" });
    const due = new Date(`${today()}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + (rows("app_settings")[0]?.defaultPaymentTermsDays ?? 15));
    res.status(201).json(saveInvoice({ ...req.body, propertyId: j.propertyId, customerId: j.customerId, jobId: j.id,
      issueDate: today(), dueDate: due.toISOString().slice(0, 10), rateType: j.rateType,
      notes: j.customerNotes || d.notes, items: d.items }, undefined, res.locals.user.email));
  });
  app.get("/api/invoices/:id/items", (req, res) => { invoice(Number(req.params.id)); res.json(rows("invoice_items", "invoice_id=? ORDER BY sort_order,id", Number(req.params.id))); });
  app.get("/api/invoices/:id/activity", (req, res) => { invoice(Number(req.params.id)); res.json(rows("invoice_activity", "invoice_id=? ORDER BY id DESC", Number(req.params.id))); });
  app.get("/api/invoices/:id/print", (req, res) => res.type("html").send(printable(invoice(Number(req.params.id)))));
  app.post("/api/invoices/:id/void", (req, res) => {
    const inv = invoice(Number(req.params.id)); assertUnlocked(inv.id);
    if (inv.amountPaid > 0) fail(409, "A paid invoice cannot be voided. Reconcile/refund payments first.");
    update("invoices", inv.id, { status: "canceled", publicEnabled: 0, updatedAt: now() });
    activity(inv.id, "voided", {}, res.locals.user.email); res.json(invoice(inv.id));
  });
  app.delete("/api/invoices/:id", () => fail(409, "Use Delete invoice on the invoice page. Deleting takes three confirmation steps."));
  app.post("/api/invoices/:id/delete", (req, res) => {
    const inv = invoice(Number(req.params.id)); assertUnlocked(inv.id);
    const body = z.object({ confirmInvoiceNumber: z.string().max(100), understood: z.literal(true) }).safeParse(req.body);
    if (!body.success || body.data.confirmInvoiceNumber.trim().toUpperCase() !== String(inv.invoiceNumber).toUpperCase())
      fail(400, `Type ${inv.invoiceNumber} exactly and confirm you understand to delete this invoice.`);
    const pays = rows("payments", "invoice_id=?", inv.id);
    if (pays.some((p: any) => (p.provider || "manual") !== "manual"))
      fail(409, "This invoice has an online card payment. Refund it in Stripe first; card payments can't be deleted here.");
    sql.transaction(() => {
      const snapshot = { invoice: rows("invoices", "id=?", inv.id)[0], items: rows("invoice_items", "invoice_id=?", inv.id), payments: pays,
        activity: rows("invoice_activity", "invoice_id=?", inv.id), sends: rows("invoice_sends", "invoice_id=?", inv.id),
        checkouts: rows("checkout_sessions", "invoice_id=?", inv.id) };
      insert("deleted_invoices", { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, snapshot: JSON.stringify(snapshot), deletedBy: res.locals.user.email, deletedAt: now() });
      for (const t of ["invoice_activity", "invoice_items", "payments", "invoice_sends", "checkout_sessions"]) sql.prepare(`DELETE FROM ${t} WHERE invoice_id=?`).run(inv.id);
      sql.prepare("DELETE FROM invoices WHERE id=?").run(inv.id);
      if (inv.jobId && !rows("invoices", "job_id=? AND status!='canceled'", inv.jobId).length) update("jobs", inv.jobId, { status: "completed" });
    })();
    res.json({ deleted: inv.invoiceNumber });
  });
  app.get("/api/payments", (req, res) => res.json(req.query.invoiceId ? rows("payments", "invoice_id=?", Number(req.query.invoiceId)) : rows("payments")));
  app.get("/api/invoices/:id/payments", (req, res) => { invoice(Number(req.params.id)); res.json(rows("payments", "invoice_id=?", Number(req.params.id))); });
  app.post("/api/payments", (req, res) => res.status(201).json(recordPayment(req.body, res.locals.user.email)));
  app.delete("/api/payments/:id", (req, res) => {
    sql.transaction(() => {
      const p = one("payments", Number(req.params.id)); assertUnlocked(p.invoiceId);
      if (p.provider === "stripe") fail(409, "Refund Stripe payments in Stripe and reconcile them; do not delete processor transactions.");
      const inv = invoice(p.invoiceId);
      sql.prepare("DELETE FROM payments WHERE id=?").run(p.id);
      update("invoices", inv.id, { amountPaid: dollars(Math.max(0, cents(inv.amountPaid) - cents(p.amount))), paidAt: null, status: inv.sentAt ? "sent" : "draft" });
      activity(inv.id, "payment_removed", { amount: p.amount, reference: p.reference }, res.locals.user.email);
    })(); res.sendStatus(204);
  });
  app.post("/api/invoices/:id/cancel-checkout", async (req, res) => {
    const inv = invoice(Number(req.params.id)), client = stripe();
    for (const c of rows("checkout_sessions", "invoice_id=? AND status IN ('creating','open')", inv.id)) {
      if (!c.providerId) {
        // Find a session whose creation response was lost. Never unlock based on a local timeout.
        const found = await client.checkout.sessions.list({ created: { gte: Math.floor(Date.parse(c.createdAt) / 1000) - 60 }, limit: 100 });
        const matched = found.data.find(s => s.metadata?.checkoutId === c.id);
        if (!matched) fail(409, "Unknown checkout result. Inspect Stripe and reconcile before unlocking this invoice.");
        c.providerId = matched.id; update("checkout_sessions", c.id, { providerId: matched.id });
      }
      let s = await client.checkout.sessions.retrieve(c.providerId);
      if (s.status === "open") s = await client.checkout.sessions.expire(c.providerId);
      if (s.status === "complete" && s.payment_status === "paid") completeCheckout(s, `reconcile:${s.id}`);
      else if (s.status === "expired") update("checkout_sessions", c.id, { status: "expired" });
      else fail(409, "Checkout is still settling. Try again shortly.");
    }
    res.json(invoice(inv.id));
  });
  app.get("/api/invoices/:id/pending-send", (req, res) => {
    const inv = invoice(Number(req.params.id));
    const pending = rows("invoice_sends", "invoice_id=? AND status='pending'", inv.id)[0];
    if (pending && !pending.reviewData) fail(409, "An older send needs delivery verification with the email provider before continuing.");
    res.json(pending ? JSON.parse(pending.reviewData) : null);
  });
  app.post("/api/invoices/:id/send", async (req, res) => {
    if (!integrationStatus().email) fail(503, "Invoice email is not configured. Set RESEND_API_KEY, INVOICE_FROM_EMAIL, and PUBLIC_APP_URL on the server.");
    const d = z.object({ recipient: z.string().email(), subject: z.string().min(1).max(200), message: z.string().max(10000), requestKey: z.string().uuid() }).parse(req.body);
    const inv = invoice(Number(req.params.id));
    if (inv.status === "canceled") fail(400, "Cannot send a void invoice.");
    const url = `${publicBase()}/#/pay/${inv.publicToken || randomBytes(32).toString("hex")}`;
    const payload = JSON.stringify({ from: process.env.INVOICE_FROM_EMAIL, to: d.recipient, subject: d.subject,
      html: `<p>${esc(d.message).replace(/\n/g, "<br>")}</p><p>Invoice ${esc(inv.invoiceNumber)}<br>Total: $${inv.total.toFixed(2)}<br>Balance due: $${inv.balanceDue.toFixed(2)}<br>Due: ${esc(inv.dueDate)}</p><p><a href="${esc(url)}">${integrationStatus().stripe ? "View & Pay Invoice" : "View Invoice"}</a></p><p>You may also pay using your usual arrangement with the business. Online payment is optional.</p>` });
    const existing = rows("invoice_sends", "request_key=?", d.requestKey)[0];
    if (existing) {
      if (existing.invoiceId !== inv.id || existing.payload !== payload) fail(409, "This send key belongs to a different email. Start a new review.");
      if (existing.status === "sent") return res.json(invoice(inv.id));
      if (Date.now() - Date.parse(existing.createdAt) > 23 * 3600000) fail(409, "Old uncertain send: verify delivery with Resend before retrying.");
    } else {
      if (rows("invoice_sends", "invoice_id=? AND status='pending'", inv.id).length) fail(409, "Another send is pending. Retry that send first.");
      insert("invoice_sends", { requestKey: d.requestKey, invoiceId: inv.id, payload, reviewData: JSON.stringify(d), createdAt: now() });
      update("invoices", inv.id, { publicToken: url.split("/pay/")[1], publicEnabled: 1 });
    }
    let response: Response;
    try {
      response = await billingProviders.sendEmail(payload, d.requestKey);
    } catch { activity(inv.id, "send_uncertain", { recipient: d.recipient, requestKey: d.requestKey }, res.locals.user.email); fail(502, "Email response timed out. Retry the same send to avoid duplicates."); }
    if (!response.ok) {
      if (response.status < 500 && response.status !== 429) sql.prepare("UPDATE invoice_sends SET status='failed' WHERE request_key=?").run(d.requestKey);
      activity(inv.id, "send_failed", { recipient: d.recipient, status: response.status }, res.locals.user.email);
      fail(502, "Email provider did not accept the message. Check sender configuration and retry.");
    }
    const result = await response.json() as any;
    sql.transaction(() => {
      if (rows("invoice_sends", "request_key=?", d.requestKey)[0]?.status === "sent") return;
      sql.prepare("UPDATE invoice_sends SET status='sent',provider_id=? WHERE request_key=?").run(result.id, d.requestKey);
      update("invoices", inv.id, { sentAt: now(), status: inv.amountPaid > 0 ? inv.status : "sent", updatedAt: now() });
      activity(inv.id, "sent", { recipient: d.recipient, subject: d.subject, message: d.message, providerId: result.id }, res.locals.user.email);
    })();
    res.json(invoice(inv.id));
  });
  // Legacy one-item endpoints use the same validated transactional editor.
  app.post("/api/invoice-items", (req, res) => {
    const inv = invoice(Number(req.body.invoiceId)), items = rows("invoice_items", "invoice_id=?", inv.id);
    const result = saveInvoice({ ...inv, items: [...items, req.body] }, inv.id, res.locals.user.email);
    res.status(201).json(result);
  });
  app.patch("/api/invoice-items/:id", (req, res) => {
    const item = one("invoice_items", Number(req.params.id)), inv = invoice(item.invoiceId);
    res.json(saveInvoice({ ...inv, items: rows("invoice_items", "invoice_id=?", inv.id).map(i => i.id === item.id ? { ...i, ...req.body } : i) }, inv.id, res.locals.user.email));
  });
  app.delete("/api/invoice-items/:id", (req, res) => {
    const item = one("invoice_items", Number(req.params.id)), inv = invoice(item.invoiceId);
    saveInvoice({ ...inv, items: rows("invoice_items", "invoice_id=?", inv.id).filter(i => i.id !== item.id) }, inv.id, res.locals.user.email); res.sendStatus(204);
  });
  // Never fall through to the old, unguarded billing implementations.
  app.use(["/api/invoices", "/api/payments", "/api/invoice-items"], (_req, res) => res.status(404).json({ message: "Billing endpoint not found." }));
}
