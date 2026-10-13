import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import {
  insertCustomerSchema,
  insertContactSchema,
  insertPropertySchema,
  insertNoteSchema,
  insertStaffSchema,
  insertJobTemplateSchema,
  insertServiceChecklistSchema,
  insertScheduleSchema,
  insertJobSchema,
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertPaymentSchema,
  insertAttachmentSchema,
  insertAppSettingsSchema,
  insertStaySchema,
} from "@shared/schema";
import type {
  InsertCustomer, InsertContact, InsertProperty, InsertNote,
  InsertStaff, InsertJobTemplate, InsertServiceChecklist, InsertSchedule, InsertJob,
  InsertInvoice, InsertInvoiceItem, InsertPayment, InsertAttachment, InsertAppSettings,
  InvoiceItem, InsertStay,
} from "@shared/schema";
import { computeInvoiceTotals, deriveInvoiceStatus, round2 } from "./invoice-utils";
import { renderInvoicePrintHtml } from "./invoice-print-template";
import { registerAuth, protect } from "./auth";
import { registerBilling, registerPublicBilling } from "./billing";
import { registerJobPhotos } from "./job-photos";
import { registerExpenses } from "./expenses";
import { registerSubcontractors } from "./subcontractors";
import { registerCalendar, registerPublicCalendar } from "./calendar";

// NOTE: drizzle-zod@0.7.1 + zod@4.4.3 infer enum-typed insert schema fields as
// a broken union (see SCHEMA.md). Runtime validation via `safeParse` below is
// fully correct; these `as InsertX` casts only bridge the zod-inferred type
// to the clean Drizzle-native `InsertX` type used by the storage layer.

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerAuth(app);
  registerPublicBilling(app);
  registerPublicCalendar(app);
  protect(app);
  registerBilling(app);
  registerJobPhotos(app);
  registerExpenses(app);
  registerSubcontractors(app);
  registerCalendar(app);
  // Normalize legacy fields without ever touching existing invoice snapshots.
  app.use("/api/properties", async (req, res, next) => {
    if (!["POST", "PATCH"].includes(req.method)) return next();
    const id = Number(req.path.slice(1));
    const old = id ? await storage.getProperty(id) : undefined;
    // Express 5 leaves req.body undefined when no JSON body is sent.
    const b = (req.body ??= {});
    if ("fullBathrooms" in b || "halfBathrooms" in b) {
      const full = b.fullBathrooms ?? old?.fullBathrooms ?? 0, half = b.halfBathrooms ?? old?.halfBathrooms ?? 0;
      if (!Number.isInteger(full) || !Number.isInteger(half) || full < 0 || half < 0)
        return res.status(400).json({ message: "Full and half bathrooms must be non-negative whole numbers." });
      b.fullBathrooms = full; b.halfBathrooms = half; b.bathrooms = full + half * 0.5;
    } else if (b.bathrooms != null && b.bathrooms >= 0 && Number.isInteger(b.bathrooms * 2)) {
      b.fullBathrooms = Math.floor(b.bathrooms); b.halfBathrooms = (b.bathrooms % 1) * 2;
    }
    if ("standardDepartureRate" in b) b.basePrice = b.standardDepartureRate ?? 0;
    else if ("basePrice" in b) b.standardDepartureRate = b.basePrice;
    if (b.customerId && !(await storage.getCustomer(b.customerId))) return res.status(400).json({ message: "Select an existing customer." });
    next();
  });
  app.use("/api/jobs", async (req, res, next) => {
    if (!["POST", "PATCH"].includes(req.method)) return next();
    const old = Number(req.path.slice(1)) ? await storage.getJob(Number(req.path.slice(1))) : undefined;
    const b = (req.body ??= {}), property = await storage.getProperty(b.propertyId ?? old?.propertyId ?? 0);
    if (!property) return res.status(400).json({ message: "Select an existing property." });
    if (b.customerId && b.customerId !== property.customerId) return res.status(400).json({ message: "Job owner must match property owner." });
    b.customerId = property.customerId;
    if (req.method === "POST" && !b.rateType) b.rateType = b.price == null ? "standard" : "custom";
    if (b.price == null && b.rateType) b.price = b.rateType === "owner" ? property.ownerRate ?? 0 : b.rateType === "standard" ? property.standardDepartureRate ?? 0 : 0;
    if (b.price != null && (typeof b.price !== "number" || !Number.isFinite(b.price) || b.price < 0)) return res.status(400).json({ message: "Job price cannot be negative." });
    next();
  });
  // =========================================================================
  // Customers — full CRUD (Phase 1)
  // =========================================================================
  app.get("/api/customers", async (_req, res) => {
    const data = await storage.getCustomers();
    res.json(data);
  });

  app.get("/api/customers/:id", async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post("/api/customers", async (req, res) => {
    const parsed = insertCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid customer data", errors: parsed.error.issues });
    }
    const customer = await storage.createCustomer(parsed.data as InsertCustomer);
    res.status(201).json(customer);
  });

  app.patch("/api/customers/:id", async (req, res) => {
    const parsed = insertCustomerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid customer data", errors: parsed.error.issues });
    }
    const customer = await storage.updateCustomer(Number(req.params.id), parsed.data as Partial<InsertCustomer>);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.delete("/api/customers/:id", async (req, res) => {
    const ok = await storage.deleteCustomer(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Customer not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Contacts — full CRUD (Phase 1)
  // =========================================================================
  app.get("/api/contacts", async (req, res) => {
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    if (!customerId) return res.status(400).json({ message: "customerId is required" });
    const data = await storage.getContactsByCustomer(customerId);
    res.json(data);
  });

  app.post("/api/contacts", async (req, res) => {
    const parsed = insertContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid contact data", errors: parsed.error.issues });
    }
    const contact = await storage.createContact(parsed.data as InsertContact);
    res.status(201).json(contact);
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    const parsed = insertContactSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid contact data", errors: parsed.error.issues });
    }
    const contact = await storage.updateContact(Number(req.params.id), parsed.data as Partial<InsertContact>);
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json(contact);
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    const ok = await storage.deleteContact(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Contact not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Properties — full CRUD (Phase 1)
  // =========================================================================
  app.get("/api/properties", async (req, res) => {
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const data = customerId
      ? await storage.getPropertiesByCustomer(customerId)
      : await storage.getProperties();
    res.json(data);
  });

  app.get("/api/properties/:id", async (req, res) => {
    const property = await storage.getProperty(Number(req.params.id));
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(property);
  });

  app.post("/api/properties", async (req, res) => {
    const parsed = insertPropertySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid property data", errors: parsed.error.issues });
    }
    const property = await storage.createProperty(parsed.data as InsertProperty);
    res.status(201).json(property);
  });

  app.patch("/api/properties/:id", async (req, res) => {
    const parsed = insertPropertySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid property data", errors: parsed.error.issues });
    }
    const property = await storage.updateProperty(Number(req.params.id), parsed.data as Partial<InsertProperty>);
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(property);
  });

  app.delete("/api/properties/:id", async (req, res) => {
    const ok = await storage.deleteProperty(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Property not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Notes — full CRUD (Phase 1)
  // =========================================================================
  app.get("/api/notes", async (req, res) => {
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : undefined;
    const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
    const data = await storage.getNotes({ customerId, propertyId, jobId });
    res.json(data);
  });

  app.post("/api/notes", async (req, res) => {
    const parsed = insertNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid note data", errors: parsed.error.issues });
    }
    const note = await storage.createNote(parsed.data as InsertNote);
    res.status(201).json(note);
  });

  app.patch("/api/notes/:id", async (req, res) => {
    const parsed = insertNoteSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid note data", errors: parsed.error.issues });
    }
    const note = await storage.updateNote(Number(req.params.id), parsed.data as Partial<InsertNote>);
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  });

  app.delete("/api/notes/:id", async (req, res) => {
    const ok = await storage.deleteNote(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Note not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Staff — full CRUD (Phase 2). Settings UI for role management lands in Phase 3.
  // =========================================================================
  app.get("/api/staff", async (_req, res) => {
    const data = await storage.getStaffList();
    res.json(data);
  });

  app.get("/api/staff/:id", async (req, res) => {
    const member = await storage.getStaffMember(Number(req.params.id));
    if (!member) return res.status(404).json({ message: "Staff member not found" });
    res.json(member);
  });

  app.post("/api/staff", async (req, res) => {
    const parsed = insertStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid staff data", errors: parsed.error.issues });
    }
    const member = await storage.createStaff(parsed.data as InsertStaff);
    res.status(201).json(member);
  });

  app.patch("/api/staff/:id", async (req, res) => {
    const parsed = insertStaffSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid staff data", errors: parsed.error.issues });
    }
    const member = await storage.updateStaff(Number(req.params.id), parsed.data as Partial<InsertStaff>);
    if (!member) return res.status(404).json({ message: "Staff member not found" });
    res.json(member);
  });

  app.delete("/api/staff/:id", async (req, res) => {
    const ok = await storage.deleteStaff(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Staff member not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Job templates — full CRUD (Phase 2). Settings UI for editing templates
  // lands in Phase 3, but the API is ready now for Jobs/Scheduling pages.
  // =========================================================================
  app.get("/api/job-templates", async (_req, res) => {
    const data = await storage.getJobTemplates();
    res.json(data);
  });

  app.get("/api/job-templates/:id", async (req, res) => {
    const template = await storage.getJobTemplate(Number(req.params.id));
    if (!template) return res.status(404).json({ message: "Job template not found" });
    res.json(template);
  });

  app.post("/api/job-templates", async (req, res) => {
    const parsed = insertJobTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid job template data", errors: parsed.error.issues });
    }
    const template = await storage.createJobTemplate(parsed.data as InsertJobTemplate);
    res.status(201).json(template);
  });

  app.patch("/api/job-templates/:id", async (req, res) => {
    const parsed = insertJobTemplateSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid job template data", errors: parsed.error.issues });
    }
    const template = await storage.updateJobTemplate(Number(req.params.id), parsed.data as Partial<InsertJobTemplate>);
    if (!template) return res.status(404).json({ message: "Job template not found" });
    res.json(template);
  });

  app.delete("/api/job-templates/:id", async (req, res) => {
    const ok = await storage.deleteJobTemplate(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Job template not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Schedules — full CRUD (Phase 2). Recurring rules that generate job instances.
  // =========================================================================
  app.get("/api/schedules", async (req, res) => {
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : undefined;
    const data = propertyId
      ? await storage.getSchedulesByProperty(propertyId)
      : await storage.getSchedules();
    res.json(data);
  });

  app.get("/api/schedules/:id", async (req, res) => {
    const schedule = await storage.getSchedule(Number(req.params.id));
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    res.json(schedule);
  });

  app.post("/api/schedules", async (req, res) => {
    const parsed = insertScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid schedule data", errors: parsed.error.issues });
    }
    const schedule = await storage.createSchedule(parsed.data as InsertSchedule);
    res.status(201).json(schedule);
  });

  app.patch("/api/schedules/:id", async (req, res) => {
    const parsed = insertScheduleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid schedule data", errors: parsed.error.issues });
    }
    const schedule = await storage.updateSchedule(Number(req.params.id), parsed.data as Partial<InsertSchedule>);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    res.json(schedule);
  });

  app.delete("/api/schedules/:id", async (req, res) => {
    const ok = await storage.deleteSchedule(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Schedule not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Jobs — full CRUD (Phase 2). List endpoint supports filtering by status,
  // date range, property, and job type via query params.
  // =========================================================================
  app.get("/api/jobs", async (req, res) => {
    const { status, dateFrom, dateTo, propertyId, jobType } = req.query;
    const data = await storage.getJobs({
      status: typeof status === "string" ? status : undefined,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined,
      propertyId: propertyId ? Number(propertyId) : undefined,
      jobType: typeof jobType === "string" ? jobType : undefined,
    });
    res.json(data);
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  });

  app.post("/api/jobs", async (req, res) => {
    const parsed = insertJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid job data", errors: parsed.error.issues });
    }
    const job = await storage.createJob(parsed.data as InsertJob);
    res.status(201).json(job);
  });

  app.patch("/api/jobs/:id", async (req, res) => {
    const parsed = insertJobSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid job data", errors: parsed.error.issues });
    }
    const job = await storage.updateJob(Number(req.params.id), parsed.data as Partial<InsertJob>);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    const ok = await storage.deleteJob(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Job not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Stays — guest bookings/reservations (full CRUD). Powers the Stays
  // calendar, which renders each stay as a multi-day bar per property.
  // =========================================================================
  app.get("/api/stays", async (req, res) => {
    const { propertyId, dateFrom, dateTo } = req.query;
    const data = await storage.getStays({
      propertyId: propertyId ? Number(propertyId) : undefined,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined,
    });
    res.json(data);
  });

  app.get("/api/stays/:id", async (req, res) => {
    const stay = await storage.getStay(Number(req.params.id));
    if (!stay) return res.status(404).json({ message: "Stay not found" });
    res.json(stay);
  });

  app.post("/api/stays", async (req, res) => {
    const parsed = insertStaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid stay data", errors: parsed.error.issues });
    }
    if (parsed.data.checkOutDate <= parsed.data.checkInDate) {
      return res.status(400).json({ message: "Check-out date must be after check-in date" });
    }
    const stay = await storage.createStay(parsed.data as InsertStay);
    res.status(201).json(stay);
  });

  app.patch("/api/stays/:id", async (req, res) => {
    const parsed = insertStaySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid stay data", errors: parsed.error.issues });
    }
    if (
      parsed.data.checkInDate && parsed.data.checkOutDate &&
      parsed.data.checkOutDate <= parsed.data.checkInDate
    ) {
      return res.status(400).json({ message: "Check-out date must be after check-in date" });
    }
    const stay = await storage.updateStay(Number(req.params.id), parsed.data as Partial<InsertStay>);
    if (!stay) return res.status(404).json({ message: "Stay not found" });
    res.json(stay);
  });

  app.delete("/api/stays/:id", async (req, res) => {
    const ok = await storage.deleteStay(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Stay not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Service checklists — full CRUD (Phase 2). Scoped to a single job.
  // =========================================================================
  app.get("/api/jobs/:jobId/checklist", async (req, res) => {
    const data = await storage.getChecklistItemsByJob(Number(req.params.jobId));
    res.json(data);
  });

  app.post("/api/checklist-items", async (req, res) => {
    const parsed = insertServiceChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid checklist item data", errors: parsed.error.issues });
    }
    const item = await storage.createChecklistItem(parsed.data as InsertServiceChecklist);
    res.status(201).json(item);
  });

  app.patch("/api/checklist-items/:id", async (req, res) => {
    const parsed = insertServiceChecklistSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid checklist item data", errors: parsed.error.issues });
    }
    const item = await storage.updateChecklistItem(Number(req.params.id), parsed.data as Partial<InsertServiceChecklist>);
    if (!item) return res.status(404).json({ message: "Checklist item not found" });
    res.json(item);
  });

  app.delete("/api/checklist-items/:id", async (req, res) => {
    const ok = await storage.deleteChecklistItem(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Checklist item not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Invoices — full CRUD (Phase 3). Totals are always recomputed server-side
  // from line items + fees/discount/tax so the client can never spoof them.
  // =========================================================================
  app.get("/api/invoices", async (req, res) => {
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const data = customerId
      ? await storage.getInvoicesByCustomer(customerId)
      : await storage.getInvoices();
    res.json(data);
  });

  app.get("/api/invoices/:id", async (req, res) => {
    const invoice = await storage.getInvoice(Number(req.params.id));
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  });

  // Create a manual invoice with an initial set of line items.
  app.post("/api/invoices", async (req, res) => {
    const { items, ...invoiceBody } = req.body ?? {};
    const parsed = insertInvoiceSchema.safeParse(invoiceBody);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid invoice data", errors: parsed.error.issues });
    }
    const itemRows: Array<{ description: string; itemType: string; quantity: number; unitPrice: number }> =
      Array.isArray(items) ? items : [];
    const computedItems = itemRows.map((it) => ({
      description: String(it.description ?? ""),
      itemType: String(it.itemType ?? "service"),
      quantity: Number(it.quantity ?? 1),
      unitPrice: Number(it.unitPrice ?? 0),
      amount: round2(Number(it.quantity ?? 1) * Number(it.unitPrice ?? 0)),
    }));
    const discountAmount = Number(parsed.data.discountAmount ?? 0);
    // NH has no sales tax — invoices never carry a tax line, regardless of client input.
    const taxRate = 0;
    const travelFee = Number(parsed.data.travelFee ?? 0);
    const rushFee = Number(parsed.data.rushFee ?? 0);
    const { subtotal, taxAmount, total } = computeInvoiceTotals({
      items: computedItems,
      discountAmount,
      taxRate,
      travelFee,
      rushFee,
    });
    const amountPaid = Number(parsed.data.amountPaid ?? 0);
    const status = deriveInvoiceStatus({
      currentStatus: String(parsed.data.status ?? "draft"),
      dueDate: String(parsed.data.dueDate),
      total,
      amountPaid,
    });

    const invoice = await storage.createInvoice({
      ...(parsed.data as InsertInvoice),
      subtotal,
      discountAmount,
      taxRate,
      taxAmount,
      travelFee,
      rushFee,
      total,
      amountPaid,
      status,
    });

    for (let i = 0; i < computedItems.length; i++) {
      await storage.createInvoiceItem({ ...computedItems[i], invoiceId: invoice.id, sortOrder: i } as InsertInvoiceItem);
    }

    res.status(201).json(invoice);
  });

  // Generate an invoice directly from a completed job — pre-fills customer +
  // one service line item from the job's price (spec requirement).
  app.post("/api/invoices/generate-from-job/:jobId", async (req, res) => {
    const job = await storage.getJob(Number(req.params.jobId));
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "completed") {
      return res.status(400).json({ message: "Only completed jobs can be invoiced" });
    }

    const settings = await storage.getSettings();
    const property = await storage.getProperty(job.propertyId);
    const issueDate = new Date().toISOString().slice(0, 10);
    const due = new Date();
    due.setDate(due.getDate() + settings.defaultPaymentTermsDays);
    const dueDate = due.toISOString().slice(0, 10);

    const existingInvoices = await storage.getInvoices();
    const nextNum = existingInvoices.length + 1;
    const invoiceNumber = `${settings.invoiceNumberPrefix}-${String(nextNum).padStart(4, "0")}-${job.id}`;

    const description = `${job.jobType.replace("_", " ")} clean — ${property?.name ?? "Property #" + job.propertyId}`;
    const items = [
      { description, itemType: "service" as const, quantity: 1, unitPrice: job.price, amount: round2(job.price) },
    ];
    const taxRate = 0; // NH has no sales tax
    const { subtotal, taxAmount, total } = computeInvoiceTotals({
      items, discountAmount: 0, taxRate, travelFee: 0, rushFee: 0,
    });

    const invoice = await storage.createInvoice({
      customerId: job.customerId,
      jobId: job.id,
      invoiceNumber,
      issueDate,
      dueDate,
      status: "draft",
      subtotal,
      discountAmount: 0,
      taxRate,
      taxAmount,
      travelFee: 0,
      rushFee: 0,
      total,
      amountPaid: 0,
      notes: null,
    } as InsertInvoice);

    await storage.createInvoiceItem({ ...items[0], invoiceId: invoice.id, sortOrder: 0 } as InsertInvoiceItem);
    await storage.updateJob(job.id, { status: "invoiced" });

    res.status(201).json(invoice);
  });

  // Recompute + patch an invoice's editable fields (discount/tax/fees/status/etc).
  app.patch("/api/invoices/:id", async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getInvoice(id);
    if (!existing) return res.status(404).json({ message: "Invoice not found" });

    const parsed = insertInvoiceSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid invoice data", errors: parsed.error.issues });
    }

    const merged = { ...existing, ...parsed.data };
    const items = await storage.getInvoiceItems(id);
    const { subtotal, taxAmount, total } = computeInvoiceTotals({
      items,
      discountAmount: Number(merged.discountAmount ?? 0),
      taxRate: Number(merged.taxRate ?? 0),
      travelFee: Number(merged.travelFee ?? 0),
      rushFee: Number(merged.rushFee ?? 0),
    });
    const amountPaid = Number(merged.amountPaid ?? 0);
    const status = deriveInvoiceStatus({
      currentStatus: String(merged.status ?? "draft"),
      dueDate: String(merged.dueDate),
      total,
      amountPaid,
    });

    const invoice = await storage.updateInvoice(id, {
      ...(parsed.data as Partial<InsertInvoice>),
      subtotal,
      taxAmount,
      total,
      status,
    });
    res.json(invoice);
  });

  // Invoice deletion lives in billing.ts (three-step confirmation, archived copy).

  // =========================================================================
  // Invoice items — full CRUD (Phase 3). Mutations recompute the parent
  // invoice's totals server-side.
  // =========================================================================
  async function recomputeInvoiceTotals(invoiceId: number) {
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) return;
    const items = await storage.getInvoiceItems(invoiceId);
    const { subtotal, taxAmount, total } = computeInvoiceTotals({
      items,
      discountAmount: invoice.discountAmount,
      taxRate: invoice.taxRate,
      travelFee: invoice.travelFee,
      rushFee: invoice.rushFee,
    });
    const status = deriveInvoiceStatus({
      currentStatus: invoice.status,
      dueDate: invoice.dueDate,
      total,
      amountPaid: invoice.amountPaid,
    });
    await storage.updateInvoice(invoiceId, { subtotal, taxAmount, total, status });
  }

  app.get("/api/invoices/:invoiceId/items", async (req, res) => {
    const data = await storage.getInvoiceItems(Number(req.params.invoiceId));
    res.json(data);
  });

  app.post("/api/invoice-items", async (req, res) => {
    const body = { ...req.body, amount: round2(Number(req.body.quantity ?? 1) * Number(req.body.unitPrice ?? 0)) };
    const parsed = insertInvoiceItemSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid invoice item data", errors: parsed.error.issues });
    }
    const item = await storage.createInvoiceItem(parsed.data as InsertInvoiceItem);
    await recomputeInvoiceTotals(item.invoiceId);
    res.status(201).json(item);
  });

  app.patch("/api/invoice-items/:id", async (req, res) => {
    const parsed = insertInvoiceItemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid invoice item data", errors: parsed.error.issues });
    }
    const patch: Partial<InvoiceItem> = { ...(parsed.data as Partial<InsertInvoiceItem>) };
    const item = await storage.updateInvoiceItem(Number(req.params.id), patch);
    if (!item) return res.status(404).json({ message: "Invoice item not found" });
    if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
      const recalced = await storage.updateInvoiceItem(item.id, {
        amount: round2(item.quantity * item.unitPrice),
      });
      await recomputeInvoiceTotals(item.invoiceId);
      return res.json(recalced);
    }
    await recomputeInvoiceTotals(item.invoiceId);
    res.json(item);
  });

  app.delete("/api/invoice-items/:id", async (req, res) => {
    const id = Number(req.params.id);
    // Need invoiceId before delete to recompute afterwards.
    const allInvoices = await storage.getInvoices();
    let invoiceId: number | undefined;
    for (const inv of allInvoices) {
      const its = await storage.getInvoiceItems(inv.id);
      if (its.some((it) => it.id === id)) { invoiceId = inv.id; break; }
    }
    const ok = await storage.deleteInvoiceItem(id);
    if (!ok) return res.status(404).json({ message: "Invoice item not found" });
    if (invoiceId) await recomputeInvoiceTotals(invoiceId);
    res.status(204).send();
  });

  // =========================================================================
  // Payments — full CRUD (Phase 3). Recording a payment updates the parent
  // invoice's amountPaid + derived status.
  // =========================================================================
  app.get("/api/invoices/:invoiceId/payments", async (req, res) => {
    const data = await storage.getPaymentsByInvoice(Number(req.params.invoiceId));
    res.json(data);
  });

  app.post("/api/payments", async (req, res) => {
    const parsed = insertPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payment data", errors: parsed.error.issues });
    }
    const payment = await storage.createPayment(parsed.data as InsertPayment);
    const invoice = await storage.getInvoice(payment.invoiceId);
    if (invoice) {
      const newAmountPaid = round2(invoice.amountPaid + payment.amount);
      const status = deriveInvoiceStatus({
        currentStatus: invoice.status === "draft" ? "sent" : invoice.status,
        dueDate: invoice.dueDate,
        total: invoice.total,
        amountPaid: newAmountPaid,
      });
      await storage.updateInvoice(invoice.id, { amountPaid: newAmountPaid, status });
    }
    res.status(201).json(payment);
  });

  app.delete("/api/payments/:id", async (req, res) => {
    const id = Number(req.params.id);
    const allInvoices = await storage.getInvoices();
    let target: { invoiceId: number; amount: number } | undefined;
    for (const inv of allInvoices) {
      const pays = await storage.getPaymentsByInvoice(inv.id);
      const p = pays.find((p) => p.id === id);
      if (p) { target = { invoiceId: inv.id, amount: p.amount }; break; }
    }
    const ok = await storage.deletePayment(id);
    if (!ok) return res.status(404).json({ message: "Payment not found" });
    if (target) {
      const invoice = await storage.getInvoice(target.invoiceId);
      if (invoice) {
        const newAmountPaid = round2(Math.max(0, invoice.amountPaid - target.amount));
        const status = deriveInvoiceStatus({
          currentStatus: newAmountPaid === 0 ? "sent" : invoice.status,
          dueDate: invoice.dueDate,
          total: invoice.total,
          amountPaid: newAmountPaid,
        });
        await storage.updateInvoice(invoice.id, { amountPaid: newAmountPaid, status });
      }
    }
    res.status(204).send();
  });

  // =========================================================================
  // Attachments — full CRUD (Phase 3). Placeholder file records only.
  // =========================================================================
  app.get("/api/attachments", async (req, res) => {
    const entityType = String(req.query.entityType ?? "");
    const entityId = Number(req.query.entityId ?? 0);
    if (!entityType || !entityId) return res.status(400).json({ message: "entityType and entityId are required" });
    const data = await storage.getAttachments(entityType, entityId);
    res.json(data);
  });

  app.post("/api/attachments", async (req, res) => {
    const parsed = insertAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid attachment data", errors: parsed.error.issues });
    }
    const attachment = await storage.createAttachment(parsed.data as InsertAttachment);
    res.status(201).json(attachment);
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    const ok = await storage.deleteAttachment(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Attachment not found" });
    res.status(204).send();
  });

  // =========================================================================
  // Printable invoice — server-rendered HTML, opened in a new tab and printed
  // via window.print() (browser "Save as PDF"), adapted from the reference
  // work-order-print.tsx + pdf-template.ts pattern.
  // =========================================================================
  app.get("/api/invoices/:id/print", async (req, res) => {
    const invoice = await storage.getInvoice(Number(req.params.id));
    if (!invoice) return res.status(404).send("Invoice not found");
    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer) return res.status(404).send("Customer not found");
    const items = await storage.getInvoiceItems(invoice.id);
    const settings = await storage.getSettings();

    const html = renderInvoicePrintHtml({
      invoice,
      customer,
      items,
      business: {
        businessName: settings.businessName,
        businessAddress: settings.businessAddress,
        businessPhone: settings.businessPhone,
        businessEmail: settings.businessEmail,
        invoiceFooterNote: settings.invoiceFooterNote,
      },
    });
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  // =========================================================================
  // App settings — singleton (Phase 3). Business info + invoice defaults.
  // =========================================================================
  app.get("/api/settings", async (_req, res) => {
    const settings = await storage.getSettings();
    res.json(settings);
  });

  app.patch("/api/settings", async (req, res) => {
    const parsed = insertAppSettingsSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid settings data", errors: parsed.error.issues });
    }
    const settings = await storage.updateSettings(parsed.data as Partial<InsertAppSettings>);
    res.json(settings);
  });

  return httpServer;
}
