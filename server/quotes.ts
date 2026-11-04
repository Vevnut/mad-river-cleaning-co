import type { Express, Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { camel, checkedLines, saveInvoice } from "./billing";
import { invoicePdfFilename, pdfDisposition, renderInvoicePdf } from "./invoice-pdf";

/**
 * Quotes: priced offers sent before any work is agreed. Written to an existing customer, or to
 * a prospect whose details live on the quote until the quote becomes an invoice or a job.
 *
 *   draft -> sent -> accepted | declined        (a sent quote past valid_until reads as "expired")
 *
 * A customer can only ever accept the price they can see: editing a sent quote takes it back to
 * draft and turns the link off until it's sent again. Accepted quotes never change.
 * Owner routes are registered after the sign-in gate; registerPublicQuotes before it.
 */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const now = () => new Date().toISOString();
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const cents = (v: number) => Math.round((v + Number.EPSILON) * 100);
const dollars = (v: number) => v / 100;
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }

const money = z.number().finite().min(0).max(10000000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Invalid date");
const text = (max: number) => z.string().trim().max(max).default("");
const quoteSchema = z.object({
  customerId: z.number().int().positive().nullable().default(null), propertyId: z.number().int().positive().nullable().default(null),
  prospectName: text(200), prospectCompany: text(200), prospectEmail: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""), prospectPhone: text(60),
  prospectAddressLine1: text(200), prospectAddressLine2: text(200), prospectCity: text(100), prospectState: text(40), prospectZip: text(20),
  rateType: z.enum(["standard", "owner", "custom"]).default("custom"), issueDate: date, validUntil: date,
  notes: z.string().max(10000).nullable().default(""), internalNotes: z.string().max(10000).nullable().default(""),
  discountAmount: money.default(0), travelFee: money.default(0), rushFee: money.default(0),
  items: z.array(z.any()).max(200).default([]), requestKey: z.string().uuid().optional(),
});
const scheduleSchema = z.object({
  scheduledDate: date, scheduledTime: z.string().regex(/^\d{2}:\d{2}$/), durationMinutes: z.number().int().min(15).max(1440),
  jobType: z.enum(["turnover", "deep_clean", "inspection", "one_time", "custom", "recurring"]).default("one_time"),
  propertyId: z.number().int().positive().nullable().default(null),
});
const publicAnswer = z.object({ decision: z.enum(["accept", "decline"]), name: z.string().trim().max(120).default(""), note: z.string().trim().max(1000).default("") });

const rows = async (table: string, where = "1=1", ...args: any[]): Promise<any[]> => (await db.all(`SELECT * FROM ${table} WHERE ${where}`, ...args)).map(camel);
const customerOf = async (id: number | null) => (id ? (await rows("customers", "id=?", id))[0] ?? null : null);
const shownStatus = (q: any) => (q.status === "sent" && q.validUntil < today() ? "expired" : q.status);

async function load(id: number) {
  const q = Number.isSafeInteger(id) ? (await rows("quotes", "id=?", id))[0] : undefined;
  if (!q) fail(404, "Quote not found");
  return q;
}
async function details(q: any) {
  const customer = await customerOf(q.customerId);
  return {
    ...q, status: shownStatus(q), customerName: customer ? customer.companyName || customer.name : q.prospectCompany || q.prospectName,
    isProspect: !q.customerId, items: await rows("quote_items", "quote_id=? ORDER BY sort_order,id", q.id),
    activity: await rows("quote_activity", "quote_id=? ORDER BY id DESC", q.id),
  };
}
const activity = (quoteId: number, type: string, actor: string, detail = "") =>
  db.run("INSERT INTO quote_activity (quote_id,activity_type,actor,details,created_at) VALUES (?,?,?,?,?)", quoteId, type, actor, detail, now());

/** Row lock, so two taps or a tap and an edit can't both act on the same quote. */
const lock = (id: number) => db.get("SELECT id FROM quotes WHERE id=? FOR UPDATE", id);

export function saveQuote(input: unknown, id: number | undefined, actor: string) {
  return db.tx(async () => {
    const d = quoteSchema.parse(input);
    if (d.validUntil < d.issueDate) fail(400, "The valid-until date can't be before the quote date.");
    if (!id && d.requestKey) {
      const repeat = (await rows("quotes", "request_key=?", d.requestKey))[0];
      if (repeat) return details(repeat);
    }
    let old: any = null;
    if (id) {
      await lock(id);
      old = await load(id);
      if (old.status === "accepted") fail(409, "An accepted quote can't be changed. Create a new quote instead.");
      if (old.status === "canceled") fail(409, "A canceled quote can't be changed.");
    }

    const customer = await customerOf(d.customerId);
    if (d.customerId && !customer) fail(404, "Customer not found");
    if (!customer && !d.prospectName) fail(400, "Choose a customer or enter the new customer's name.");
    const property = d.propertyId ? (await rows("properties", "id=?", d.propertyId))[0] : null;
    if (d.propertyId && !property) fail(404, "Property not found");
    if (property && property.customerId !== d.customerId) fail(400, "That property belongs to a different customer.");
    if (!d.items.length) fail(400, "Add at least one line item.");
    const { lines, subtotal } = await checkedLines(d.items, d.rateType, d.propertyId);
    const total = subtotal - cents(d.discountAmount) + cents(d.travelFee) + cents(d.rushFee);
    if (total < 0 || total > 1000000000) fail(400, "Quote total is invalid.");

    const prospect = customer
      ? { prospectName: "", prospectCompany: "", prospectEmail: "", prospectPhone: "", prospectAddressLine1: "", prospectAddressLine2: "", prospectCity: "", prospectState: "", prospectZip: "" }
      : { prospectName: d.prospectName, prospectCompany: d.prospectCompany, prospectEmail: d.prospectEmail, prospectPhone: d.prospectPhone, prospectAddressLine1: d.prospectAddressLine1, prospectAddressLine2: d.prospectAddressLine2, prospectCity: d.prospectCity, prospectState: d.prospectState, prospectZip: d.prospectZip };
    const address = property ? [property.name, property.addressLine1, property.addressLine2, `${property.city}, ${property.state} ${property.zip}`].filter(Boolean).join("\n") : "";
    const values: any[] = [d.customerId, d.propertyId, ...Object.values(prospect), address, d.rateType, d.issueDate, d.validUntil,
      dollars(subtotal), d.discountAmount, d.travelFee, d.rushFee, dollars(total), d.notes, d.internalNotes];
    const columns = "customer_id=?,property_id=?,prospect_name=?,prospect_company=?,prospect_email=?,prospect_phone=?,prospect_address_line1=?,prospect_address_line2=?,prospect_city=?,prospect_state=?,prospect_zip=?,property_address=?,rate_type=?,issue_date=?,valid_until=?,subtotal=?,discount_amount=?,travel_fee=?,rush_fee=?,total=?,notes=?,internal_notes=?";

    if (old) {
      await db.run(`UPDATE quotes SET ${columns},updated_at=? WHERE id=?`, ...values, now(), id!);
      if (old.status !== "draft") {
        // What the customer was shown no longer matches, so they can't answer until it's re-sent.
        await db.run("UPDATE quotes SET status='draft',public_enabled=0,sent_at=NULL,viewed_at=NULL,responded_at=NULL,response_name=NULL,response_note=NULL WHERE id=?", id!);
        await activity(id!, "returned_to_draft", actor, "Edited after sending, link turned off until sent again");
      } else await activity(id!, "edited", actor);
    } else {
      id = Number((await db.get("SELECT nextval(pg_get_serial_sequence('quotes','id')) n"))!.n);
      const number = `Q-${new Date().getFullYear()}-${String(id).padStart(5, "0")}`;
      const names = columns.replace(/=\?/g, "");
      await db.run(`INSERT INTO quotes (id,quote_number,public_token,status,request_key,created_at,updated_at,${names}) VALUES (?,?,?,'draft',?,?,?,${values.map(() => "?").join(",")})`,
        id, number, randomBytes(32).toString("hex"), d.requestKey ?? null, now(), now(), ...values);
      await activity(id, "created", actor);
    }

    await db.run("DELETE FROM quote_items WHERE quote_id=?", id!);
    for (const l of lines)
      await db.run("INSERT INTO quote_items (quote_id,description,description_snapshot,item_type,quantity,unit_price,amount,sort_order,source_property_service_id,is_auto_added,line_item_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        id!, l.description, l.descriptionSnapshot ?? null, l.itemType, l.quantity, l.unitPrice, l.amount, l.sortOrder, l.sourcePropertyServiceId ?? null, l.isAutoAdded ? 1 : 0, l.lineItemType);
    return details(await load(id!));
  });
}

/** A prospect becomes a customer the first time an accepted quote turns into real work. */
async function ensureCustomer(q: any, actor: string): Promise<number> {
  if (q.customerId) return q.customerId;
  const id = await db.insertId(`INSERT INTO customers (name,company_name,customer_type,email,phone,preferred_contact,billing_address_line1,billing_address_line2,billing_city,billing_state,billing_zip,notes,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, q.prospectName, q.prospectCompany || null, q.prospectCompany ? "company" : "individual", q.prospectEmail, q.prospectPhone,
    q.prospectEmail ? "email" : "phone", q.prospectAddressLine1, q.prospectAddressLine2 || null, q.prospectCity, q.prospectState, q.prospectZip, `Added from quote ${q.quoteNumber}.`, now());
  await db.run("UPDATE quotes SET customer_id=? WHERE id=?", id, q.id);
  await activity(q.id, "customer_created", actor, q.prospectName);
  return id;
}

/** Jobs need a property. A prospect's is made from their address, with the details left to fill in. */
async function ensureProperty(q: any, customerId: number, chosen: number | null, actor: string): Promise<number> {
  const existing = chosen ?? q.propertyId;
  if (existing) {
    const p = (await rows("properties", "id=?", existing))[0];
    if (!p) fail(404, "Property not found");
    if (p.customerId !== customerId) fail(400, "That property belongs to a different customer.");
    if (existing !== q.propertyId) await db.run("UPDATE quotes SET property_id=? WHERE id=?", existing, q.id);
    return existing;
  }
  if (!q.prospectAddressLine1) fail(400, "Choose a property for this job.");
  const id = await db.insertId(`INSERT INTO properties (customer_id,name,address_line1,address_line2,city,state,zip,unit_type,bedrooms,bathrooms,max_occupancy,check_in_time,check_out_time,entry_instructions,cleaning_frequency,base_price)
    VALUES (?,?,?,?,?,?,?,'house',0,0,0,'16:00','10:00','','one_time',0)`, customerId, q.prospectAddressLine1, q.prospectAddressLine1, q.prospectAddressLine2 || null, q.prospectCity, q.prospectState, q.prospectZip);
  await db.run("UPDATE quotes SET property_id=? WHERE id=?", id, q.id);
  await activity(q.id, "property_created", actor, q.prospectAddressLine1);
  return id;
}

async function createInvoice(id: number, actor: string) {
  return db.tx(async () => {
    await lock(id);
    const q = await load(id);
    if (q.status !== "accepted") fail(409, "Only an accepted quote can become an invoice.");
    if (q.invoiceId) {
      const live = (await rows("invoices", "id=? AND status!='canceled'", q.invoiceId))[0];
      if (live) return { id: live.id };
    }
    const customerId = await ensureCustomer(q, actor);
    const items = await rows("quote_items", "quote_id=? ORDER BY sort_order,id", q.id);
    const job = q.jobId ? (await rows("jobs", "id=?", q.jobId))[0] : null;
    const terms = (await rows("app_settings", "1=1 ORDER BY id LIMIT 1"))[0]?.defaultPaymentTermsDays ?? 15;
    const invoice = await saveInvoice({
      customerId, propertyId: q.propertyId, jobId: job?.status === "completed" ? job.id : null, issueDate: today(), dueDate: addDays(today(), terms), rateType: q.rateType,
      notes: q.notes, internalNotes: [`From quote ${q.quoteNumber}.`, q.internalNotes].filter(Boolean).join("\n"),
      discountAmount: q.discountAmount, travelFee: q.travelFee, rushFee: q.rushFee,
      // Add-on links are dropped: a quote's prices stand even if the property's services changed since.
      items: items.map(i => ({ description: i.description, descriptionSnapshot: i.descriptionSnapshot, itemType: i.itemType, quantity: i.quantity, unitPrice: i.unitPrice, isAutoAdded: !!i.isAutoAdded, lineItemType: i.lineItemType, sourcePropertyServiceId: null })),
    }, undefined, actor);
    await db.run("UPDATE quotes SET invoice_id=?,updated_at=? WHERE id=?", invoice.id, now(), q.id);
    await activity(q.id, "invoice_created", actor, invoice.invoiceNumber);
    return { id: invoice.id };
  });
}

async function createJob(id: number, input: unknown, actor: string) {
  const d = scheduleSchema.parse(input);
  return db.tx(async () => {
    await lock(id);
    const q = await load(id);
    if (q.status !== "accepted") fail(409, "Only an accepted quote can become a job.");
    if (q.jobId) return { id: q.jobId };
    const customerId = await ensureCustomer(q, actor);
    const propertyId = await ensureProperty(q, customerId, d.propertyId, actor);
    const jobId = await db.insertId(`INSERT INTO jobs (property_id,customer_id,job_type,scheduled_date,scheduled_time,duration_minutes,status,internal_notes,customer_notes,price,rate_type)
      VALUES (?,?,?,?,?,?,'scheduled',?,?,?,?)`, propertyId, customerId, d.jobType, d.scheduledDate, d.scheduledTime, d.durationMinutes, `From quote ${q.quoteNumber}.`, q.notes || null, q.total, q.rateType);
    await db.run("UPDATE quotes SET job_id=?,updated_at=? WHERE id=?", jobId, now(), q.id);
    await activity(q.id, "job_created", actor, `Job #${jobId}`);
    return { id: jobId };
  });
}

async function sendPdf(res: Response, q: any, inline: boolean) {
  const customer = await customerOf(q.customerId) ?? {
    name: q.prospectName, companyName: q.prospectCompany, email: q.prospectEmail, phone: q.prospectPhone,
    billingAddressLine1: q.prospectAddressLine1, billingAddressLine2: q.prospectAddressLine2, billingCity: q.prospectCity, billingState: q.prospectState, billingZip: q.prospectZip,
  };
  const business = (await rows("app_settings", "1=1 ORDER BY id LIMIT 1"))[0];
  const invoice = { ...q, invoiceNumber: q.quoteNumber, dueDate: q.validUntil, status: shownStatus(q), amountPaid: 0, taxAmount: 0 };
  const pdf = await renderInvoicePdf({ invoice, customer, business, serviceProperty: q.propertyAddress, quote: true,
    items: await rows("quote_items", "quote_id=? ORDER BY sort_order,id", q.id) });
  res.set({ "Content-Type": "application/pdf", "Content-Length": String(pdf.length),
    "Content-Disposition": pdfDisposition(invoicePdfFilename(invoice, customer, business, "Quote"), inline),
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.send(pdf);
}

async function byToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) fail(404, "Quote link is not available.");
  const q = (await rows("quotes", "public_token=? AND public_enabled=1", token))[0];
  if (!q) fail(404, "Quote link is not available.");
  return q;
}

/** Internal notes, activity and links to the business's own records never leave through here. */
async function publicView(q: any) {
  const customer = await customerOf(q.customerId);
  const business = (await rows("app_settings", "1=1 ORDER BY id LIMIT 1"))[0];
  return {
    quoteNumber: q.quoteNumber, status: shownStatus(q), issueDate: q.issueDate, validUntil: q.validUntil, respondedAt: q.respondedAt, responseName: q.responseName,
    customerName: customer ? customer.companyName || customer.name : q.prospectCompany || q.prospectName,
    propertyAddress: q.propertyAddress || [q.prospectAddressLine1, q.prospectAddressLine2, [q.prospectCity, [q.prospectState, q.prospectZip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join("\n"),
    subtotal: q.subtotal, discountAmount: q.discountAmount, travelFee: q.travelFee, rushFee: q.rushFee, total: q.total, notes: q.notes,
    items: (await rows("quote_items", "quote_id=? ORDER BY sort_order,id", q.id)).map(({ description, descriptionSnapshot, quantity, unitPrice, amount }) => ({ description, descriptionSnapshot, quantity, unitPrice, amount })),
    businessName: business?.businessName, businessEmail: business?.businessEmail, businessPhone: business?.businessPhone,
  };
}

export function registerPublicQuotes(app: Express) {
  app.get("/api/public/quotes/:token", async (req, res) => {
    const q = await byToken(String(req.params.token));
    if (q.status === "sent" && !q.viewedAt) {
      await db.run("UPDATE quotes SET viewed_at=? WHERE id=?", now(), q.id);
      await activity(q.id, "viewed", "Quote link");
    }
    res.json(await publicView(q));
  });
  app.get("/api/public/quotes/:token/pdf", async (req, res) => sendPdf(res, await byToken(String(req.params.token)), req.query.inline === "1"));
  app.post("/api/public/quotes/:token/respond", async (req, res) => {
    const q = await byToken(String(req.params.token));
    const d = publicAnswer.parse(req.body);
    if (d.decision === "accept" && !d.name) fail(400, "Enter your name to accept this quote.");
    const status = d.decision === "accept" ? "accepted" : "declined";
    // One atomic step: a second tap, or an edit made a moment earlier, can't get through.
    const done = await db.run("UPDATE quotes SET status=?,responded_at=?,response_name=?,response_note=?,updated_at=? WHERE id=? AND status='sent' AND public_enabled=1 AND valid_until>=?",
      status, now(), d.name || null, d.note || null, now(), q.id, today());
    if (!done.changes) {
      const current = await load(q.id);
      if (current.status === status) return res.json(await publicView(current));
      fail(409, shownStatus(current) === "expired" ? "This quote has expired. Contact the business for an updated one." : "This quote can no longer be answered. Contact the business.");
    }
    await activity(q.id, status, d.name || "Customer", d.note);
    res.json(await publicView(await load(q.id)));
  });
}

export function registerQuotes(app: Express) {
  const actor = (res: Response) => res.locals.user?.email || "Workspace user";

  app.get("/api/quotes", async (_req, res) => {
    const list = await db.all(`SELECT q.*, COALESCE(NULLIF(c.company_name,''), c.name) customer_label FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id ORDER BY q.id DESC`);
    res.json(list.map(camel).map(q => ({
      id: q.id, quoteNumber: q.quoteNumber, issueDate: q.issueDate, validUntil: q.validUntil, total: q.total, status: shownStatus(q),
      customerId: q.customerId, customerName: q.customerLabel || q.prospectCompany || q.prospectName, isProspect: !q.customerId,
    })));
  });
  app.post("/api/quotes", async (req, res) => res.status(201).json(await saveQuote(req.body, undefined, actor(res))));
  app.get("/api/quotes/:id", async (req, res) => res.json(await details(await load(Number(req.params.id)))));
  app.patch("/api/quotes/:id", async (req, res) => res.json(await saveQuote(req.body, (await load(Number(req.params.id))).id, actor(res))));
  app.get("/api/quotes/:id/pdf", async (req, res) => sendPdf(res, await load(Number(req.params.id)), req.query.inline === "1"));

  app.post("/api/quotes/:id/send", async (req, res) => {
    const result = await db.tx(async () => {
      const q = await load(Number(req.params.id));
      await lock(q.id);
      if (!["draft", "sent"].includes(q.status)) fail(409, "Only a draft can be sent.");
      if (q.validUntil < today()) fail(400, "This quote's valid-until date has passed. Edit the date first.");
      await db.run("UPDATE quotes SET status='sent',public_enabled=1,sent_at=COALESCE(sent_at,?),updated_at=? WHERE id=?", now(), now(), q.id);
      if (q.status === "draft") await activity(q.id, "sent", actor(res));
      return details(await load(q.id));
    });
    res.json(result);
  });

  // For answers given by phone or in person.
  app.post("/api/quotes/:id/respond", async (req, res) => {
    const { decision } = z.object({ decision: z.enum(["accept", "decline"]) }).parse(req.body);
    const result = await db.tx(async () => {
      const q = await load(Number(req.params.id));
      await lock(q.id);
      if (!["draft", "sent"].includes(q.status)) fail(409, "This quote has already been answered.");
      const status = decision === "accept" ? "accepted" : "declined";
      await db.run("UPDATE quotes SET status=?,responded_at=?,response_name=?,updated_at=? WHERE id=?", status, now(), `Recorded by ${actor(res)}`, now(), q.id);
      await activity(q.id, status, actor(res), "Recorded in the app");
      return details(await load(q.id));
    });
    res.json(result);
  });

  app.post("/api/quotes/:id/cancel", async (req, res) => {
    const result = await db.tx(async () => {
      const q = await load(Number(req.params.id));
      await lock(q.id);
      if (q.status === "canceled") return details(q);
      if (q.invoiceId || q.jobId) fail(409, "This quote already has an invoice or job. Deal with those first.");
      await db.run("UPDATE quotes SET status='canceled',public_enabled=0,updated_at=? WHERE id=?", now(), q.id);
      await activity(q.id, "canceled", actor(res));
      return details(await load(q.id));
    });
    res.json(result);
  });

  app.delete("/api/quotes/:id", async (req, res) => {
    await db.tx(async () => {
      const q = await load(Number(req.params.id));
      await lock(q.id);
      if (q.status !== "draft" || q.sentAt) fail(409, "Only an unsent draft can be deleted. Cancel this quote instead.");
      for (const t of ["quote_activity", "quote_items"]) await db.run(`DELETE FROM ${t} WHERE quote_id=?`, q.id);
      await db.run("DELETE FROM quotes WHERE id=?", q.id);
    });
    res.status(204).send();
  });

  app.post("/api/quotes/:id/invoice", async (req, res) => res.status(201).json(await createInvoice((await load(Number(req.params.id))).id, actor(res))));
  app.post("/api/quotes/:id/job", async (req, res) => res.status(201).json(await createJob((await load(Number(req.params.id))).id, req.body, actor(res))));
}
