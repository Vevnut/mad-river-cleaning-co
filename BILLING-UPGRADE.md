# Mad River Cleaning Co. Billing Upgrade

The updated app is available in the attached secured preview. This is an extension of the existing app, not a replacement database or a rebuild of the business records.

The new billing workflows are implemented and tested locally. Live email delivery and real Stripe-hosted checkout still require server configuration and acceptance testing; no email or real payment was sent during development.

## Start here

1. Open the attached Mad River Cleaning Co. preview.
2. Use the separately attached **Private First-Time Setup** file to create your workspace account. Choose your own password; the setup code works only before the first account exists.
3. Open a property, choose **Edit Property**, and review its full/half bathrooms, standard departure rate, owner rate, labels, and invoice notes.
4. Configure reusable services under **Settings → Services & Add-ons**. Add or customize services in each property's **Services & Add-ons** section.
5. Create an invoice, check the prefilled charges, save the draft, and use its review, preview, or payment actions.

To let your sister review the workspace, create a separate trusted account under **Settings → Payments & Access** and share her password privately. Every workspace account currently has full access to this business; these are not restricted cleaner accounts.

The first-time setup file is private. Do not include it in the public app or forward it to invoice recipients.

## What changed

- **Bathrooms:** Property forms store full and half bathrooms separately. The displayed total is full bathrooms plus half bathrooms multiplied by 0.5, and negative or fractional full/half counts are rejected.
- **Rates:** Each property has separately editable standard departure and owner rates with labels. Select Standard Departure, Owner Rate, or Custom / No Default Rate when creating a job or invoice; only the selected base rate is added.
- **Default charges:** A new invoice loads its selected property rate and enabled automatic services once. Blank rates add nothing, and saved invoices retain edited or removed charges when reopened.
- **Property add-ons:** Catalog services can be assigned to a property with its own price, quantity, inclusion behavior, instructions, enablement, and replacement service. Custom property-only services are supported.
- **Fast invoice entry:** Suggested and manual services appear as quick-add choices. Selecting a replacement service removes its conflicting charge, and the server rejects invoices containing both.
- **Snapshots:** Invoice lines save the service name, description, quantity, and price. Later property or catalog price changes do not reprice old invoices.
- **Invoice workflow:** Create from a property, completed job, or invoice list. Property, owner, address, rate, applicable automatic services, and available client notes are prefilled.
- **Editable invoice fields:** Number, issue/due dates, owner, property, quantity, price, line descriptions, client message, internal notes, discount, travel fee, and rush fee are available.
- **Status and history:** Draft, sent, viewed, partially paid, paid, overdue, and canceled/void states are supported. Send attempts, successful sends, payments, edits, and other billing actions have an activity trail.
- **Customer preview:** A professional invoice can be printed or saved using the browser's PDF destination. This is a browser Print / Save PDF workflow, not a separate server-generated PDF attachment.
- **Offline payments:** Record cash, check, Venmo, Zelle, bank transfer, manually processed card, or other payments with amount, date, reference, and an internal note.
- **Online payment:** A server-side Stripe Checkout implementation collects the outstanding balance by card. It remains disabled until the required server settings are present.
- **Access control:** All private APIs require an authenticated, active member of the deployment's organization. Customer invoice pages use a separate high-entropy invoice-specific link and omit workspace data, access instructions, and internal notes.

The existing workspace remains no-tax. No new tax calculation or tax UI was enabled; the service catalog keeps a tax metadata field for future expansion.

## Everyday workflow

### Set up a property

Enter the full and half bathrooms, then the standard departure and owner rates. The old base price has been mapped to the standard departure rate, so review it rather than entering it again.

In **Services & Add-ons**, add catalog services or create a custom service. Choose automatic, suggested, or manual inclusion, then set the property's price and quantity. A catalog edit does not silently change the saved property override.

Use the property's rate fields for the base cleaning charge. Do not also create an automatic add-on for the same base cleaning service, which would represent a separate charge.

### Create and review an invoice

Use **Create invoice** on a property, **Generate Invoice** on a completed job, or **New Invoice** on the invoice list. Select the appropriate rate and review the automatic charges; completed jobs retain their selected rate and job-specific price override.

Tap **Add** beside optional property services, edit quantities/prices, remove unneeded charges, or add a manual line. Changing property/rate after charges exist requires confirmation because it reloads defaults; reopening a saved invoice does not reload them.

Save the draft, then use **Preview / PDF**. Internal notes are visible to the workspace only, not in the client preview, hosted invoice, or email.

### Send or receive payment

**Send Invoice** opens a review of the recipient, subject, message, amount, due date, and payment options. Once email is configured, confirm this review to send; the invoice is marked sent only after the email provider accepts it.

A client's hosted invoice offers secure card payment when configured and still permits the usual offline arrangement. In the workspace, use **Record Payment** for funds already received, and the balance and status update automatically.

An active online checkout locks invoice changes and manual payment recording to avoid collecting the same balance twice. Use **Cancel / reconcile active online checkout** before recording an offline payment if a card checkout was already started.

“Viewed” means the hosted invoice was opened. It is not a guarantee that an email was read by the intended person.

## Schema and migration summary

The upgrade uses additive, transactional SQLite migrations in `server/migrations.ts`, tracked by `schema_migrations`. Startup applies missing versions automatically; do not use a destructive reset or `drizzle-kit push` to apply this upgrade.

| Area | Additions and compatibility behavior |
|---|---|
| Properties | Full/half bathrooms, original legacy bathroom value, standard departure rate/name, owner rate/name, invoice notes. Existing `bathrooms` and `base_price` columns remain for compatibility. |
| Bathroom backfill | Existing whole and half-unit totals map sensibly to full/half counts. Unusual non-half fractions remain preserved in the legacy value rather than being silently rounded. |
| Rate backfill | Existing nonnegative base prices become standard departure rates. Owner rates are left blank until entered. |
| Jobs | Selected rate type. Existing jobs are treated as custom so historical job prices are not silently changed. |
| Service catalog | Name, description, category, default price/quantity/unit, active flag, inclusion behavior, tax metadata, sort order, timestamps. |
| Property services | Catalog reference or custom service, price/quantity override, enabled flag, inclusion behavior, internal instructions, replacement/exclusion reference, timestamps. |
| Invoices | Property and selected rate, property/customer snapshots, internal notes, sent/viewed/paid timestamps, hosted-link token, creation request key, timestamps. Existing financial columns remain. |
| Invoice items | Source property-service ID, description snapshot, automatic-source flag, line-item type. Existing names, prices, amounts, and ordering remain. |
| Payments | Provider, provider transaction ID, note, status, idempotency request key, created timestamp, additional methods. Existing amount/date/reference fields remain. |
| History and delivery | Invoice activities, email send attempts and recoverable review data, checkout reservations, processed webhook event IDs. |
| Authorization | One organization per deployment/database, users with hashed passwords, hashed session tokens and expiration. |

The invoice balance is calculated from total minus payments received rather than introducing a second independent balance field. Existing invoice totals and line items are not recalculated during migration.

Before the first billing migration, startup creates a SQLite backup in the database's adjacent `backups/` directory. The second migration adds persisted send-review data so an uncertain email attempt can be recovered after refresh.

### Preservation verified

The local preview retained **9 customers, 17 properties, 2 jobs, 1 invoice, 2 invoice line items, and 0 payments**. Every original column on those records was compared against the pre-upgrade backup and matched; SQLite integrity checking passed with no foreign-key violations.

The 151 Pinnacle example and all payment/service test records were created only in isolated test databases. They were not inserted into the business database, and no made-up owner or departure rate was added to the real property list.

This verification applies to the existing local data used by the preview. The separately published app's live database was not opened, replaced, or migrated during this work.

## Server configuration

The application uses server environment variables, with an example in `.env.example`. No Stripe secret or webhook secret belongs in a frontend file or a `VITE_*` setting.

| Variable | Purpose |
|---|---|
| `DATABASE_PATH` | SQLite database path; defaults to `data.db`. Retain the existing live database path during deployment. |
| `AUTH_SETUP_TOKEN` | Long random first-account bootstrap token. A private preview token was generated; setup is disabled after an account exists. |
| `STRIPE_SECRET_KEY` | Server-side Stripe test or live secret key. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this deployment's webhook endpoint. |
| `RESEND_API_KEY` | Server-side invoice email sending key. |
| `INVOICE_FROM_EMAIL` | Authorized sender, such as a verified business billing address. |
| `PUBLIC_APP_URL` | Stable HTTPS application root used for invoice links and Checkout return URLs. Do not use a temporary proxy URL. |

No existing online payment or outbound email provider was configured in the inspected app. Stripe Checkout and a Resend email adapter were added; the dismissed Stripe connection request was not reopened.

### Stripe setup and acceptance

Configure test credentials first, and create a webhook endpoint for `checkout.session.completed` and `checkout.session.expired`. Checkout Sessions are created server-side for the outstanding balance using Stripe's [Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create).

The server route is `/api/stripe/webhook`. Under this app's Perplexity published proxy, use `https://<published-host>/port/5000/api/stripe/webhook`; on a direct Express host, use `https://<host>/api/stripe/webhook`.

The app verifies the raw request body and Stripe signature before recording payment, consistent with Stripe's [webhook-signature guidance](https://docs.stripe.com/webhooks/signature). It also validates organization, invoice, reservation, amount, currency, and transaction identity, with unique event/transaction constraints to prevent duplicate recording.

When a checkout must be canceled, the server confirms expiration or payment with Stripe before unlocking the invoice, using Stripe's [Checkout expiration API](https://docs.stripe.com/api/checkout/sessions/expire). Unknown provider results fail closed rather than assuming the customer did not pay.

Test an actual hosted test-card checkout and delivery of its signed webhook before enabling live keys. No real Stripe-hosted checkout was exercised in this session.

### Email setup and acceptance

Configure the Resend key and an authorized sender, then test delivery to an address you control using the app's review screen. The adapter uses Resend's [send-email API](https://resend.com/docs/api-reference/emails/send-email), including an idempotency key for retries.

A timeout leaves the original reviewed payload recoverable through **Send Invoice**, rather than silently sending a different message. An uncertain send older than the app's 23-hour safety window requires operator verification with the provider before further recovery.

“Sent” records provider acceptance, not delivery confirmation or bounce handling. Bounce processing and email-open tracking are not implemented.

## Screens changed

- **Sign-in / first-time setup:** New protected-workspace entry screen.
- **App header and mobile sidebar:** Real sign-out replaces the old role selector; mobile navigation closes after selection and header controls fit narrow screens.
- **Property add/edit dialog:** Full/half bathrooms, both rates and labels, invoice notes, calculated total.
- **Property detail:** Bathroom breakdown, rates section, Services & Add-ons, invoice list and creation entry.
- **Job creation dialog:** Default-rate selector, price prefill and stored rate type, local business-date default.
- **Job detail:** Selected rate displayed and completed-job invoice review entry.
- **Invoice list:** Viewed status filter and deletion limited to unpaid drafts.
- **Invoice create/edit:** Unified property/job/manual flow, default charges, quick-add services, editable lines and live totals.
- **Invoice detail:** Payment and activity history, send review, client preview, editing, offline payments, checkout reconciliation, void.
- **Customer hosted invoice:** New invoice-only page with payment availability, outstanding balance, client notes, and print/PDF flow.
- **Settings:** Service catalog plus Payments & Access configuration status and trusted-account creation.
- **Reports:** Viewed invoices remain included in unpaid invoice reporting.
- **Shared components:** Payment entry methods, status labels, date formatting, authentication-aware API requests.

Dashboard, customers, scheduling, stays, staff data, reports, checklist behavior, and existing business settings remain in place. Their navigation destinations were checked after authentication.

## Safety behavior and boundaries

- **Organization isolation:** This remains a single-business deployment with a dedicated database. Membership is checked before every private API; it is not a multi-tenant SaaS database with row-level tenant IDs on every legacy table.
- **Access levels:** All workspace users are full-access trusted users. Existing staff scheduling records do not create login accounts or confer permissions.
- **Sessions:** Passwords use salted scrypt hashes, tokens are stored hashed server-side, and sessions expire after 12 hours. Refresh signs out because session credentials are kept in memory, not browser storage.
- **Data deletion:** Unpaid drafts can be deleted. Sent/paid history is protected from hard deletion, unpaid invoices can be voided, and processor payments cannot be removed through the manual-payment deletion route.
- **Refunds:** A Stripe refund/dispute workflow is not implemented. Reconcile those with the provider and business records before altering balances.
- **Storage:** The built-in SQLite database is suitable for a prototype, not production-grade durable hosting. Before relying on this for live financial records, arrange managed persistent storage and tested external backups.
- **Live publication:** Only the preview was deployed. This deploy did not return active published-site metadata, so the earlier published URL should not be assumed active; publishing requires a separate decision. If an older unauthenticated live version is still available, it does not gain this preview's protection automatically.
- **Deployment preservation:** Do not replace a live database with this preview's copy. Back up the actual live database, deploy code without overwriting it, and run the additive migrations against that database.
- **Account recovery:** There is not yet a self-service password-reset or fine-grained role-management screen. Administrator recovery requires server-side intervention.
- **Build notices:** TypeScript and production build succeeded. Vite still reports a large-bundle advisory and a PostCSS plugin advisory; neither blocked the build.

The old role selector had no server-side authorization. It has been replaced with actual sign-in rather than treated as a working permission system; unrelated business functionality was retained.

## Test results and acceptance checklist

**37 automated checks passed:** 25 API/migration checks and 12 provider/authentication checks. Provider calls were mocked, while Stripe's actual signature-verification library was exercised with signed synthetic events.

Browser testing covered standard and owner invoices, job completion to invoice, catalog management, property overrides, hot-tub replacement, saved price changes/removals, Venmo partial payment, send review, print preview, and an unauthenticated customer invoice view. Key mobile screens were checked at 375 px and desktop at 1440 px, with no JavaScript page errors during these flows.

Use this checklist when reviewing the preview and later enabling providers:

- [x] Create an isolated 151 Pinnacle property with 2 full and 1 half bathroom; total is 2.5.
- [x] Save separate standard and owner rates; create invoices that contain only the selected base rate.
- [x] Configure grill $10, hot-tub maintenance $40, full drain/refill/maintenance $100, and dish cleaning $25 as property services in the test fixture.
- [x] Confirm automatic charges appear once and do not return after being removed from a saved invoice.
- [x] Add optional services; select the full hot-tub service and avoid charging regular maintenance as well.
- [x] Verify later property price changes do not alter existing invoice snapshots.
- [x] Complete an owner-rate job and create its prefilled invoice.
- [x] Record partial cash/Venmo and final check payments; verify status, balance, reference, and history.
- [x] Reject negative values, duplicate base/service charges, overpayment, forged totals, invalid signatures, and foreign-organization sessions.
- [x] Verify private notes and property entry instructions do not appear in customer output.
- [x] Verify mocked sending, retries, signed synthetic settlement, webhook deduplication, and checkout locking.
- [ ] Configure Resend and confirm actual receipt of a reviewed invoice email.
- [ ] Configure Stripe test mode and complete a real hosted test-card payment with a delivered webhook.
- [ ] Confirm the deployed public invoice URL, return URL, webhook URL, access settings, backup restoration, and durable storage before live money.
- [ ] Review and authorize publication of the updated app.

Implementation tests are in `tests/billing.test.ts` and `tests/providers.test.ts`; browser evidence and disposable databases are excluded from source control under `tests/.data/`. The local business database and server secrets are also excluded.
