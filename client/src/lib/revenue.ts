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
 * Generic per-period totals, oldest first, including empty periods so gaps are visible.
 * `last` limits the result to the most recent N periods ending with the current one;
 * otherwise it runs from the earliest item's period to the current (or latest) period.
 */
function byPeriod<T, A>(items: T[], dateOf: (t: T) => string | null | undefined, zero: () => A, add: (acc: A, t: T) => void,
  period: RevenuePeriod, last?: number, today = new Date()) {
  const totals = new Map<string, A>();
  let first: Date | null = null, latest: Date | null = null;
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const s = start(parse(date), period);
    if (!first || s < first) first = s;
    if (!latest || s > latest) latest = s;
    const acc = totals.get(iso(s)) ?? zero();
    add(acc, item);
    totals.set(iso(s), acc);
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
    to = latest > current ? latest : current; // includes items dated ahead
  }
  const out: ({ key: string; label: string; range: string } & A)[] = [];
  for (let s = from; s <= to && out.length < 2000; s = next(s, period)) {
    out.push({ key: iso(s), ...describe(s, period), ...(totals.get(iso(s)) ?? zero()) });
  }
  return out;
}
const cents = (v: number) => Math.round(v * 100) / 100;

/** Revenue per month or week (invoice totals by issue date, canceled invoices excluded). */
export function revenueBy(invoices: Invoice[], period: RevenuePeriod, last?: number, today = new Date()): RevenueBucket[] {
  return byPeriod(invoices.filter(counts), i => i.issueDate, () => ({ revenue: 0, invoices: 0 }),
    (a, i) => { a.revenue += i.total; a.invoices++; }, period, last, today)
    .map(b => ({ ...b, revenue: cents(b.revenue) }));
}

type ExpenseLike = { expenseDate: string; kind: "mileage" | "supply"; amount: number; totalMiles: number | null };
export type ExpenseBucket = { key: string; label: string; range: string; mileage: number; supplies: number; total: number; miles: number; entries: number };

/** Expenses per month or week, split into mileage and supplies. */
export function expensesBy(expenses: ExpenseLike[], period: RevenuePeriod, last?: number, today = new Date()): ExpenseBucket[] {
  return byPeriod(expenses, e => e.expenseDate, () => ({ mileage: 0, supplies: 0, total: 0, miles: 0, entries: 0 }),
    (a, e) => { if (e.kind === "mileage") { a.mileage += e.amount; a.miles += e.totalMiles ?? 0; } else a.supplies += e.amount; a.total += e.amount; a.entries++; },
    period, last, today)
    .map(b => ({ ...b, mileage: cents(b.mileage), supplies: cents(b.supplies), total: cents(b.total), miles: Math.round(b.miles * 10) / 10 }));
}

export type ProfitBucket = { key: string; label: string; range: string; revenue: number; expenses: number; profit: number };

/** Revenue minus expenses per period. Both series are aligned on the same buckets. */
export function profitBy(invoices: Invoice[], expenses: ExpenseLike[], period: RevenuePeriod, last?: number, today = new Date()): ProfitBucket[] {
  type Row = { kind: "inv"; date: string; amount: number } | { kind: "exp"; date: string; amount: number };
  const rows: Row[] = [
    ...invoices.filter(counts).map(i => ({ kind: "inv" as const, date: i.issueDate, amount: i.total })),
    ...expenses.map(e => ({ kind: "exp" as const, date: e.expenseDate, amount: e.amount })),
  ];
  return byPeriod(rows, r => r.date, () => ({ revenue: 0, expenses: 0, profit: 0 }),
    (a, r) => { if (r.kind === "inv") a.revenue += r.amount; else a.expenses += r.amount; }, period, last, today)
    .map(b => ({ ...b, revenue: cents(b.revenue), expenses: cents(b.expenses), profit: cents(b.revenue - b.expenses) }));
}

export type YearToDate = { year: number; from: string; to: string; revenue: number; invoices: number; lastYear: number; delta: number | null };

/**
 * Revenue from Jan 1 through today (by invoice issue date, canceled excluded),
 * compared with the same stretch of last year. `todayIso` is a YYYY-MM-DD business date.
 */
export function yearToDate(invoices: Invoice[], todayIso: string): YearToDate {
  const year = Number(todayIso.slice(0, 4));
  const from = `${year}-01-01`;
  const lastFrom = `${year - 1}-01-01`;
  // Same calendar day last year (Feb 29 falls back to Feb 28).
  const md = todayIso.slice(5, 10) === "02-29" ? "02-28" : todayIso.slice(5, 10);
  const lastTo = `${year - 1}-${md}`;
  let revenue = 0, count = 0, lastYear = 0;
  for (const inv of invoices) {
    if (!counts(inv) || !inv.issueDate) continue;
    const d = inv.issueDate.slice(0, 10);
    if (d >= from && d <= todayIso) { revenue += inv.total; count++; }
    else if (d >= lastFrom && d <= lastTo) lastYear += inv.total;
  }
  revenue = cents(revenue); lastYear = cents(lastYear);
  return { year, from, to: todayIso, revenue, invoices: count, lastYear, delta: lastYear > 0 ? Math.round(((revenue - lastYear) / lastYear) * 100) : null };
}
