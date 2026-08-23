/**
 * Seed script — Phase 1
 * Populates customers, contacts, properties, staff, and job_templates with
 * realistic White Mountains, NH sample data per the master spec.
 * Jobs/invoices sample rows are added in Phase 2/3 once those pages exist.
 *
 * Run with: npx tsx script/seed.ts
 */
import { db } from "../server/storage";
import { customers, contacts, properties, staff, jobTemplates } from "../shared/schema";

function run() {
  console.log("Seeding Ridgeline database...");

  // Clear existing rows for idempotent re-seeding (Phase 1 tables only)
  db.delete(contacts).run();
  db.delete(properties).run();
  db.delete(customers).run();
  db.delete(staff).run();
  db.delete(jobTemplates).run();

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------
  const customerRows = [
    {
      name: "Coastal Vista Rentals LLC",
      companyName: "Coastal Vista Rentals LLC",
      customerType: "company" as const,
      email: "ops@coastalvistarentals.com",
      phone: "603-555-0142",
      altPhone: null,
      preferredContact: "email" as const,
      billingAddressLine1: "18 Norcross Circle",
      billingAddressLine2: "Suite 2",
      billingCity: "North Conway",
      billingState: "NH",
      billingZip: "03860",
      notes: "Vacation rental manager, 4 properties across North Conway/Conway. Invoices net-15.",
      taxExempt: false,
    },
    {
      name: "White Mountain Getaways",
      companyName: "White Mountain Getaways",
      customerType: "company" as const,
      email: "billing@whitemountaingetaways.com",
      phone: "603-555-0198",
      altPhone: "603-555-0199",
      preferredContact: "email" as const,
      billingAddressLine1: "402 Main St",
      billingAddressLine2: null,
      billingCity: "Jackson",
      billingState: "NH",
      billingZip: "03846",
      notes: "Property management co, 3 properties (Jackson, Bartlett, Intervale).",
      taxExempt: false,
    },
    {
      name: "Sarah & Tom Whitfield",
      companyName: null,
      customerType: "individual" as const,
      email: "whitfields@gmail.com",
      phone: "603-555-0223",
      altPhone: null,
      preferredContact: "text" as const,
      billingAddressLine1: "27 Birch Ridge Rd",
      billingAddressLine2: null,
      billingCity: "Conway",
      billingState: "NH",
      billingZip: "03818",
      notes: "Airbnb owners, 1 property: Birch Ridge Cabin.",
      taxExempt: false,
    },
    {
      name: "Daniel Ferreira",
      companyName: null,
      customerType: "individual" as const,
      email: "daniel.ferreira@outlook.com",
      phone: "603-555-0307",
      altPhone: null,
      preferredContact: "phone" as const,
      billingAddressLine1: "9 Sandwich Notch Rd",
      billingAddressLine2: null,
      billingCity: "Tamworth",
      billingState: "NH",
      billingZip: "03886",
      notes: "Airbnb host, 2 properties (Tamworth, Madison).",
      taxExempt: false,
    },
    {
      name: "The Hendricks Family",
      companyName: null,
      customerType: "individual" as const,
      email: "hendricksfamily5@gmail.com",
      phone: "603-555-0411",
      altPhone: null,
      preferredContact: "text" as const,
      billingAddressLine1: "58 Passaconaway Rd",
      billingAddressLine2: null,
      billingCity: "Conway",
      billingState: "NH",
      billingZip: "03818",
      notes: "Recurring residential client — biweekly house cleaning, not a rental.",
      taxExempt: false,
    },
    {
      name: "Loon Mountain Lodging Group",
      companyName: "Loon Mountain Lodging Group",
      customerType: "company" as const,
      email: "accounting@loonlodging.com",
      phone: "603-555-0530",
      altPhone: "603-555-0531",
      preferredContact: "email" as const,
      billingAddressLine1: "260 Governor Adams Rd",
      billingAddressLine2: "Unit A",
      billingCity: "Lincoln",
      billingState: "NH",
      billingZip: "03251",
      notes: "Vacation rental manager, 2 units near Loon Mountain (Lincoln area).",
      taxExempt: false,
    },
    {
      name: "Priya Nair",
      companyName: null,
      customerType: "individual" as const,
      email: "priya.nair@icloud.com",
      phone: "603-555-0648",
      altPhone: null,
      preferredContact: "email" as const,
      billingAddressLine1: "14 Kancamagus Ridge Ln",
      billingAddressLine2: null,
      billingCity: "Albany",
      billingState: "NH",
      billingZip: "03818",
      notes: "Airbnb owner, 1 property. Quarterly deep clean + turnover service.",
      taxExempt: false,
    },
    {
      name: "Conway Lakeside Cottages",
      companyName: "Conway Lakeside Cottages",
      customerType: "company" as const,
      email: "info@conwaylakesidecottages.com",
      phone: "603-555-0772",
      altPhone: null,
      preferredContact: "phone" as const,
      billingAddressLine1: "3 Lakeshore Dr",
      billingAddressLine2: null,
      billingCity: "Conway",
      billingState: "NH",
      billingZip: "03818",
      notes: "Small family-owned business, 2 cottages, weekly cleaning in-season.",
      taxExempt: true,
    },
  ];

  const insertedCustomers = customerRows.map((c) =>
    db.insert(customers).values(c).returning().get()
  );
  const [
    coastalVista, whiteMountain, whitfields, ferreira,
    hendricks, loonMountain, priyaNair, lakesideCottages,
  ] = insertedCustomers;

  console.log(`Inserted ${insertedCustomers.length} customers.`);

  // ---------------------------------------------------------------------
  // Contacts (a few key ones — property managers etc.)
  // ---------------------------------------------------------------------
  db.insert(contacts).values([
    {
      customerId: coastalVista.id,
      name: "Renee Sabatino",
      role: "Property Manager",
      email: "renee@coastalvistarentals.com",
      phone: "603-555-0143",
      isPrimary: true,
    },
    {
      customerId: whiteMountain.id,
      name: "Kevin Doucette",
      role: "Operations Lead",
      email: "kevin@whitemountaingetaways.com",
      phone: "603-555-0197",
      isPrimary: true,
    },
    {
      customerId: whitfields.id,
      name: "Sarah Whitfield",
      role: "Owner",
      email: "whitfields@gmail.com",
      phone: "603-555-0223",
      isPrimary: true,
    },
    {
      customerId: loonMountain.id,
      name: "Marcus Ojeda",
      role: "Site Manager",
      email: "marcus@loonlodging.com",
      phone: "603-555-0532",
      isPrimary: true,
    },
  ]).run();

  console.log("Inserted contacts.");

  // ---------------------------------------------------------------------
  // Properties (13–15 total)
  // ---------------------------------------------------------------------
  db.insert(properties).values([
    // Coastal Vista Rentals LLC — 4 properties (North Conway / Conway)
    {
      customerId: coastalVista.id, name: "Saco River Retreat",
      addressLine1: "112 River Rd", addressLine2: null, city: "North Conway", state: "NH", zip: "03860",
      unitType: "house", bedrooms: 4, bathrooms: 2.5, maxOccupancy: 9,
      checkInTime: "16:00", checkOutTime: "10:00",
      entryInstructions: "Lockbox on side door, code 2847. Spare key inside kitchen drawer.",
      accessNotes: "Driveway is shared with neighbor — park close to the garage.",
      supplyNotes: "Restock coffee pods and dish soap from garage supply closet.",
      cleaningFrequency: "turnover", basePrice: 165, photoUrl: null, active: true,
    },
    {
      customerId: coastalVista.id, name: "Cranmore View Condo 3B",
      addressLine1: "45 Skimobile Rd", addressLine2: "Unit 3B", city: "North Conway", state: "NH", zip: "03860",
      unitType: "condo", bedrooms: 2, bathrooms: 2, maxOccupancy: 6,
      checkInTime: "15:00", checkOutTime: "11:00",
      entryInstructions: "Front desk keypad, code 6631. HOA requires ID at check-in.",
      accessNotes: "Elevator access only, no stairs. Loading dock in rear for supplies.",
      supplyNotes: "Standard supply kit, extra towels for hot tub building guests.",
      cleaningFrequency: "turnover", basePrice: 130, photoUrl: null, active: true,
    },
    {
      customerId: coastalVista.id, name: "Echo Lake Cabin",
      addressLine1: "8 West Side Rd", addressLine2: null, city: "Conway", state: "NH", zip: "03818",
      unitType: "cabin", bedrooms: 3, bathrooms: 1.5, maxOccupancy: 7,
      checkInTime: "16:00", checkOutTime: "10:00",
      entryInstructions: "Gate code 1955#. Cabin key on hook inside gate box.",
      accessNotes: "Gravel driveway, 4WD recommended in winter.",
      supplyNotes: "Firewood bin needs refilling weekly in-season.",
      cleaningFrequency: "turnover", basePrice: 150, photoUrl: null, active: true,
    },
    {
      customerId: coastalVista.id, name: "Kearsarge Ridge Loft",
      addressLine1: "221 Hurricane Mtn Rd", addressLine2: null, city: "North Conway", state: "NH", zip: "03860",
      unitType: "apartment", bedrooms: 1, bathrooms: 1, maxOccupancy: 3,
      checkInTime: "15:00", checkOutTime: "10:00",
      entryInstructions: "Smart lock, code changes weekly — see Coastal Vista scheduling portal.",
      accessNotes: "Street parking only, no assigned spot.",
      supplyNotes: "Small unit — minimal supply kit.",
      cleaningFrequency: "turnover", basePrice: 95, photoUrl: null, active: true,
    },

    // White Mountain Getaways — 3 properties (Jackson, Bartlett, Intervale)
    {
      customerId: whiteMountain.id, name: "Jackson Falls House",
      addressLine1: "34 Carter Notch Rd", addressLine2: null, city: "Jackson", state: "NH", zip: "03846",
      unitType: "house", bedrooms: 5, bathrooms: 3, maxOccupancy: 12,
      checkInTime: "16:00", checkOutTime: "10:00",
      entryInstructions: "Lockbox by garage, code 3390. Alarm code 1122 (disarm on entry).",
      accessNotes: "Large group property — allow extra time, 2-cleaner job recommended.",
      supplyNotes: "Restock all 3 bathrooms fully; hot tub towels stored in mudroom.",
      cleaningFrequency: "turnover", basePrice: 210, photoUrl: null, active: true,
    },
    {
      customerId: whiteMountain.id, name: "Bartlett Brook Cottage",
      addressLine1: "77 US Route 302", addressLine2: null, city: "Bartlett", state: "NH", zip: "03812",
      unitType: "cottage", bedrooms: 2, bathrooms: 1, maxOccupancy: 5,
      checkInTime: "16:00", checkOutTime: "11:00",
      entryInstructions: "Keypad at front door, code 4471.",
      accessNotes: "Narrow driveway — small vehicles only.",
      supplyNotes: "Standard kit.",
      cleaningFrequency: "turnover", basePrice: 120, photoUrl: null, active: true,
    },
    {
      customerId: whiteMountain.id, name: "Intervale Meadow Cabin",
      addressLine1: "16 Hurricane Mountain Rd", addressLine2: null, city: "Intervale", state: "NH", zip: "03845",
      unitType: "cabin", bedrooms: 3, bathrooms: 2, maxOccupancy: 8,
      checkInTime: "16:00", checkOutTime: "10:00",
      entryInstructions: "Lockbox on porch railing, code 8802.",
      accessNotes: "Well water — check softener salt monthly (office staff task, not cleaner).",
      supplyNotes: "Restock coffee, sugar, propane grill tank if under 25%.",
      cleaningFrequency: "turnover", basePrice: 145, photoUrl: null, active: true,
    },

    // Sarah & Tom Whitfield — 1 property
    {
      customerId: whitfields.id, name: "Birch Ridge Cabin",
      addressLine1: "27 Birch Ridge Rd", addressLine2: null, city: "Conway", state: "NH", zip: "03818",
      unitType: "cabin", bedrooms: 2, bathrooms: 1, maxOccupancy: 4,
      checkInTime: "15:00", checkOutTime: "10:00",
      entryInstructions: "Combination lock on shed with spare key, code 0451.",
      accessNotes: "Owners occasionally stay same weekend as guests depart — confirm on schedule.",
      supplyNotes: "Owners supply their own linens; do not use rental supply kit here.",
      cleaningFrequency: "turnover", basePrice: 110, photoUrl: null, active: true,
    },

    // Daniel Ferreira — 2 properties (Tamworth, Madison)
    {
      customerId: ferreira.id, name: "Tamworth Trailhead House",
      addressLine1: "9 Sandwich Notch Rd", addressLine2: null, city: "Tamworth", state: "NH", zip: "03886",
      unitType: "house", bedrooms: 3, bathrooms: 2, maxOccupancy: 6,
      checkInTime: "16:00", checkOutTime: "11:00",
      entryInstructions: "Lockbox at side entry, code 5567.",
      accessNotes: "Hiking guests — expect muddy boots, extra floor attention needed.",
      supplyNotes: "Standard kit plus extra doormats.",
      cleaningFrequency: "turnover", basePrice: 140, photoUrl: null, active: true,
    },
    {
      customerId: ferreira.id, name: "Madison Village Cottage",
      addressLine1: "121 Silver St", addressLine2: null, city: "Madison", state: "NH", zip: "03849",
      unitType: "cottage", bedrooms: 2, bathrooms: 1, maxOccupancy: 4,
      checkInTime: "15:00", checkOutTime: "10:00",
      entryInstructions: "Keyless entry, code 7784.",
      accessNotes: "Small gravel lot — 1 vehicle max.",
      supplyNotes: "Standard kit.",
      cleaningFrequency: "turnover", basePrice: 105, photoUrl: null, active: true,
    },

    // The Hendricks Family — 1 residential property (biweekly)
    {
      customerId: hendricks.id, name: "Hendricks Residence",
      addressLine1: "58 Passaconaway Rd", addressLine2: null, city: "Conway", state: "NH", zip: "03818",
      unitType: "house", bedrooms: 4, bathrooms: 2.5, maxOccupancy: 5,
      checkInTime: "09:00", checkOutTime: "17:00",
      entryInstructions: "Garage code 2200. Dog (friendly lab) will be home — no need to let out.",
      accessNotes: "Family present during most visits — coordinate arrival time via text.",
      supplyNotes: "Family provides their own supplies; bring vacuum bags only.",
      cleaningFrequency: "biweekly", basePrice: 135, photoUrl: null, active: true,
    },

    // Loon Mountain Lodging Group — 2 units
    {
      customerId: loonMountain.id, name: "Loon Base Lodge Unit 12",
      addressLine1: "260 Governor Adams Rd", addressLine2: "Unit 12", city: "Lincoln", state: "NH", zip: "03251",
      unitType: "condo", bedrooms: 2, bathrooms: 2, maxOccupancy: 6,
      checkInTime: "16:00", checkOutTime: "10:00",
      entryInstructions: "Front office holds key — sign out with Marcus.",
      accessNotes: "Ski season high-turnover — check schedule daily during Dec–Mar.",
      supplyNotes: "Restock ski boot dryer towels near entry.",
      cleaningFrequency: "turnover", basePrice: 150, photoUrl: null, active: true,
    },
    {
      customerId: loonMountain.id, name: "Loon Base Lodge Unit 18",
      addressLine1: "260 Governor Adams Rd", addressLine2: "Unit 18", city: "Lincoln", state: "NH", zip: "03251",
      unitType: "condo", bedrooms: 3, bathrooms: 2, maxOccupancy: 8,
      checkInTime: "16:00", checkOutTime: "10:00",
      entryInstructions: "Front office holds key — sign out with Marcus.",
      accessNotes: "Top-floor unit — no elevator, use stairwell B.",
      supplyNotes: "Restock ski boot dryer towels near entry.",
      cleaningFrequency: "turnover", basePrice: 175, photoUrl: null, active: true,
    },

    // Priya Nair — 1 property, quarterly deep clean + turnover
    {
      customerId: priyaNair.id, name: "Kancamagus Ridge Retreat",
      addressLine1: "14 Kancamagus Ridge Ln", addressLine2: null, city: "Albany", state: "NH", zip: "03818",
      unitType: "cabin", bedrooms: 3, bathrooms: 2, maxOccupancy: 7,
      checkInTime: "16:00", checkOutTime: "10:00",
      entryInstructions: "Lockbox at woodshed, code 9013.",
      accessNotes: "Remote property — allow extra drive time from base.",
      supplyNotes: "Quarterly deep clean includes fridge/oven interior and window washing.",
      cleaningFrequency: "turnover", basePrice: 160, photoUrl: null, active: true,
    },

    // Conway Lakeside Cottages — 2 cottages, weekly in-season
    {
      customerId: lakesideCottages.id, name: "Lakeside Cottage A",
      addressLine1: "3 Lakeshore Dr", addressLine2: "Cottage A", city: "Conway", state: "NH", zip: "03818",
      unitType: "cottage", bedrooms: 2, bathrooms: 1, maxOccupancy: 4,
      checkInTime: "15:00", checkOutTime: "11:00",
      entryInstructions: "Owner meets cleaner on-site most Saturdays; otherwise lockbox code 6120.",
      accessNotes: "Lake access path — sweep sand from entry daily in-season.",
      supplyNotes: "Standard kit plus extra beach towels.",
      cleaningFrequency: "weekly", basePrice: 100, photoUrl: null, active: true,
    },
    {
      customerId: lakesideCottages.id, name: "Lakeside Cottage B",
      addressLine1: "5 Lakeshore Dr", addressLine2: "Cottage B", city: "Conway", state: "NH", zip: "03818",
      unitType: "cottage", bedrooms: 2, bathrooms: 1, maxOccupancy: 4,
      checkInTime: "15:00", checkOutTime: "11:00",
      entryInstructions: "Lockbox code 6121 (shared gate code 6120 for property line).",
      accessNotes: "Lake access path — sweep sand from entry daily in-season.",
      supplyNotes: "Standard kit plus extra beach towels.",
      cleaningFrequency: "weekly", basePrice: 100, photoUrl: null, active: true,
    },
  ]).run();

  console.log("Inserted 15 properties.");

  // ---------------------------------------------------------------------
  // Staff — 1 admin, 1 office, 3 cleaners
  // ---------------------------------------------------------------------
  db.insert(staff).values([
    { name: "Ellen Marsh", role: "admin", email: "ellen@ridgelinecleaning.com", phone: "603-555-1001", colorTag: "#0e7c86", active: true },
    { name: "Owen Petrucci", role: "office", email: "owen@ridgelinecleaning.com", phone: "603-555-1002", colorTag: "#7a39bb", active: true },
    { name: "Maya Lindqvist", role: "cleaner", email: "maya@ridgelinecleaning.com", phone: "603-555-1003", colorTag: "#2f9e44", active: true },
    { name: "Jorge Fuentes", role: "cleaner", email: "jorge@ridgelinecleaning.com", phone: "603-555-1004", colorTag: "#e8590c", active: true },
    { name: "Alicia Beaumont", role: "cleaner", email: "alicia@ridgelinecleaning.com", phone: "603-555-1005", colorTag: "#d6336c", active: true },
  ]).run();

  console.log("Inserted 5 staff members.");

  // ---------------------------------------------------------------------
  // Job templates
  // ---------------------------------------------------------------------
  db.insert(jobTemplates).values([
    {
      name: "Standard Turnover",
      jobType: "turnover",
      defaultDurationMinutes: 120,
      defaultPrice: 140,
      defaultChecklist: JSON.stringify([
        "Strip and remake all beds",
        "Restock guest supplies (toiletries, paper products)",
        "Sanitize all bathrooms",
        "Full kitchen clean (counters, appliances, sink)",
        "Take out trash and recycling",
        "Vacuum and mop all floors",
        "Check for damage and report issues",
        "Restage furniture and staging items",
      ]),
      description: "Standard checkout/check-in turnaround clean for short-term rentals.",
    },
    {
      name: "Deep Clean",
      jobType: "deep_clean",
      defaultDurationMinutes: 210,
      defaultPrice: 260,
      defaultChecklist: JSON.stringify([
        "Strip and remake all beds",
        "Deep-clean interior of fridge and oven",
        "Wash interior windows and sills",
        "Sanitize all bathrooms including grout",
        "Full kitchen clean (counters, appliances, sink)",
        "Dust all surfaces, baseboards, and vents",
        "Vacuum and mop all floors, including under furniture",
        "Check for damage and report issues",
      ]),
      description: "Quarterly or seasonal deep clean beyond standard turnover scope.",
    },
    {
      name: "Move-Out Deep Clean",
      jobType: "deep_clean",
      defaultDurationMinutes: 240,
      defaultPrice: 300,
      defaultChecklist: JSON.stringify([
        "Empty and wipe down all closets and cabinets",
        "Deep-clean interior of fridge and oven",
        "Wash interior and exterior windows",
        "Sanitize all bathrooms including grout",
        "Steam or shampoo carpets if applicable",
        "Dust all surfaces, baseboards, and vents",
        "Vacuum and mop all floors",
        "Full trash-out and haul away debris",
      ]),
      description: "End-of-tenancy or end-of-season full property reset.",
    },
    {
      name: "Inspection Walkthrough",
      jobType: "inspection",
      defaultDurationMinutes: 45,
      defaultPrice: 60,
      defaultChecklist: JSON.stringify([
        "Photograph all rooms",
        "Check smoke and CO detector batteries",
        "Test all door locks and gate codes",
        "Note any maintenance issues",
        "Confirm supply inventory levels",
      ]),
      description: "Light walkthrough to confirm property condition between guests or seasons.",
    },
    {
      name: "Custom Job",
      jobType: "custom",
      defaultDurationMinutes: 90,
      defaultPrice: 100,
      defaultChecklist: JSON.stringify([
        "Confirm scope with office before starting",
        "Complete requested tasks",
        "Photograph completed work",
      ]),
      description: "Flexible template for one-off requests outside standard job types.",
    },
  ]).run();

  console.log("Inserted 5 job templates.");

  console.log("Seed complete.");
}

run();
