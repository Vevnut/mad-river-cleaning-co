# Billing upgrade QA inventory

## Functional and visual checks
- Sign-in/setup: private API denied, login success, revoked membership denied, desktop/mobile form.
- Property: split bathrooms 2/1 = 2.5, rate fields, blank rates, validation, existing values preserved; create/edit dialog and detail at desktop/mobile.
- Services: catalog CRUD (disable instead of destroy), property override, inclusion behaviors, custom instructions and conflicts; settings and property services at both sizes.
- Invoice editor: property/customer/job prefill, rate switch confirmation, once-only defaults, quick add/remove/replacement, manual lines, immediate totals, draft, existing-edit snapshot; desktop/mobile with multiple items.
- Invoice details: preview, send review (blocked without configuration), manual payment, payment/activity histories, void; desktop/mobile.
- Public page: capability token only, no internal information, viewed tracking, print, online-unavailable error, settled status; desktop/mobile.
- Legacy screens: dashboard/customer/jobs/stays/schedule/reports accessible behind login; light/dark dashboard.
- Off-happy-path: duplicate requests and amounts, overpayment, mismatched owner/service, simultaneous checkout/manual payment, negative amounts, invalid signatures, cross-organization session.

## Evidence plan
Automated API/migration assertions against an isolated database; browser interaction and screenshots under tests/.data. Live Resend delivery and Stripe-hosted card payment cannot be signed off without server credentials; use provider mocks only for dispatch/webhook logic and report that distinction.

## Executed results
- 25 migration/API checks passed against tests/.data/qa.db.
- 12 offline provider/auth checks passed, including real Stripe signature verification with synthetic signed events, wrong amounts, duplicate events, checkout locking, and recoverable uncertain email sends.
- Browser: split bathrooms and owner-rate property edit; catalog create/disable/re-enable; property catalog override; standard and owner invoices; optional add-ons and conflicting hot-tub replacement; per-invoice price override and default removal persisted after edit; Venmo partial payment; send review disabled without configuration; printable client preview; new owner-rate job, completion and invoice generation.
- Public customer invoice checked in a separate unauthenticated browser context; no workspace controls or internal notes appeared.
- Mobile layouts checked at 375 px, desktop at 1440 px. Key editor, property and public screens had no horizontal document overflow. Light/dark dashboard checked.
- All existing navigation destinations opened successfully: dashboard, customers, properties, scheduling, stays, jobs, invoices, reports and settings.
- No JavaScript page errors during these workflows.
- Tests are not a claim of exhaustive production validation. Live email receipt, Stripe-hosted test card checkout, deployed webhook delivery and production persistence remain setup/acceptance checks.
