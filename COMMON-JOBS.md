# Common jobs for property services

## Workflow

Open a property and scroll to **Services & Add-ons**. Use **Create common job**, choose a starting task, or open **Browse common jobs** to reuse a saved service.

- **Starting tasks:** Hot tub maintenance, full hot tub drain/refill, trash removal, grill cleaning, restocking, and a blank special task. Enter your own price before saving; these are editable starting points, not automatically installed charges.
- **Reusable jobs:** Leave **Save to common job library for other properties** checked. Saving creates both the library default and this property's configuration in a single database transaction.
- **Property-only tasks:** Uncheck that option for work that applies only to this property.
- **Property overrides:** Set a separate price, quantity, invoice behavior, instructions, and replacement/exclusion for each property. Reusing a common job does not copy another property's private instructions.
- **Invoice behavior:** Choose automatically included, suggested/optional, or manual only. Existing invoices keep their saved descriptions and prices.
- **Full hot tub service:** Set “Replaces / excludes” to the property's regular hot tub maintenance when both should not be charged together.

These common jobs are reusable billable service definitions. Creating one does not schedule a work order or recurring calendar visit. Existing job scheduling remains unchanged.

## Changes and safety

Property detail and Settings → Services & Add-ons now expose the common-job library and starting tasks. The existing `service_catalog` and `property_services` tables are reused; no schema changes or data migrations are needed.

The new authenticated `POST /api/properties/:id/common-services` endpoint validates both records before saving them atomically. Duplicate names are rejected on this combined creation path; duplicate catalog assignments to one property are rejected with a useful error. Existing catalog data is not renamed, merged, or deleted. New assignments of inactive catalog services are blocked, while existing configurations remain editable.

No payment-provider, email, or environment-variable changes are required.

## QA inventory

- Create reusable hot tub service from property; check category, chosen price, library membership, and property instructions.
- Reuse that service on a second property with a different price; confirm first property's price and library default remain unchanged.
- Create a property-only special task; verify it is absent from the library.
- Browse and search common jobs; edit already configured services rather than adding duplicates.
- Check each starter task fills the expected name and requires a price.
- Check optional and automatic invoice behavior, existing invoice preservation, enabled/disabled controls, quantities, and hot-tub exclusions.
- Reject repeated saves, invalid prices, cross-property exclusions, missing properties, and unauthorized access.
- Review desktop and 375-pixel mobile layout, modal scrolling, empty search results, and dark mode.

## Source recovery

An updated source ZIP is provided separately. Download it outside Computer and retain the previous version as well. The source ZIP excludes business records and credentials; those need separate private backups.

## Verification and rollout

The common-job API suite covers 13 checks, and the existing mocked provider/authentication suite covers 14 checks. Browser testing exercised all six starters, reusable and property-only creation, library search and empty states, property-specific edits, reuse on a second property, hot-tub replacement, manual invoice behavior, settings creation, quantity/sort order, and enabled and theme toggles. Desktop and 375-pixel mobile screens were reviewed with no page errors or horizontal overflow in those flows.

This change is prepared in the app preview. It has not yet been republished to the public app link. Existing production accounts and records have not been changed by these tests, which use dedicated database copies.
