// Non-destructive INSERT-only seed for the Stays calendar. Adds sample guest
// bookings on the existing test properties (Coastal Vista Rentals, White
// Mountain Getaways, etc. — ids 115+) so the multi-day Stays timeline has
// realistic data to render, including a back-to-back turnover and an
// overlapping pair to exercise lane stacking. Does NOT touch customers,
// properties, jobs, invoices, or the real Graeme Bradley entry.
import { db } from "../server/storage";
import { stays } from "../shared/schema";

function iso(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const rows = [
    // Saco River Retreat (115) — a completed stay, a current stay, and an
    // upcoming stay with a same-day turnover (checkout == next check-in).
    { propertyId: 115, guestName: "Rachel Kim", guestPhone: "6175551221", guestCount: 4, platform: "airbnb" as const, checkInDate: iso(-6), checkOutDate: iso(-3), status: "confirmed" as const, notes: "Left a 5-star review." },
    { propertyId: 115, guestName: "The Alvarez Family", guestPhone: "6035559981", guestCount: 6, platform: "vrbo" as const, checkInDate: iso(-1), checkOutDate: iso(2), status: "confirmed" as const, notes: null },
    { propertyId: 115, guestName: "Ben Okafor", guestPhone: null, guestCount: 2, platform: "airbnb" as const, checkInDate: iso(2), checkOutDate: iso(5), status: "confirmed" as const, notes: "Same-day turnover — back-to-back with Alvarez checkout." },

    // Cranmore View Condo 3B (116) — two overlapping bookings (data-entry
    // overlap) to exercise lane stacking, plus a tentative future stay.
    { propertyId: 116, guestName: "Priya & Sam", guestPhone: "6035552210", guestCount: 2, platform: "direct" as const, checkInDate: iso(0), checkOutDate: iso(4), status: "confirmed" as const, notes: "Repeat guest, has gate code." },
    { propertyId: 116, guestName: "Marcus Webb", guestPhone: null, guestCount: 3, platform: "booking_com" as const, checkInDate: iso(2), checkOutDate: iso(6), status: "confirmed" as const, notes: "Overlaps Priya & Sam — verify dates with owner." },
    { propertyId: 116, guestName: "Ellis Party", guestPhone: null, guestCount: 5, platform: "other" as const, checkInDate: iso(10), checkOutDate: iso(14), status: "tentative" as const, notes: "Awaiting deposit." },

    // Echo Lake Cabin (117) — a longer week-plus stay spanning a week
    // boundary, good for testing the month view.
    { propertyId: 117, guestName: "Devon & Casey Marsh", guestPhone: "2075553312", guestCount: 4, platform: "airbnb" as const, checkInDate: iso(-2), checkOutDate: iso(9), status: "confirmed" as const, notes: "9-night foliage trip." },

    // Jackson Falls House (119) — a short upcoming weekend booking.
    { propertyId: 119, guestName: "Nora Fitzgerald", guestPhone: "6175557766", guestCount: 8, platform: "vrbo" as const, checkInDate: iso(4), checkOutDate: iso(6), status: "confirmed" as const, notes: "Bachelorette weekend — extra towels requested." },

    // Bartlett Brook Cottage (120) — a canceled stay (should be hidden by
    // default) plus a confirmed one right after.
    { propertyId: 120, guestName: "Canceled Guest", guestPhone: null, guestCount: 2, platform: "airbnb" as const, checkInDate: iso(1), checkOutDate: iso(3), status: "canceled" as const, notes: "Guest canceled — refunded." },
    { propertyId: 120, guestName: "Jonas Whitfield", guestPhone: "6035554431", guestCount: 3, platform: "airbnb" as const, checkInDate: iso(3), checkOutDate: iso(7), status: "confirmed" as const, notes: null },
  ];

  for (const r of rows) {
    db.insert(stays).values(r).run();
  }
  console.log(`Inserted ${rows.length} test stays.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
