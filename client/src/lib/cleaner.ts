// What a cleaner login receives from /api/cleaner/* (server/cleaner.ts). No prices,
// invoices, customer contact details or internal notes are ever sent to cleaners.

export type CleanerPay = { earned: number; completedJobs: number; upcomingJobs: number; paid: number; owed: number; paidThisYear: number };
export type CleanerMe = {
  name: string; email: string; kind: "staff" | "subcontractor"; pay: CleanerPay | null;
  office: { name: string; phone: string; email: string };
};

/** Cleaners keep the app open all day: refresh their jobs when they come back to it, and every few minutes. */
export const LIVE = { staleTime: 60_000, refetchOnWindowFocus: true, refetchInterval: 5 * 60_000 } as const;
export const dial = (phone: string) => phone.replace(/[^\d+]/g, "");

export type CleanerAddress = { name: string; addressLine1: string; addressLine2: string | null; city: string; state: string; zip: string };
export type CleanerJobSummary = {
  id: number; scheduledDate: string; scheduledTime: string; durationMinutes: number; jobType: string;
  status: "scheduled" | "in_progress" | "completed" | "invoiced"; completedAt: string | null;
  property: CleanerAddress; customerName: string; pay: number | null; checklist: { done: number; total: number };
};
export type CleanerStay = { checkInDate: string; checkOutDate: string; guestCount: number | null } | null;
export type CleanerJob = CleanerJobSummary & {
  notes: string | null; damageNotes: string | null; canEdit: boolean;
  property: CleanerAddress & {
    unitType: string; bedrooms: number; fullBathrooms: number | null; halfBathrooms: number | null; bathrooms: number;
    maxOccupancy: number; checkInTime: string; checkOutTime: string;
    beds: Record<"king" | "queen" | "full" | "twin" | "bunk" | "sofa", number>;
    entryInstructions: string; accessNotes: string | null; supplyNotes: string | null;
  };
  checklistItems: { id: number; label: string; isCompleted: boolean }[];
  stays: { lastCheckOut: CleanerStay; nextCheckIn: CleanerStay };
};

const JOB_TYPES: Record<string, string> = {
  turnover: "Turnover", deep_clean: "Deep clean", inspection: "Inspection", one_time: "One-time clean", recurring: "Recurring clean", custom: "Clean",
};
export const jobTypeLabel = (t: string) => JOB_TYPES[t] ?? "Clean";

/** "14:30" → "2:30 PM". Leaves anything unexpected as typed. */
export function formatTime(value: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return value ?? "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** "Mon, Oct 21" for a YYYY-MM-DD business date. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00`));
}

export const addressLine = (p: CleanerAddress) => [p.addressLine1, p.addressLine2, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(", ");
export const mapsUrl = (p: CleanerAddress) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(p))}`;

export function bedsLine(beds: CleanerJob["property"]["beds"]): string {
  const names: [keyof typeof beds, string][] = [["king", "King"], ["queen", "Queen"], ["full", "Full"], ["twin", "Twin"], ["bunk", "Bunk"], ["sofa", "Sofa bed"]];
  return names.filter(([k]) => beds[k] > 0).map(([k, label]) => `${beds[k]} ${label}`).join(" · ");
}

export function bathsLine(p: CleanerJob["property"]): string {
  if (p.fullBathrooms == null && p.halfBathrooms == null) return `${p.bathrooms} bath`;
  const parts = [p.fullBathrooms ? `${p.fullBathrooms} full` : "", p.halfBathrooms ? `${p.halfBathrooms} half` : ""].filter(Boolean);
  return parts.length ? `${parts.join(" + ")} bath` : "No baths";
}
