import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import {
  insertCustomerSchema,
  insertContactSchema,
  insertPropertySchema,
  insertNoteSchema,
} from "@shared/schema";
import type { InsertCustomer, InsertContact, InsertProperty, InsertNote } from "@shared/schema";

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
  // Staff — read-only list (used by Dashboard/Properties assignment displays).
  // Full CRUD + Settings UI lands in Phase 3.
  // =========================================================================
  app.get("/api/staff", async (_req, res) => {
    const data = await storage.getStaffList();
    res.json(data);
  });

  // =========================================================================
  // Job templates — read-only list (used by future Jobs/Scheduling pages).
  // Full CRUD + Settings UI lands in Phase 3.
  // =========================================================================
  app.get("/api/job-templates", async (_req, res) => {
    const data = await storage.getJobTemplates();
    res.json(data);
  });

  // =========================================================================
  // Jobs / Invoices — minimal read endpoints so Dashboard KPIs & future pages
  // have a real (currently empty) data source. Full CRUD lands in Phase 2/3.
  // =========================================================================
  app.get("/api/jobs", async (_req, res) => {
    const data = await storage.getJobs();
    res.json(data);
  });

  app.get("/api/invoices", async (_req, res) => {
    const data = await storage.getInvoices();
    res.json(data);
  });

  return httpServer;
}
