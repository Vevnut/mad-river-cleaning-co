import type { Invoice } from "@shared/schema";

export type RevenuePeriod = "month" | "week";
export type RevenueBucket = { key: string; label: string; range: string; revenue: number; invoices: number };

// Revenue = invoice totals by issue date. Canceled invoices are not revenue.
const counts = (inv: Invoice) => inv.status !== "canceled";

/** Parse YYYY-MM-DD as a local date (avoids time-zone shifts). */
function parse(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Weeks run Monday–Sunday, so a weekend's turnovers stay in the same week. */
export function weekStart(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}
function start(d: Date, period: RevenuePeriod): Date {
  return period === "week" ? weekStart(d) : new Date(d.getFullYear(), d.getMonth(), 1);
}
function next(d: Date, period: RevenuePeriod): Date {
  return period === "week" ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function describe(s: Date, period: RevenuePeriod): Pick<RevenueBucket, "label" | "range"> {
  if (period === "month") {
    const label = s.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return { label, range: s.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
  }
  const end = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  return { label: short(s), range: `${short(s)} – ${short(end)}, ${end.getFullYear()}` };
}

/**
 * Revenue per month or week, oldest first, including empty periods so gaps are visible.
 * `last` limits the result to the most recent N periods ending with the current one;
 * otherwise it runs from the first invoice's period to the current period.
 */
export function revenueBy(invoices: Invoice[], period: RevenuePeriod, last?: number, today = new Date()): RevenueBucket[] {
  const totals = new Map<string, { revenue: number; invoices: number }>();
  let first: Date | null = null, latest: Date | null = null;
  for (const inv of invoices) {
    if (!counts(inv) || !inv.issueDate) continue;
    const s = start(parse(inv.issueDate), period);
    if (!first || s < first) first = s;
    if (!latest || s > latest) latest = s;
    const t = totals.get(iso(s)) ?? { revenue: 0, invoices: 0 };
    t.revenue += inv.total; t.invoices++;
    totals.set(iso(s), t);
  }
  const current = start(today, period);
  let from: Date, to: Date;
  if (last) {
    to = current;
    from = period === "week"
      ? new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7 * (last - 1))
      : new Date(current.getFullYear(), current.getMonth() - (last - 1), 1);
  } else {
    if (!first || !latest) return [];
    from = first < current ? first : current;
    to = latest > current ? latest : current; // includes invoices dated ahead
  }
  const out: RevenueBucket[] = [];
  for (let s = from; s <= to && out.length < 2000; s = next(s, period)) {
    const t = totals.get(iso(s)) ?? { revenue: 0, invoices: 0 };
    out.push({ key: iso(s), ...describe(s, period), revenue: Math.round(t.revenue * 100) / 100, invoices: t.invoices });
  }
  return out;
}
