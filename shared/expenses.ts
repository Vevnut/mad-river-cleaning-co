/**
 * Expense tracking shared by the server and the app.
 *
 * IRS business standard mileage rates (dollars per mile), newest last.
 * Source: https://www.irs.gov/tax-professionals/standard-mileage-rates
 * 2026 had a mid-year change: 72.5¢ Jan 1 – Jun 30, 76¢ from Jul 1.
 * Add a row here when the IRS announces a new rate.
 */
export const IRS_MILEAGE_RATES: { from: string; rate: number; note: string }[] = [
  { from: "2024-01-01", rate: 0.67, note: "IRS 2024 rate" },
  { from: "2025-01-01", rate: 0.70, note: "IRS 2025 rate" },
  { from: "2026-01-01", rate: 0.725, note: "IRS rate, Jan–Jun 2026" },
  { from: "2026-07-01", rate: 0.76, note: "IRS rate from Jul 1, 2026" },
];
/** The newest year the table is known to cover. Trips after it get a "check the IRS rate" hint. */
export const MILEAGE_TABLE_THROUGH = "2026-12-31";

export function irsRateFor(date: string): { rate: number; note: string; confirmed: boolean } {
  let pick = IRS_MILEAGE_RATES[0];
  for (const r of IRS_MILEAGE_RATES) if (date >= r.from) pick = r;
  return { rate: pick.rate, note: pick.note, confirmed: date <= MILEAGE_TABLE_THROUGH && date >= IRS_MILEAGE_RATES[0].from };
}

export const SUPPLY_CATEGORIES = [
  { value: "cleaning_supplies", label: "Cleaning supplies" },
  { value: "paper_trash", label: "Paper goods & trash bags" },
  { value: "laundry", label: "Laundry" },
  { value: "guest_restocking", label: "Guest restocking" },
  { value: "equipment_tools", label: "Equipment & tools" },
  { value: "parking_tolls", label: "Parking & tolls" },
  { value: "other", label: "Other" },
] as const;
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number]["value"];
/** Gas entries are stored with kind "mileage" (older ones were logged by miles; new ones are just the $ spent). */
export const isGasCategory = (v: string | null | undefined) => v === "gas" || v === "mileage";
export const categoryLabel = (v: string | null | undefined) =>
  isGasCategory(v) ? "Gas" : SUPPLY_CATEGORIES.find(c => c.value === v)?.label ?? "Other";

export const PAYMENT_METHODS = [
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "venmo", label: "Venmo" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;

export type Expense = {
  id: number;
  kind: "mileage" | "supply";
  expenseDate: string;
  description: string;
  category: string;
  vendor: string | null;
  amount: number;
  miles: number | null;
  roundTrip: boolean;
  totalMiles: number | null;
  ratePerMile: number | null;
  fromLocation: string | null;
  toLocation: string | null;
  propertyId: number | null;
  jobId: number | null;
  paymentMethod: string | null;
  notes: string | null;
  receiptCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export const roundCents = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const mileageAmount = (miles: number, roundTrip: boolean, rate: number) =>
  roundCents(miles * (roundTrip ? 2 : 1) * rate);
