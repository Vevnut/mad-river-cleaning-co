import {
  customers, contacts, properties, staff, jobTemplates, serviceChecklists,
  schedules, jobs, invoices, invoiceItems, payments, notes, attachments, appSettings, stays,
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
  Stay, InsertStay,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { db as sql, getPool } from "./db";
import { eq, and, gte, lte, type SQL } from "drizzle-orm";

export interface JobFilter {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  propertyId?: number;
  jobType?: string;
}

export interface StayFilter {
  propertyId?: number;
  // Overlap filter: any stay whose range intersects [dateFrom, dateTo].
  dateFrom?: string;
  dateTo?: string;
}

// Thrown when a delete is blocked because dependent records still reference
// the target row (e.g. a customer that still has properties/jobs/invoices).
// The Express error middleware in server/index.ts reads `.status` and
// `.message` off any thrown error, so this surfaces as a clean 409 with a
// human-readable explanation instead of a raw SQLITE_CONSTRAINT_FOREIGNKEY
// 500.
export class DeleteConflictError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = "DeleteConflictError";
  }
}

// Drizzle over the same Postgres pool the raw-SQL modules use (server/db.ts).
export const db = drizzle(getPool());

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

  // --- stays (guest bookings, Stays calendar) ---
  getStays(filter?: StayFilter): Promise<Stay[]>;
  getStay(id: number): Promise<Stay | undefined>;
  getStaysByProperty(propertyId: number): Promise<Stay[]>;
  createStay(data: InsertStay): Promise<Stay>;
  updateStay(id: number, data: Partial<InsertStay>): Promise<Stay | undefined>;
  deleteStay(id: number): Promise<boolean>;

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
    return db.select().from(customers);
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    return (await db.select().from(customers).where(eq(customers.id, id)))[0];
  }
  async createCustomer(data: InsertCustomer): Promise<Customer> {
    return (await db.insert(customers).values(data).returning())[0];
  }
  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    return (await db.update(customers).set(data).where(eq(customers.id, id)).returning())[0];
  }
  async deleteCustomer(id: number): Promise<boolean> {
    const [propertyCount, jobCount, invoiceCount] = [
      (await db.select().from(properties).where(eq(properties.customerId, id))).length,
      (await db.select().from(jobs).where(eq(jobs.customerId, id))).length,
      (await db.select().from(invoices).where(eq(invoices.customerId, id))).length,
    ];
    if (propertyCount > 0 || jobCount > 0 || invoiceCount > 0) {
      const parts = [
        propertyCount > 0 ? `${propertyCount} propert${propertyCount === 1 ? "y" : "ies"}` : null,
        jobCount > 0 ? `${jobCount} job${jobCount === 1 ? "" : "s"}` : null,
        invoiceCount > 0 ? `${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      throw new DeleteConflictError(
        `Can't delete this customer — they still have ${parts.join(", ")}. Delete or reassign those first.`,
      );
    }
    // Contacts and notes are exclusively owned by the customer, so they're
    // safe to clear out automatically.
    await db.delete(contacts).where(eq(contacts.customerId, id));
    await db.delete(notes).where(eq(notes.customerId, id));
    return ((await db.delete(customers).where(eq(customers.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- contacts ----------------
  async getContactsByCustomer(customerId: number): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.customerId, customerId));
  }
  async getContact(id: number): Promise<Contact | undefined> {
    return (await db.select().from(contacts).where(eq(contacts.id, id)))[0];
  }
  async createContact(data: InsertContact): Promise<Contact> {
    return (await db.insert(contacts).values(data).returning())[0];
  }
  async updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined> {
    return (await db.update(contacts).set(data).where(eq(contacts.id, id)).returning())[0];
  }
  async deleteContact(id: number): Promise<boolean> {
    return ((await db.delete(contacts).where(eq(contacts.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- properties ----------------
  async getProperties(): Promise<Property[]> {
    return db.select().from(properties);
  }
  async getProperty(id: number): Promise<Property | undefined> {
    return (await db.select().from(properties).where(eq(properties.id, id)))[0];
  }
  async getPropertiesByCustomer(customerId: number): Promise<Property[]> {
    return db.select().from(properties).where(eq(properties.customerId, customerId));
  }
  async createProperty(data: InsertProperty): Promise<Property> {
    return (await db.insert(properties).values(data).returning())[0];
  }
  async updateProperty(id: number, data: Partial<InsertProperty>): Promise<Property | undefined> {
    return (await db.update(properties).set(data).where(eq(properties.id, id)).returning())[0];
  }
  async deleteProperty(id: number): Promise<boolean> {
    const jobCount = (await db.select().from(jobs).where(eq(jobs.propertyId, id))).length;
    const scheduleCount = (await db.select().from(schedules).where(eq(schedules.propertyId, id))).length;
    if (jobCount > 0 || scheduleCount > 0) {
      const parts = [
        jobCount > 0 ? `${jobCount} job${jobCount === 1 ? "" : "s"}` : null,
        scheduleCount > 0 ? `${scheduleCount} recurring schedule${scheduleCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      throw new DeleteConflictError(
        `Can't delete this property — it still has ${parts.join(", ")}. Delete or reassign those first.`,
      );
    }
    await db.delete(notes).where(eq(notes.propertyId, id));
    // Expenses are tax records: keep them, just unlink the property.
    await sql.run("UPDATE expenses SET property_id=NULL WHERE property_id=?", id);
    return ((await db.delete(properties).where(eq(properties.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- notes ----------------
  async getNotes(filter?: { customerId?: number; propertyId?: number; jobId?: number }): Promise<Note[]> {
    if (filter?.customerId !== undefined) {
      return db.select().from(notes).where(eq(notes.customerId, filter.customerId));
    }
    if (filter?.propertyId !== undefined) {
      return db.select().from(notes).where(eq(notes.propertyId, filter.propertyId));
    }
    if (filter?.jobId !== undefined) {
      return db.select().from(notes).where(eq(notes.jobId, filter.jobId));
    }
    return db.select().from(notes);
  }
  async getNote(id: number): Promise<Note | undefined> {
    return (await db.select().from(notes).where(eq(notes.id, id)))[0];
  }
  async createNote(data: InsertNote): Promise<Note> {
    return (await db.insert(notes).values({ ...data, createdAt: new Date().toISOString() }).returning())[0];
  }
  async updateNote(id: number, data: Partial<InsertNote>): Promise<Note | undefined> {
    return (await db.update(notes).set(data).where(eq(notes.id, id)).returning())[0];
  }
  async deleteNote(id: number): Promise<boolean> {
    return ((await db.delete(notes).where(eq(notes.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- staff ----------------
  async getStaffList(): Promise<Staff[]> {
    return db.select().from(staff);
  }
  async getStaffMember(id: number): Promise<Staff | undefined> {
    return (await db.select().from(staff).where(eq(staff.id, id)))[0];
  }
  async createStaff(data: InsertStaff): Promise<Staff> {
    return (await db.insert(staff).values(data).returning())[0];
  }
  async updateStaff(id: number, data: Partial<InsertStaff>): Promise<Staff | undefined> {
    return (await db.update(staff).set(data).where(eq(staff.id, id)).returning())[0];
  }
  async deleteStaff(id: number): Promise<boolean> {
    // Staff assignments are nullable everywhere they're referenced, so a
    // departing staff member shouldn't be blocked by their job history —
    // unassign them instead of deleting or blocking.
    await db.update(jobs).set({ assignedStaffId: null }).where(eq(jobs.assignedStaffId, id));
    await db.update(schedules).set({ assignedStaffId: null }).where(eq(schedules.assignedStaffId, id));
    await db.update(notes).set({ authorStaffId: null }).where(eq(notes.authorStaffId, id));
    return ((await db.delete(staff).where(eq(staff.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- job_templates ----------------
  async getJobTemplates(): Promise<JobTemplate[]> {
    return db.select().from(jobTemplates);
  }
  async getJobTemplate(id: number): Promise<JobTemplate | undefined> {
    return (await db.select().from(jobTemplates).where(eq(jobTemplates.id, id)))[0];
  }
  async createJobTemplate(data: InsertJobTemplate): Promise<JobTemplate> {
    return (await db.insert(jobTemplates).values(data).returning())[0];
  }
  async updateJobTemplate(id: number, data: Partial<InsertJobTemplate>): Promise<JobTemplate | undefined> {
    return (await db.update(jobTemplates).set(data).where(eq(jobTemplates.id, id)).returning())[0];
  }
  async deleteJobTemplate(id: number): Promise<boolean> {
    await db.update(jobs).set({ jobTemplateId: null }).where(eq(jobs.jobTemplateId, id));
    await db.update(schedules).set({ jobTemplateId: null }).where(eq(schedules.jobTemplateId, id));
    return ((await db.delete(jobTemplates).where(eq(jobTemplates.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- service_checklists ----------------
  async getChecklistItemsByJob(jobId: number): Promise<ServiceChecklist[]> {
    return db.select().from(serviceChecklists).where(eq(serviceChecklists.jobId, jobId));
  }
  async createChecklistItem(data: InsertServiceChecklist): Promise<ServiceChecklist> {
    return (await db.insert(serviceChecklists).values(data).returning())[0];
  }
  async updateChecklistItem(id: number, data: Partial<InsertServiceChecklist>): Promise<ServiceChecklist | undefined> {
    return (await db.update(serviceChecklists).set(data).where(eq(serviceChecklists.id, id)).returning())[0];
  }
  async deleteChecklistItem(id: number): Promise<boolean> {
    return ((await db.delete(serviceChecklists).where(eq(serviceChecklists.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- schedules ----------------
  async getSchedules(): Promise<Schedule[]> {
    return db.select().from(schedules);
  }
  async getSchedule(id: number): Promise<Schedule | undefined> {
    return (await db.select().from(schedules).where(eq(schedules.id, id)))[0];
  }
  async getSchedulesByProperty(propertyId: number): Promise<Schedule[]> {
    return db.select().from(schedules).where(eq(schedules.propertyId, propertyId));
  }
  async createSchedule(data: InsertSchedule): Promise<Schedule> {
    return (await db.insert(schedules).values(data).returning())[0];
  }
  async updateSchedule(id: number, data: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    return (await db.update(schedules).set(data).where(eq(schedules.id, id)).returning())[0];
  }
  async deleteSchedule(id: number): Promise<boolean> {
    await db.update(jobs).set({ scheduleId: null }).where(eq(jobs.scheduleId, id));
    return ((await db.delete(schedules).where(eq(schedules.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- jobs ----------------
  async getJobs(filter?: JobFilter): Promise<Job[]> {
    const conditions: SQL[] = [];
    if (filter?.status) conditions.push(eq(jobs.status, filter.status as any));
    if (filter?.dateFrom) conditions.push(gte(jobs.scheduledDate, filter.dateFrom));
    if (filter?.dateTo) conditions.push(lte(jobs.scheduledDate, filter.dateTo));
    if (filter?.propertyId !== undefined) conditions.push(eq(jobs.propertyId, filter.propertyId));
    if (filter?.jobType) conditions.push(eq(jobs.jobType, filter.jobType as any));

    if (conditions.length === 0) return db.select().from(jobs);
    return db.select().from(jobs).where(and(...conditions));
  }
  async getJob(id: number): Promise<Job | undefined> {
    return (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
  }
  async getJobsByProperty(propertyId: number): Promise<Job[]> {
    return db.select().from(jobs).where(eq(jobs.propertyId, propertyId));
  }
  async getJobsByCustomer(customerId: number): Promise<Job[]> {
    return db.select().from(jobs).where(eq(jobs.customerId, customerId));
  }
  async createJob(data: InsertJob): Promise<Job> {
    return (await db.insert(jobs).values(data).returning())[0];
  }
  async updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined> {
    return (await db.update(jobs).set(data).where(eq(jobs.id, id)).returning())[0];
  }
  async deleteJob(id: number): Promise<boolean> {
    // Checklist items only ever exist to serve their job, so they cascade.
    // Invoices/notes are independent records — unlink rather than delete or
    // block, so a job's billing/history isn't lost when the job itself is
    // removed.
    // Damage/walkthrough photos are records worth keeping: never delete them silently.
    const photoCount = Number((await sql.get("SELECT count(*) n FROM job_photos WHERE job_id=?", id))!.n);
    if (photoCount > 0)
      throw new DeleteConflictError(`Can't delete this job — it has ${photoCount} photo${photoCount === 1 ? "" : "s"}. Delete the photos first.`);
    await db.delete(serviceChecklists).where(eq(serviceChecklists.jobId, id));
    await db.update(invoices).set({ jobId: null }).where(eq(invoices.jobId, id));
    await db.update(notes).set({ jobId: null }).where(eq(notes.jobId, id));
    await sql.run("UPDATE expenses SET job_id=NULL WHERE job_id=?", id);
    // Subcontractor payments are money records: keep them, just unlink the job.
    await sql.run("UPDATE subcontractor_payments SET job_id=NULL WHERE job_id=?", id);
    await sql.run("DELETE FROM job_subcontractors WHERE job_id=?", id);
    return ((await db.delete(jobs).where(eq(jobs.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- stays ----------------
  async getStays(filter?: StayFilter): Promise<Stay[]> {
    const conditions: SQL[] = [];
    if (filter?.propertyId !== undefined) conditions.push(eq(stays.propertyId, filter.propertyId));
    // Range-overlap: a stay [checkIn, checkOut] intersects the requested
    // window [dateFrom, dateTo] when checkIn <= dateTo AND checkOut >= dateFrom.
    if (filter?.dateTo) conditions.push(lte(stays.checkInDate, filter.dateTo));
    if (filter?.dateFrom) conditions.push(gte(stays.checkOutDate, filter.dateFrom));

    if (conditions.length === 0) return db.select().from(stays);
    return db.select().from(stays).where(and(...conditions));
  }
  async getStay(id: number): Promise<Stay | undefined> {
    return (await db.select().from(stays).where(eq(stays.id, id)))[0];
  }
  async getStaysByProperty(propertyId: number): Promise<Stay[]> {
    return db.select().from(stays).where(eq(stays.propertyId, propertyId));
  }
  async createStay(data: InsertStay): Promise<Stay> {
    return (await db.insert(stays).values(data).returning())[0];
  }
  async updateStay(id: number, data: Partial<InsertStay>): Promise<Stay | undefined> {
    return (await db.update(stays).set(data).where(eq(stays.id, id)).returning())[0];
  }
  async deleteStay(id: number): Promise<boolean> {
    return ((await db.delete(stays).where(eq(stays.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- invoices ----------------
  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices);
  }
  async getInvoice(id: number): Promise<Invoice | undefined> {
    return (await db.select().from(invoices).where(eq(invoices.id, id)))[0];
  }
  async getInvoicesByCustomer(customerId: number): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.customerId, customerId));
  }
  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    return (await db.insert(invoices).values(data).returning())[0];
  }
  async updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    return (await db.update(invoices).set(data).where(eq(invoices.id, id)).returning())[0];
  }
  async deleteInvoice(id: number): Promise<boolean> {
    // Line items and payments only ever exist to serve their invoice, so
    // they cascade automatically.
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await db.delete(payments).where(eq(payments.invoiceId, id));
    return ((await db.delete(invoices).where(eq(invoices.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- invoice_items ----------------
  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }
  async createInvoiceItem(data: InsertInvoiceItem): Promise<InvoiceItem> {
    return (await db.insert(invoiceItems).values(data).returning())[0];
  }
  async updateInvoiceItem(id: number, data: Partial<InsertInvoiceItem>): Promise<InvoiceItem | undefined> {
    return (await db.update(invoiceItems).set(data).where(eq(invoiceItems.id, id)).returning())[0];
  }
  async deleteInvoiceItem(id: number): Promise<boolean> {
    return ((await db.delete(invoiceItems).where(eq(invoiceItems.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- payments ----------------
  async getPaymentsByInvoice(invoiceId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  }
  async createPayment(data: InsertPayment): Promise<Payment> {
    return (await db.insert(payments).values(data).returning())[0];
  }
  async deletePayment(id: number): Promise<boolean> {
    return ((await db.delete(payments).where(eq(payments.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- attachments ----------------
  async getAttachments(entityType: string, entityId: number): Promise<Attachment[]> {
    return (await db
      .select()
      .from(attachments)
      .where(eq(attachments.entityType, entityType as any)))
      .filter((a) => a.entityId === entityId);
  }
  async createAttachment(data: InsertAttachment): Promise<Attachment> {
    return (await db.insert(attachments).values({ ...data, uploadedAt: new Date().toISOString() }).returning())[0];
  }
  async deleteAttachment(id: number): Promise<boolean> {
    return ((await db.delete(attachments).where(eq(attachments.id, id))).rowCount ?? 0) > 0;
  }

  // ---------------- app_settings (singleton) ----------------
  async getSettings(): Promise<AppSettings> {
    const existing = (await db.select().from(appSettings).where(eq(appSettings.id, 1)))[0];
    if (existing) return existing;
    return (await db.insert(appSettings).values({
      id: 1,
      businessName: "Mad River Cleaning Co.",
      businessAddress: "Thornton, NH",
      businessPhone: "(603) 707-9205",
      businessEmail: "madrivercleaningco@gmail.com",
      defaultTaxRate: 0.08,
      defaultPaymentTermsDays: 15,
      invoiceNumberPrefix: "INV",
      invoiceFooterNote: "Thank you for choosing Mad River Cleaning Co. Payment due within terms noted above.",
    } as InsertAppSettings).returning())[0];
  }
  async updateSettings(data: Partial<InsertAppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    return (await db.update(appSettings).set(data).where(eq(appSettings.id, current.id)).returning())[0];
  }
}

export const storage = new DatabaseStorage();
