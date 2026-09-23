-- Original table definitions only. No business records, secrets, or user accounts.
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_name` text DEFAULT 'Ridgeline Cleaning Ops' NOT NULL,
	`business_address` text DEFAULT '' NOT NULL,
	`business_phone` text DEFAULT '' NOT NULL,
	`business_email` text DEFAULT '' NOT NULL,
	`logo_placeholder` text,
	`default_tax_rate` real DEFAULT 0 NOT NULL,
	`default_payment_terms_days` integer DEFAULT 15 NOT NULL,
	`invoice_number_prefix` text DEFAULT 'INV' NOT NULL,
	`invoice_footer_note` text DEFAULT 'Thank you for your business.' NOT NULL,
	`notify_job_reminders` integer DEFAULT true NOT NULL,
	`notify_invoice_overdue` integer DEFAULT true NOT NULL,
	`notify_payment_received` integer DEFAULT true NOT NULL,
	`notify_daily_digest` integer DEFAULT false NOT NULL
);

CREATE TABLE "attachments" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`category` text NOT NULL,
	`uploaded_at` text DEFAULT '2026-08-23T05:52:17.152Z' NOT NULL
);

CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE "customers" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`company_name` text,
	`customer_type` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`alt_phone` text,
	`preferred_contact` text NOT NULL,
	`billing_address_line1` text NOT NULL,
	`billing_address_line2` text,
	`billing_city` text NOT NULL,
	`billing_state` text NOT NULL,
	`billing_zip` text NOT NULL,
	`notes` text,
	`tax_exempt` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT '2026-08-23T05:52:17.137Z' NOT NULL
);

CREATE TABLE `invoice_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`description` text NOT NULL,
	`item_type` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real NOT NULL,
	`amount` real NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`job_id` integer,
	`invoice_number` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`travel_fee` real DEFAULT 0 NOT NULL,
	`rush_fee` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`amount_paid` real DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `job_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`job_type` text NOT NULL,
	`default_duration_minutes` integer NOT NULL,
	`default_price` real NOT NULL,
	`default_checklist` text NOT NULL,
	`description` text
);

CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`schedule_id` integer,
	`job_template_id` integer,
	`job_type` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`scheduled_time` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`assigned_staff_id` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`internal_notes` text,
	`customer_notes` text,
	`price` real NOT NULL,
	`before_photos` text DEFAULT '[]' NOT NULL,
	`after_photos` text DEFAULT '[]' NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_template_id`) REFERENCES `job_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE "notes" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer,
	`property_id` integer,
	`job_id` integer,
	`author_staff_id` integer,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT '2026-08-23T05:52:17.151Z' NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`amount` real NOT NULL,
	`method` text NOT NULL,
	`paid_date` text NOT NULL,
	`reference` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `properties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`name` text NOT NULL,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`zip` text NOT NULL,
	`unit_type` text NOT NULL,
	`bedrooms` integer NOT NULL,
	`bathrooms` real NOT NULL,
	`max_occupancy` integer NOT NULL,
	`check_in_time` text NOT NULL,
	`check_out_time` text NOT NULL,
	`entry_instructions` text NOT NULL,
	`access_notes` text,
	`supply_notes` text,
	`cleaning_frequency` text NOT NULL,
	`base_price` real NOT NULL,
	`photo_url` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_id` integer NOT NULL,
	`job_template_id` integer,
	`frequency` text NOT NULL,
	`day_of_week` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`assigned_staff_id` integer,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_template_id`) REFERENCES `job_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `service_checklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`label` text NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`color_tag` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);

CREATE TABLE `stays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_id` integer NOT NULL,
	`guest_name` text NOT NULL,
	`guest_phone` text,
	`guest_count` integer,
	`platform` text DEFAULT 'airbnb' NOT NULL,
	`check_in_date` text NOT NULL,
	`check_out_date` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);
