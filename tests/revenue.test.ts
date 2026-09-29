import assert from "node:assert/strict";
import { revenueBy, expensesBy, profitBy, weekStart } from "../client/src/lib/revenue";
const inv = (issueDate: string, total: number, status = "paid") => ({ issueDate, total, status }) as any;
let n = 0; const check = (m: string, f: () => void) => { f(); n++; console.log("PASS " + m); };
const today = new Date(2026, 8, 28); // Mon Sep 28 2026
check("weeks start on Monday", () => {
  assert.equal(weekStart(new Date(2026, 8, 27)).getDate(), 21); // Sunday belongs to week of Mon 21
  assert.equal(weekStart(new Date(2026, 8, 28)).getDate(), 28);
});
const data = [inv("2026-09-27", 410), inv("2026-09-26", 90, "sent"), inv("2026-09-21", 100, "draft"), inv("2026-09-14", 50), inv("2026-09-15", 999, "canceled"), inv("2026-08-31", 20)];
const weeks = revenueBy(data, "week", undefined, today);
check("weekly totals group Monday–Sunday and skip canceled invoices", () => {
  assert.deepEqual(weeks.map(w => [w.key, w.revenue, w.invoices]), [["2026-08-31", 20, 1], ["2026-09-07", 0, 0], ["2026-09-14", 50, 1], ["2026-09-21", 600, 3], ["2026-09-28", 0, 0]]);
});
check("week labels show the date range", () => assert.equal(weeks[3].range, "Sep 21 – Sep 27, 2026"));
check("weekly and monthly totals agree", () => {
  const months = revenueBy(data, "month", undefined, today);
  assert.equal(months.reduce((a, m) => a + m.revenue, 0), weeks.reduce((a, w) => a + w.revenue, 0));
  assert.deepEqual(months.map(m => [m.key, m.revenue]), [["2026-08-01", 20], ["2026-09-01", 650]]);
});
check("last N periods end with the current one", () => {
  const w = revenueBy(data, "week", 8, today); assert.equal(w.length, 8); assert.equal(w[7].key, "2026-09-28");
  const m = revenueBy(data, "month", 6, today); assert.equal(m.length, 6); assert.equal(m[0].key, "2026-04-01");
});
check("weeks crossing a month and year boundary", () => {
  const w = revenueBy([inv("2026-12-31", 10), inv("2027-01-03", 5)], "week", undefined, new Date(2027, 0, 4));
  assert.deepEqual(w.map(x => [x.key, x.revenue]), [["2026-12-28", 15], ["2027-01-04", 0]]);
});
check("no invoices gives an empty history", () => assert.deepEqual(revenueBy([], "week", undefined, today), []));
check("invoices dated ahead are included", () => assert.equal(revenueBy([inv("2026-10-12", 30)], "week", undefined, today).at(-1)!.revenue, 30));
const exp = (expenseDate: string, kind: "mileage" | "supply", amount: number, totalMiles: number | null = null) => ({ expenseDate, kind, amount, totalMiles });
const ex = [exp("2026-09-27", "mileage", 18.85, 24.8), exp("2026-09-22", "supply", 42.2), exp("2026-09-15", "mileage", 7.6, 10)];
check("expenses split into mileage and supplies per week", () => {
  const w = expensesBy(ex, "week", undefined, today);
  assert.deepEqual(w.map(x => [x.key, x.mileage, x.supplies, x.total, x.miles]), [["2026-09-14", 7.6, 0, 7.6, 10], ["2026-09-21", 18.85, 42.2, 61.05, 24.8], ["2026-09-28", 0, 0, 0, 0]]);
});
check("profit is revenue minus expenses, skipping canceled invoices", () => {
  const m = profitBy(data, ex, "month", undefined, today);
  assert.deepEqual(m.map(x => [x.key, x.revenue, x.expenses, x.profit]), [["2026-08-01", 20, 0, 20], ["2026-09-01", 650, 68.65, 581.35]]);
});
console.log(`${n} revenue checks passed.`);
