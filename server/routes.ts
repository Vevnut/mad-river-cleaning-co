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
} from "@shared/schema";
import type {
  InsertCustomer, InsertContact, InsertProperty, InsertNote,
  InsertStaff, InsertJobTemplate, InsertServiceChecklist, InsertSchedule, InsertJob,
} from "@shared/schema";

// NOTE: drizzle-zod@0.7.1 + zod@4.4.3 infer enum-typed insert schema fields as
// a broken union (see SCHEMA.md). Runtime validation via `safeParse` below is
// fully correct; these `as InsertX` casts only bridge the zod-inferred type
// to the clean Drizzle-native `InsertX` type used by the storage layer.

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
  // Invoices — minimal read endpoint so Dashboard KPIs have a data source.
  // Full CRUD lands in Phase 3.
  // =========================================================================
  app.get("/api/invoices", async (_req, res) => {
    const data = await storage.getInvoices();
    res.json(data);
  });

  return httpServer;
}
