import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ============================================================================
 * Mad River Cleaning Co. — Data Model
 * SQLite now (better-sqlite3 + Drizzle), designed to map 1:1 to Postgres later.
 * JSON list columns (defaultChecklist, beforePhotos, afterPhotos) are stored
 * as TEXT and JSON.stringify/parse'd in application code — see SCHEMA.md.
 * ============================================================================ */

// ---------------------------------------------------------------------------
// 1. customers
// ---------------------------------------------------------------------------
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  companyName: text("company_name"),
  customerType: text("customer_type", { enum: ["individual", "company"] }).notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  altPhone: text("alt_phone"),
  preferredContact: text("preferred_contact", { enum: ["email", "phone", "text"] }).notNull(),
  billingAddressLine1: text("billing_address_line1").notNull(),
  billingAddressLine2: text("billing_address_line2"),
  billingCity: text("billing_city").notNull(),
  billingState: text("billing_state").notNull(),
  billingZip: text("billing_zip").notNull(),
  notes: text("notes"),
  taxExempt: integer("tax_exempt", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomer = typeof customers.$inferInsert;
export type Customer = typeof customers.$inferSelect;

// ---------------------------------------------------------------------------
// 2. contacts
// ---------------------------------------------------------------------------
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export type InsertContact = typeof contacts.$inferInsert;
export type Contact = typeof contacts.$inferSelect;

// ---------------------------------------------------------------------------
// 3. properties
// ---------------------------------------------------------------------------
export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  name: text("name").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  unitType: text("unit_type", { enum: ["house", "condo", "cabin", "apartment", "cottage"] }).notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: real("bathrooms").notNull(),
  fullBathrooms: integer("full_bathrooms"),
  halfBathrooms: integer("half_bathrooms"),
  legacyTotalBathrooms: real("legacy_total_bathrooms"),
  standardDepartureRate: real("standard_departure_rate"),
  standardDepartureRateName: text("standard_departure_rate_name"),
  ownerRate: real("owner_rate"),
  ownerRateName: text("owner_rate_name"),
  invoiceNotes: text("invoice_notes"),
  maxOccupancy: integer("max_occupancy").notNull(),
  checkInTime: text("check_in_time").notNull(),
  checkOutTime: text("check_out_time").notNull(),
  entryInstructions: text("entry_instructions").notNull(),
  accessNotes: text("access_notes"),
  supplyNotes: text("supply_notes"),
  cleaningFrequency: text("cleaning_frequency", {
    enum: ["weekly", "biweekly", "monthly", "turnover", "one_time"],
  }).notNull(),
  basePrice: real("base_price").notNull(),
  photoUrl: text("photo_url"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, legacyTotalBathrooms: true }).extend({
  bathrooms: z.number().min(0), basePrice: z.number().min(0),
  fullBathrooms: z.number().int().min(0).nullable().optional(),
  halfBathrooms: z.number().int().min(0).nullable().optional(),
  standardDepartureRate: z.number().min(0).nullable().optional(),
  ownerRate: z.number().min(0).nullable().optional(),
});
export type InsertProperty = typeof properties.$inferInsert;
export type Property = typeof properties.$inferSelect;

// ---------------------------------------------------------------------------
// 4. staff
// ---------------------------------------------------------------------------
export const staff = sqliteTable("staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "office", "cleaner"] }).notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  colorTag: text("color_tag").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const insertStaffSchema = createInsertSchema(staff).omit({ id: true });
export type InsertStaff = typeof staff.$inferInsert;
export type Staff = typeof staff.$inferSelect;

// ---------------------------------------------------------------------------
// 5. job_templates
// ---------------------------------------------------------------------------
export const jobTemplates = sqliteTable("job_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  jobType: text("job_type", {
    enum: ["turnover", "deep_clean", "inspection", "one_time", "recurring", "custom"],
  }).notNull(),
  defaultDurationMinutes: integer("default_duration_minutes").notNull(),
  defaultPrice: real("default_price").notNull(),
  defaultChecklist: text("default_checklist").notNull(), // JSON string array
  description: text("description"),
});

export const insertJobTemplateSchema = createInsertSchema(jobTemplates).omit({ id: true });
export type InsertJobTemplate = typeof jobTemplates.$inferInsert;
export type JobTemplate = typeof jobTemplates.$inferSelect;

// ---------------------------------------------------------------------------
// 6. service_checklists
// ---------------------------------------------------------------------------
export const serviceChecklists = sqliteTable("service_checklists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  label: text("label").notNull(),
  isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertServiceChecklistSchema = createInsertSchema(serviceChecklists).omit({ id: true });
export type InsertServiceChecklist = typeof serviceChecklists.$inferInsert;
export type ServiceChecklist = typeof serviceChecklists.$inferSelect;

// ---------------------------------------------------------------------------
// 7. schedules
// ---------------------------------------------------------------------------
export const schedules = sqliteTable("schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").notNull().references(() => properties.id),
  jobTemplateId: integer("job_template_id").references(() => jobTemplates.id),
  frequency: text("frequency", { enum: ["weekly", "biweekly", "monthly", "custom"] }).notNull(),
  dayOfWeek: integer("day_of_week"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  assignedStaffId: integer("assigned_staff_id").references(() => staff.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true });
export type InsertSchedule = typeof schedules.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;

// ---------------------------------------------------------------------------
// 8. jobs
// ---------------------------------------------------------------------------
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").notNull().references(() => properties.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  scheduleId: integer("schedule_id").references(() => schedules.id),
  jobTemplateId: integer("job_template_id").references(() => jobTemplates.id),
  jobType: text("job_type", {
    enum: ["turnover", "deep_clean", "inspection", "one_time", "custom", "recurring"],
  }).notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  assignedStaffId: integer("assigned_staff_id").references(() => staff.id),
  status: text("status", {
    enum: ["scheduled", "in_progress", "completed", "invoiced", "canceled"],
  }).notNull().default("scheduled"),
  internalNotes: text("internal_notes"),
  customerNotes: text("customer_notes"),
  damageNotes: text("damage_notes"),
  price: real("price").notNull(),
  rateType: text("rate_type", { enum: ["standard", "owner", "custom"] }).notNull().default("custom"),
  beforePhotos: text("before_photos").notNull().default("[]"), // JSON string array
  afterPhotos: text("after_photos").notNull().default("[]"), // JSON string array
  completedAt: text("completed_at"),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true });
export type InsertJob = typeof jobs.$inferInsert;
export type Job = typeof jobs.$inferSelect;

// ---------------------------------------------------------------------------
// 9. invoices
// ---------------------------------------------------------------------------
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  jobId: integer("job_id").references(() => jobs.id),
  propertyId: integer("property_id").references(() => properties.id),
  rateType: text("rate_type", { enum: ["standard", "owner", "custom"] }).notNull().default("custom"),
  propertyAddress: text("property_address"),
  customerSnapshot: text("customer_snapshot"),
  internalNotes: text("internal_notes"),
  sentAt: text("sent_at"),
  viewedAt: text("viewed_at"),
  paidAt: text("paid_at"),
  publicToken: text("public_token"),
  publicEnabled: integer("public_enabled", { mode: "boolean" }).notNull().default(false),
  requestKey: text("request_key"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
  invoiceNumber: text("invoice_number").notNull().unique(),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status", {
    enum: ["draft", "sent", "viewed", "paid", "partial", "overdue", "canceled"],
  }).notNull().default("draft"),
  subtotal: real("subtotal").notNull().default(0),
  discountAmount: real("discount_amount").notNull().default(0),
  taxRate: real("tax_rate").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  travelFee: real("travel_fee").notNull().default(0),
  rushFee: real("rush_fee").notNull().default(0),
  total: real("total").notNull().default(0),
  amountPaid: real("amount_paid").notNull().default(0),
  notes: text("notes"),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true });
export type InsertInvoice = typeof invoices.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;

// ---------------------------------------------------------------------------
// 9b. stays — guest bookings/reservations at a property (Airbnb/VRBO/direct
// etc.). Distinct from `jobs`: a stay is when a guest occupies the property;
// turnover-clean jobs get scheduled around a stay's check-out date. Rendered
// on the Stays calendar as a multi-day bar spanning check-in \u2192 check-out.
// ---------------------------------------------------------------------------
export const stays = sqliteTable("stays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").notNull().references(() => properties.id),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone"),
  guestCount: integer("guest_count"),
  platform: text("platform", {
    enum: ["airbnb", "vrbo", "booking_com", "direct", "other"],
  }).notNull().default("airbnb"),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  status: text("status", { enum: ["confirmed", "tentative", "canceled"] }).notNull().default("confirmed"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertStaySchema = createInsertSchema(stays).omit({ id: true, createdAt: true });
export type InsertStay = typeof stays.$inferInsert;
export type Stay = typeof stays.$inferSelect;

// ---------------------------------------------------------------------------
// 10. invoice_items
// ---------------------------------------------------------------------------
export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  description: text("description").notNull(),
  itemType: text("item_type", {
    enum: ["service", "labor", "supplies", "addon", "discount", "fee"],
  }).notNull(),
  quantity: real("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  sourcePropertyServiceId: integer("source_property_service_id"),
  descriptionSnapshot: text("description_snapshot"),
  isAutoAdded: integer("is_auto_added", { mode: "boolean" }).notNull().default(false),
  lineItemType: text("line_item_type").notNull().default("manual"),
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;

// ---------------------------------------------------------------------------
// 11. payments
// ---------------------------------------------------------------------------
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["card", "cash", "check", "ach", "venmo", "zelle", "bank_transfer", "manual_card", "other"] }).notNull(),
  paidDate: text("paid_date").notNull(),
  reference: text("reference"),
  provider: text("provider"),
  providerTransactionId: text("provider_transaction_id"),
  note: text("note"),
  status: text("status").notNull().default("succeeded"),
  requestKey: text("request_key"),
  createdAt: text("created_at"),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true });
export type InsertPayment = typeof payments.$inferInsert;
export type Payment = typeof payments.$inferSelect;

// ---------------------------------------------------------------------------
// 12. notes
// ---------------------------------------------------------------------------
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").references(() => customers.id),
  propertyId: integer("property_id").references(() => properties.id),
  jobId: integer("job_id").references(() => jobs.id),
  authorStaffId: integer("author_staff_id").references(() => staff.id),
  body: text("body").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true, createdAt: true });
export type InsertNote = typeof notes.$inferInsert;
export type Note = typeof notes.$inferSelect;

// ---------------------------------------------------------------------------
// 13. attachments
// ---------------------------------------------------------------------------
export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type", { enum: ["customer", "property", "job", "invoice"] }).notNull(),
  entityId: integer("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  category: text("category", { enum: ["photo", "document"] }).notNull(),
  uploadedAt: text("uploaded_at").notNull().default(new Date().toISOString()),
});

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  uploadedAt: true,
});
export type InsertAttachment = typeof attachments.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;

// ---------------------------------------------------------------------------
// 14. app_settings — singleton row (id always 1), Phase 3.
// Business info + invoice defaults consumed by invoice creation & print view.
// ---------------------------------------------------------------------------
export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessName: text("business_name").notNull().default("Mad River Cleaning Co."),
  businessAddress: text("business_address").notNull().default(""),
  businessPhone: text("business_phone").notNull().default(""),
  businessEmail: text("business_email").notNull().default(""),
  logoPlaceholder: text("logo_placeholder"),
  defaultTaxRate: real("default_tax_rate").notNull().default(0),
  defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(15),
  invoiceNumberPrefix: text("invoice_number_prefix").notNull().default("INV"),
  invoiceFooterNote: text("invoice_footer_note").notNull().default("Thank you for your business."),
  notifyJobReminders: integer("notify_job_reminders", { mode: "boolean" }).notNull().default(true),
  notifyInvoiceOverdue: integer("notify_invoice_overdue", { mode: "boolean" }).notNull().default(true),
  notifyPaymentReceived: integer("notify_payment_received", { mode: "boolean" }).notNull().default(true),
  notifyDailyDigest: integer("notify_daily_digest", { mode: "boolean" }).notNull().default(false),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({ id: true });
export type InsertAppSettings = typeof appSettings.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
