/**
 * Subcontractor tracking shared by the server and the app.
 *
 * 1099-NEC: payments to a non-employee for services must be reported once they
 * reach the threshold for the year. $600 through 2025; $2,000 for payments made
 * in 2026 (One Big Beautiful Bill Act), inflation-adjusted from 2027.
 * Source: https://www.irs.gov/publications/p1099
 */
export const NEC_THRESHOLDS: { year: number; amount: number }[] = [
  { year: 2025, amount: 600 },
  { year: 2026, amount: 2000 },
];
export function necThreshold(year: number): { amount: number; confirmed: boolean } {
  let pick = NEC_THRESHOLDS[0];
  for (const t of NEC_THRESHOLDS) if (year >= t.year) pick = t;
  if (year < NEC_THRESHOLDS[0].year) return { amount: 600, confirmed: true };
  return { amount: pick.amount, confirmed: NEC_THRESHOLDS.some(t => t.year === year) };
}

export const SUB_PAYMENT_METHODS = [
  { value: "check", label: "Check" }, { value: "cash", label: "Cash" }, { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" }, { value: "bank_transfer", label: "Bank transfer" }, { value: "other", label: "Other" },
] as const;

export type Subcontractor = {
  id: number; name: string; businessName: string | null; email: string | null; phone: string | null; services: string | null;
  payType: "per_job" | "hourly"; defaultPay: number | null; w9OnFile: boolean; insuranceExpires: string | null; notes: string | null;
  active: boolean; createdAt: string; updatedAt: string;
  // Totals (from the list endpoint)
  earned: number; paid: number; owed: number; paidThisYear: number; completedJobs: number; upcomingJobs: number;
};
export type SubJob = { jobId: number; scheduledDate: string; status: string; jobType: string; propertyId: number; propertyName: string | null; pay: number };
export type SubPayment = { id: number; subcontractorId: number; paidDate: string; amount: number; method: string | null; reference: string | null; jobId: number | null; note: string | null; createdAt: string; createdBy: string };
export type JobAssignment = { jobId: number; subcontractorId: number; pay: number; subcontractorName: string } | null;

/** Jobs in these statuses count as work done (earned). */
export const EARNED_STATUSES = ["completed", "invoiced"];
