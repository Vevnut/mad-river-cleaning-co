import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Car, Download, HardHat, Paperclip, Plus, ShoppingBag, Wallet } from "lucide-react";
import type { SubPayment } from "@shared/subcontractors";
import type { Property } from "@shared/schema";
import { categoryLabel, type Expense } from "@shared/expenses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatDate, businessDate } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/csv-export";
import { weekStart } from "@/lib/revenue";
import { ExpenseDialog } from "@/components/expenses/expense-dialog";

type Range = "week" | "month" | "year" | "last_year" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "week", label: "This week" }, { value: "month", label: "This month" },
  { value: "year", label: "This year" }, { value: "last_year", label: "Last year" }, { value: "all", label: "All time" },
];
// The header "New" menu opens the right form here, whether or not this page is already showing.
type Kind = "mileage" | "supply";
export const pendingExpense: { kind: "" | Kind; open: ((k: Kind) => void) | null } = { kind: "", open: null };
export function requestExpense(kind: Kind, navigate: (to: string) => void) {
  if (pendingExpense.open) pendingExpense.open(kind);
  else { pendingExpense.kind = kind; navigate("/expenses"); }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function bounds(range: Range): [string, string] {
  const today = businessDate();
  const [y, m, d] = today.split("-").map(Number);
  if (range === "week") { const s = weekStart(new Date(y, m - 1, d)); return [iso(s), iso(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6))]; }
  if (range === "month") return [`${today.slice(0, 7)}-01`, iso(new Date(y, m, 0))];
  if (range === "year") return [`${y}-01-01`, `${y}-12-31`];
  if (range === "last_year") return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  return ["0000-01-01", "9999-12-31"];
}
const miles = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })} mi`;

export default function ExpensesPage() {
  const { data: expenses = [], isLoading } = useQuery<Expense[]>({ queryKey: ["/api/expenses"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: subPayments = [] } = useQuery<SubPayment[]>({ queryKey: ["/api/subcontractor-payments"] });
  const [range, setRange] = useState<Range>("month");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState<"" | "mileage" | "supply">(() => { const k = pendingExpense.kind; pendingExpense.kind = ""; return k; });
  useEffect(() => { pendingExpense.open = k => setAdding(k); return () => { pendingExpense.open = null; }; }, []);
  const propertyName = (id: number | null) => (id ? properties.find(p => p.id === id)?.name ?? "" : "");

  function details(e: Expense) {
    const place = propertyName(e.propertyId);
    const parts = e.kind === "mileage"
      ? [e.fromLocation && e.toLocation ? `${e.fromLocation} → ${e.toLocation}` : e.toLocation || e.fromLocation, e.roundTrip ? "round trip" : null]
      : [categoryLabel(e.category), e.vendor];
    const text = parts.filter(Boolean).join(" · ");
    return place && !text.includes(place) ? [text, place].filter(Boolean).join(" · ") : text;
  }

  const [from, to] = bounds(range);
  const rows = useMemo(() => expenses.filter(e => e.expenseDate >= from && e.expenseDate <= to), [expenses, from, to]);
  const totals = useMemo(() => {
    const t = { all: 0, mileage: 0, miles: 0, trips: 0, supplies: 0, receipts: 0, supplyCount: 0 };
    for (const e of rows) {
      t.all += e.amount;
      if (e.kind === "mileage") { t.mileage += e.amount; t.miles += e.totalMiles ?? 0; t.trips++; }
      else { t.supplies += e.amount; t.supplyCount++; if (e.receiptCount) t.receipts++; }
    }
    return t;
  }, [rows]);
  const subs = useMemo(() => {
    const list = subPayments.filter(p => p.paidDate >= from && p.paidDate <= to);
    return { amount: Math.round(list.reduce((n, p) => n + p.amount, 0) * 100) / 100, count: list.length };
  }, [subPayments, from, to]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of rows) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
    return Array.from(m.entries()).map(([k, v]) => ({ key: k, label: categoryLabel(k), amount: Math.round(v * 100) / 100 })).sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const rangeLabel = RANGES.find(r => r.value === range)!.label.toLowerCase();

  function exportCsv() {
    exportRowsToCsv(`expenses-${range === "all" ? "all-time" : from}.csv`,
      ["Date", "Type", "Category", "Description", "Vendor", "From", "To", "Miles", "Round trip", "Rate per mile", "Amount", "Paid with", "Property", "Receipts", "Notes"],
      [...rows].reverse().map(e => [e.expenseDate, e.kind === "mileage" ? "Mileage" : "Supply", categoryLabel(e.category), e.description, e.vendor ?? "",
        e.fromLocation ?? "", e.toLocation ?? "", e.totalMiles ?? "", e.kind === "mileage" ? (e.roundTrip ? "Yes" : "No") : "", e.ratePerMile ?? "",
        e.amount.toFixed(2), e.paymentMethod ?? "", propertyName(e.propertyId), e.receiptCount, e.notes ?? ""]));
  }

  return (
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Expenses</h1>
          <p className="text-sm text-muted-foreground">Mileage and supply costs, ready for your records and taxes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdding("mileage")} className="gap-1.5" data-testid="button-log-mileage"><Car className="h-4 w-4" />Log mileage</Button>
          <Button variant="outline" onClick={() => setAdding("supply")} className="gap-1.5" data-testid="button-add-supply"><Plus className="h-4 w-4" />Add supply cost</Button>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ToggleGroup type="single" size="sm" variant="outline" value={range} onValueChange={v => v && setRange(v as Range)} className="justify-start" aria-label="Date range" data-testid="toggle-expense-range">
          {RANGES.map(r => <ToggleGroupItem key={r.value} value={r.value} className="h-8 whitespace-nowrap px-3 text-xs" data-testid={`toggle-expense-range-${r.value}`}>{r.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Wallet, title: "Total expenses", value: formatMoney(totals.all + subs.amount), sub: subs.count ? "Including subcontractors" : `${rows.length} ${rows.length === 1 ? "entry" : "entries"} ${rangeLabel}`, id: "total" },
          { icon: Car, title: "Mileage", value: formatMoney(totals.mileage), sub: `${miles(totals.miles)} · ${totals.trips} ${totals.trips === 1 ? "trip" : "trips"}`, id: "mileage" },
          { icon: ShoppingBag, title: "Supplies", value: formatMoney(totals.supplies), sub: totals.supplyCount ? `${totals.receipts} of ${totals.supplyCount} with receipts` : "No purchases", id: "supplies" },
          { icon: HardHat, title: "Subcontractors", value: formatMoney(subs.amount), sub: <Link href="/subcontractors" className="underline">{subs.count} {subs.count === 1 ? "payment" : "payments"}</Link>, id: "subcontractors" },
        ].map(k => (
          <Card key={k.id}>
            <CardContent className="flex items-start gap-3 pt-5">
              <div className="rounded-md bg-primary/10 p-2 text-primary"><k.icon className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{k.title}</p>
                <p className="text-xl font-semibold tabular-nums" data-testid={`text-expense-kpi-${k.id}`}>{isLoading ? "—" : k.value}</p>
                <p className="text-xs text-muted-foreground">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr] [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">By category</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {byCategory.length === 0 ? <p className="text-sm text-muted-foreground">Nothing logged {rangeLabel}.</p> : byCategory.map(c => (
              <div key={c.key} className="space-y-1" data-testid={`category-expense-${c.key}`}>
                <div className="flex justify-between text-sm"><span>{c.label}</span><span className="tabular-nums font-medium">{formatMoney(c.amount)}</span></div>
                <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${totals.all ? Math.max(2, (c.amount / totals.all) * 100) : 0}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">Entries</CardTitle>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv} disabled={!rows.length} data-testid="button-export-expenses-csv"><Download className="h-3.5 w-3.5" />Export CSV</Button>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40 w-full" /> : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground" data-testid="empty-expenses">
                <Car className="h-6 w-6" />
                <p className="text-sm">No expenses {rangeLabel}.</p>
                <p className="text-xs">Log a trip or a supply run and it shows up here.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <Table data-testid="table-expenses">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[92px]">Date</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Miles</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(e => (
                      <TableRow key={e.id} className="cursor-pointer" onClick={() => setEditing(e)} data-testid={`row-expense-${e.id}`}>
                        <TableCell className="whitespace-nowrap align-top text-sm tabular-nums">{formatDate(e.expenseDate).replace(/, \d{4}$/, "")}</TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            {e.kind === "mileage" ? <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            <span className="truncate">{e.description}</span>
                            {e.receiptCount > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={`${e.receiptCount} receipt photo${e.receiptCount === 1 ? "" : "s"}`} />}
                          </div>
                          <p className="text-xs text-muted-foreground">{details(e)}</p>
                          {e.kind === "mileage" && <p className="text-xs text-muted-foreground md:hidden">{miles(e.totalMiles ?? 0)}</p>}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-right align-top text-sm tabular-nums md:table-cell">{e.kind === "mileage" ? miles(e.totalMiles ?? 0) : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-right align-top text-sm font-medium tabular-nums">{formatMoney(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Mileage uses the IRS business rate for each trip's date unless you set your own. Tap an entry to edit it.</p>
          </CardContent>
        </Card>
      </div>

      <ExpenseDialog open={!!adding} onOpenChange={v => !v && setAdding("")} defaultKind={adding || "mileage"} />
      <ExpenseDialog open={!!editing} onOpenChange={v => !v && setEditing(null)} expense={editing} />
    </div>
  );
}
