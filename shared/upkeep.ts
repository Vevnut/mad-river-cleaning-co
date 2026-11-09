/**
 * Deep-cleaning tasks and hot tub drains tracked per property. The quote's deep clean is
 * "recommended 1x a month" and a full hot tub drain "1x per month", so each is due 30 days
 * after it was last done. Keys are stored with every log entry: rename a label freely, but
 * never change or reuse a key.
 */
export const UPKEEP_DUE_DAYS = 30;

export type UpkeepTask = { key: string; label: string; area: string };

export const DEEP_CLEAN_TASKS: UpkeepTask[] = [
  { key: "blankets", label: "Wash blankets/couch throws", area: "Laundry" },
  { key: "comforters", label: "Wash bed comforters and decorative pillowcases", area: "Laundry" },
  { key: "area_rugs", label: "Wash small washable area rugs", area: "Laundry" },
  { key: "cabinets_inside", label: "Vacuum interior of kitchen cabinets", area: "Kitchen" },
  { key: "cabinets_outside", label: "Clean exterior of kitchen cabinets", area: "Kitchen" },
  { key: "backsplash", label: "Clean kitchen backsplash/tile/grout", area: "Kitchen" },
  { key: "filters", label: "Dishwasher filter & hood fan grease filters", area: "Kitchen" },
  { key: "trash_cans", label: "Clean kitchen/bathroom trash cans", area: "Kitchen & bath" },
  { key: "showers", label: "Deep clean showers/bathtubs/walls/tile/grout", area: "Bathrooms" },
  { key: "closets", label: "Vacuum closets", area: "Bedrooms" },
  { key: "drawers", label: "Vacuum dresser drawers/nightstands", area: "Bedrooms" },
  { key: "scuffs", label: "Scuff marks on walls/stairwells", area: "All areas" },
  { key: "mop", label: "Entire home mop", area: "All areas" },
  { key: "cushions", label: "Vacuum underneath couch/chair cushions", area: "All areas" },
  { key: "vents", label: "Vacuum floor vents", area: "All areas" },
];

export const HOT_TUB_DRAIN: UpkeepTask = { key: "hot_tub_drain", label: "Full drain & refill of hot tub", area: "Hot tub" };

export const UPKEEP_TASKS = [...DEEP_CLEAN_TASKS, HOT_TUB_DRAIN];
export const UPKEEP_KEYS = UPKEEP_TASKS.map(t => t.key);
export const taskLabel = (key: string) => UPKEEP_TASKS.find(t => t.key === key)?.label ?? key;

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export type UpkeepState = "never" | "due" | "soon" | "ok";
/** "soon" is the last week before it's due. */
export function upkeepState(lastDone: string | null | undefined, today: string): UpkeepState {
  if (!lastDone) return "never";
  const age = daysBetween(lastDone, today);
  return age >= UPKEEP_DUE_DAYS ? "due" : age >= UPKEEP_DUE_DAYS - 7 ? "soon" : "ok";
}
