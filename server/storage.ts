import {
  customers, contacts, properties, staff, jobTemplates, serviceChecklists,
  schedules, jobs, invoices, invoiceItems, payments, notes, attachments, appSettings,
} from "@shared/schema";
import type {
  Customer, InsertCustomer,
  Contact, InsertContact,
  Property, InsertProperty,
  Staff, InsertStaff,
  JobTemplate, InsertJobTemplate,
  ServiceChecklist, InsertServiceChecklist,
  Schedule, InsertSchedule,
  Job, InsertJob,
  Invoice, InsertInvoice,
  InvoiceItem, InsertInvoiceItem,
  Payment, InsertPayment,
  Note, InsertNote,
  Attachment, InsertAttachment,
  AppSettings, InsertAppSettings,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, gte, lte, type SQL } from "drizzle-orm";

export interface JobFilter {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  propertyId?: number;
  jobType?: string;
}

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // --- customers (full CRUD, Phase 1) ---
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;

  // --- contacts (full CRUD, Phase 1) ---
  getContactsByCustomer(customerId: number): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(data: InsertContact): Promise<Contact>;
  updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;

  // --- properties (full CRUD, Phase 1) ---
  getProperties(): Promise<Property[]>;
  getProperty(id: number): Promise<Property | undefined>;
  getPropertiesByCustomer(customerId: number): Promise<Property[]>;
  createProperty(data: InsertProperty): Promise<Property>;
  updateProperty(id: number, data: Partial<InsertProperty>): Promise<Property | undefined>;
  deleteProperty(id: number): Promise<boolean>;

  // --- notes (full CRUD, Phase 1) ---
  getNotes(filter?: { customerId?: number; propertyId?: number; jobId?: number }): Promise<Note[]>;
  getNote(id: number): Promise<Note | undefined>;
  createNote(data: InsertNote): Promise<Note>;
  updateNote(id: number, data: Partial<InsertNote>): Promise<Note | undefined>;
  deleteNote(id: number): Promise<boolean>;

  // --- staff (scaffolded for Phase 2/3 — seed uses createStaff) ---
  getStaffList(): Promise<Staff[]>;
  getStaffMember(id: number): Promise<Staff | undefined>;
  createStaff(data: InsertStaff): Promise<Staff>;
  updateStaff(id: number, data: Partial<InsertStaff>): Promise<Staff | undefined>;
  deleteStaff(id: number): Promise<boolean>;

  // --- job_templates (scaffolded for Phase 2/3 — seed uses createJobTemplate) ---
  getJobTemplates(): Promise<JobTemplate[]>;
  getJobTemplate(id: number): Promise<JobTemplate | undefined>;
  createJobTemplate(data: InsertJobTemplate): Promise<JobTemplate>;
  updateJobTemplate(id: number, data: Partial<InsertJobTemplate>): Promise<JobTemplate | undefined>;
  deleteJobTemplate(id: number): Promise<boolean>;

  // --- service_checklists (scaffolded, Phase 2) ---
  getChecklistItemsByJob(jobId: number): Promise<ServiceChecklist[]>;
  createChecklistItem(data: InsertServiceChecklist): Promise<ServiceChecklist>;
  updateChecklistItem(id: number, data: Partial<InsertServiceChecklist>): Promise<ServiceChecklist | undefined>;
  deleteChecklistItem(id: number): Promise<boolean>;

  // --- schedules (scaffolded, Phase 2) ---
  getSchedules(): Promise<Schedule[]>;
  getSchedule(id: number): Promise<Schedule | undefined>;
  getSchedulesByProperty(propertyId: number): Promise<Schedule[]>;
  createSchedule(data: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: number, data: Partial<InsertSchedule>): Promise<Schedule | undefined>;
  deleteSchedule(id: number): Promise<boolean>;

  // --- jobs (full CRUD, Phase 2) ---
  getJobs(filter?: JobFilter): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  getJobsByProperty(propertyId: number): Promise<Job[]>;
  getJobsByCustomer(customerId: number): Promise<Job[]>;
  createJob(data: InsertJob): Promise<Job>;
  updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<boolean>;

  // --- invoices (scaffolded, Phase 3) ---
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByCustomer(customerId: number): Promise<Invoice[]>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<boolean>;

  // --- invoice_items (scaffolded, Phase 3) ---
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;
  createInvoiceItem(data: InsertInvoiceItem): Promise<InvoiceItem>;
  updateInvoiceItem(id: number, data: Partial<InsertInvoiceItem>): Promise<InvoiceItem | undefined>;
  deleteInvoiceItem(id: number): Promise<boolean>;

  // --- payments (scaffolded, Phase 3) ---
  getPaymentsByInvoice(invoiceId: number): Promise<Payment[]>;
  createPayment(data: InsertPayment): Promise<Payment>;
  deletePayment(id: number): Promise<boolean>;

  // --- attachments (scaffolded, Phase 2/3) ---
  getAttachments(entityType: string, entityId: number): Promise<Attachment[]>;
  createAttachment(data: InsertAttachment): Promise<Attachment>;
  deleteAttachment(id: number): Promise<boolean>;

  // --- app_settings (singleton, Phase 3) ---
  getSettings(): Promise<AppSettings>;
  updateSettings(data: Partial<InsertAppSettings>): Promise<AppSettings>;
}

export class DatabaseStorage implements IStorage {
  // ---------------- customers ----------------
  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).all();
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    return db.select().from(customers).where(eq(customers.id, id)).get();
  }
  async createCustomer(data: InsertCustomer): Promise<Customer> {
    return db.insert(customers).values(data).returning().get();
  }
  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    return db.update(customers).set(data).where(eq(customers.id, id)).returning().get();
  }
  async deleteCustomer(id: number): Promise<boolean> {
    return db.delete(customers).where(eq(customers.id, id)).run().changes > 0;
  }

  // ---------------- contacts ----------------
  async getContactsByCustomer(customerId: number): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.customerId, customerId)).all();
  }
  async getContact(id: number): Promise<Contact | undefined> {
    return db.select().from(contacts).where(eq(contacts.id, id)).get();
  }
  async createContact(data: InsertContact): Promise<Contact> {
    return db.insert(contacts).values(data).returning().get();
  }
  async updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined> {
    return db.update(contacts).set(data).where(eq(contacts.id, id)).returning().get();
  }
  async deleteContact(id: number): Promise<boolean> {
    return db.delete(contacts).where(eq(contacts.id, id)).run().changes > 0;
  }

  // ---------------- properties ----------------
  async getProperties(): Promise<Property[]> {
    return db.select().from(properties).all();
  }
  async getProperty(id: number): Promise<Property | undefined> {
    return db.select().from(properties).where(eq(properties.id, id)).get();
  }
  async getPropertiesByCustomer(customerId: number): Promise<Property[]> {
    return db.select().from(properties).where(eq(properties.customerId, customerId)).all();
  }
  async createProperty(data: InsertProperty): Promise<Property> {
    return db.insert(properties).values(data).returning().get();
  }
  async updateProperty(id: number, data: Partial<InsertProperty>): Promise<Property | undefined> {
    return db.update(properties).set(data).where(eq(properties.id, id)).returning().get();
  }
  async deleteProperty(id: number): Promise<boolean> {
    return db.delete(properties).where(eq(properties.id, id)).run().changes > 0;
  }

  // ---------------- notes ----------------
  async getNotes(filter?: { customerId?: number; propertyId?: number; jobId?: number }): Promise<Note[]> {
    if (filter?.customerId !== undefined) {
      return db.select().from(notes).where(eq(notes.customerId, filter.customerId)).all();
    }
    if (filter?.propertyId !== undefined) {
      return db.select().from(notes).where(eq(notes.propertyId, filter.propertyId)).all();
    }
    if (filter?.jobId !== undefined) {
      return db.select().from(notes).where(eq(notes.jobId, filter.jobId)).all();
    }
    return db.select().from(notes).all();
  }
  async getNote(id: number): Promise<Note | undefined> {
    return db.select().from(notes).where(eq(notes.id, id)).get();
  }
  async createNote(data: InsertNote): Promise<Note> {
    return db.insert(notes).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateNote(id: number, data: Partial<InsertNote>): Promise<Note | undefined> {
    return db.update(notes).set(data).where(eq(notes.id, id)).returning().get();
  }
  async deleteNote(id: number): Promise<boolean> {
    return db.delete(notes).where(eq(notes.id, id)).run().changes > 0;
  }

  // ---------------- staff ----------------
  async getStaffList(): Promise<Staff[]> {
    return db.select().from(staff).all();
  }
  async getStaffMember(id: number): Promise<Staff | undefined> {
    return db.select().from(staff).where(eq(staff.id, id)).get();
  }
  async createStaff(data: InsertStaff): Promise<Staff> {
    return db.insert(staff).values(data).returning().get();
  }
  async updateStaff(id: number, data: Partial<InsertStaff>): Promise<Staff | undefined> {
    return db.update(staff).set(data).where(eq(staff.id, id)).returning().get();
  }
  async deleteStaff(id: number): Promise<boolean> {
    return db.delete(staff).where(eq(staff.id, id)).run().changes > 0;
  }

  // ---------------- job_templates ----------------
  async getJobTemplates(): Promise<JobTemplate[]> {
    return db.select().from(jobTemplates).all();
  }
  async getJobTemplate(id: number): Promise<JobTemplate | undefined> {
    return db.select().from(jobTemplates).where(eq(jobTemplates.id, id)).get();
  }
  async createJobTemplate(data: InsertJobTemplate): Promise<JobTemplate> {
    return db.insert(jobTemplates).values(data).returning().get();
  }
  async updateJobTemplate(id: number, data: Partial<InsertJobTemplate>): Promise<JobTemplate | undefined> {
    return db.update(jobTemplates).set(data).where(eq(jobTemplates.id, id)).returning().get();
  }
  async deleteJobTemplate(id: number): Promise<boolean> {
    return db.delete(jobTemplates).where(eq(jobTemplates.id, id)).run().changes > 0;
  }

  // ---------------- service_checklists ----------------
  async getChecklistItemsByJob(jobId: number): Promise<ServiceChecklist[]> {
    return db.select().from(serviceChecklists).where(eq(serviceChecklists.jobId, jobId)).all();
  }
  async createChecklistItem(data: InsertServiceChecklist): Promise<ServiceChecklist> {
    return db.insert(serviceChecklists).values(data).returning().get();
  }
  async updateChecklistItem(id: number, data: Partial<InsertServiceChecklist>): Promise<ServiceChecklist | undefined> {
    return db.update(serviceChecklists).set(data).where(eq(serviceChecklists.id, id)).returning().get();
  }
  async deleteChecklistItem(id: number): Promise<boolean> {
    return db.delete(serviceChecklists).where(eq(serviceChecklists.id, id)).run().changes > 0;
  }

  // ---------------- schedules ----------------
  async getSchedules(): Promise<Schedule[]> {
    return db.select().from(schedules).all();
  }
  async getSchedule(id: number): Promise<Schedule | undefined> {
    return db.select().from(schedules).where(eq(schedules.id, id)).get();
  }
  async getSchedulesByProperty(propertyId: number): Promise<Schedule[]> {
    return db.select().from(schedules).where(eq(schedules.propertyId, propertyId)).all();
  }
  async createSchedule(data: InsertSchedule): Promise<Schedule> {
    return db.insert(schedules).values(data).returning().get();
  }
  async updateSchedule(id: number, data: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    return db.update(schedules).set(data).where(eq(schedules.id, id)).returning().get();
  }
  async deleteSchedule(id: number): Promise<boolean> {
    return db.delete(schedules).where(eq(schedules.id, id)).run().changes > 0;
  }

  // ---------------- jobs ----------------
  async getJobs(filter?: JobFilter): Promise<Job[]> {
    const conditions: SQL[] = [];
    if (filter?.status) conditions.push(eq(jobs.status, filter.status as any));
    if (filter?.dateFrom) conditions.push(gte(jobs.scheduledDate, filter.dateFrom));
    if (filter?.dateTo) conditions.push(lte(jobs.scheduledDate, filter.dateTo));
    if (filter?.propertyId !== undefined) conditions.push(eq(jobs.propertyId, filter.propertyId));
    if (filter?.jobType) conditions.push(eq(jobs.jobType, filter.jobType as any));

    if (conditions.length === 0) return db.select().from(jobs).all();
    return db.select().from(jobs).where(and(...conditions)).all();
  }
  async getJob(id: number): Promise<Job | undefined> {
    return db.select().from(jobs).where(eq(jobs.id, id)).get();
  }
  async getJobsByProperty(propertyId: number): Promise<Job[]> {
    return db.select().from(jobs).where(eq(jobs.propertyId, propertyId)).all();
  }
  async getJobsByCustomer(customerId: number): Promise<Job[]> {
    return db.select().from(jobs).where(eq(jobs.customerId, customerId)).all();
  }
  async createJob(data: InsertJob): Promise<Job> {
    return db.insert(jobs).values(data).returning().get();
  }
  async updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined> {
    return db.update(jobs).set(data).where(eq(jobs.id, id)).returning().get();
  }
  async deleteJob(id: number): Promise<boolean> {
    return db.delete(jobs).where(eq(jobs.id, id)).run().changes > 0;
  }

  // ---------------- invoices ----------------
  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).all();
  }
  async getInvoice(id: number): Promise<Invoice | undefined> {
    return db.select().from(invoices).where(eq(invoices.id, id)).get();
  }
  async getInvoicesByCustomer(customerId: number): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.customerId, customerId)).all();
  }
  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    return db.insert(invoices).values(data).returning().get();
  }
  async updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    return db.update(invoices).set(data).where(eq(invoices.id, id)).returning().get();
  }
  async deleteInvoice(id: number): Promise<boolean> {
    return db.delete(invoices).where(eq(invoices.id, id)).run().changes > 0;
  }

  // ---------------- invoice_items ----------------
  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).all();
  }
  async createInvoiceItem(data: InsertInvoiceItem): Promise<InvoiceItem> {
    return db.insert(invoiceItems).values(data).returning().get();
  }
  async updateInvoiceItem(id: number, data: Partial<InsertInvoiceItem>): Promise<InvoiceItem | undefined> {
    return db.update(invoiceItems).set(data).where(eq(invoiceItems.id, id)).returning().get();
  }
  async deleteInvoiceItem(id: number): Promise<boolean> {
    return db.delete(invoiceItems).where(eq(invoiceItems.id, id)).run().changes > 0;
  }

  // ---------------- payments ----------------
  async getPaymentsByInvoice(invoiceId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).all();
  }
  async createPayment(data: InsertPayment): Promise<Payment> {
    return db.insert(payments).values(data).returning().get();
  }
  async deletePayment(id: number): Promise<boolean> {
    return db.delete(payments).where(eq(payments.id, id)).run().changes > 0;
  }

  // ---------------- attachments ----------------
  async getAttachments(entityType: string, entityId: number): Promise<Attachment[]> {
    return db
      .select()
      .from(attachments)
      .where(eq(attachments.entityType, entityType as any))
      .all()
      .filter((a) => a.entityId === entityId);
  }
  async createAttachment(data: InsertAttachment): Promise<Attachment> {
    return db.insert(attachments).values({ ...data, uploadedAt: new Date().toISOString() }).returning().get();
  }
  async deleteAttachment(id: number): Promise<boolean> {
    return db.delete(attachments).where(eq(attachments.id, id)).run().changes > 0;
  }

  // ---------------- app_settings (singleton) ----------------
  async getSettings(): Promise<AppSettings> {
    const existing = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
    if (existing) return existing;
    return db.insert(appSettings).values({
      id: 1,
      businessName: "Ridgeline Cleaning Ops",
      businessAddress: "118 White Mountain Hwy, Conway, NH 03818",
      businessPhone: "603-555-0100",
      businessEmail: "office@ridgelinecleaningops.com",
      defaultTaxRate: 0.08,
      defaultPaymentTermsDays: 15,
      invoiceNumberPrefix: "INV",
      invoiceFooterNote: "Thank you for choosing Ridgeline Cleaning Ops. Payment due within terms noted above.",
    } as InsertAppSettings).returning().get();
  }
  async updateSettings(data: Partial<InsertAppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    return db.update(appSettings).set(data).where(eq(appSettings.id, current.id)).returning().get();
  }
}

export const storage = new DatabaseStorage();
