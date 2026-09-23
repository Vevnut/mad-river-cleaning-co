import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Download, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import type { Job, Invoice, Customer, Property, Schedule, Staff } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMoney, formatDate } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/csv-export";

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  custom: "Custom",
};

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function ReportsPage() {
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: schedules = [] } = useQuery<Schedule[]>({ queryKey: ["/api/schedules"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });

  const isLoading = jobsLoading || invoicesLoading;
  const customerById = (id: number) => customers.find((c) => c.id === id);
  const propertyById = (id: number) => properties.find((p) => p.id === id);
  const staffById = (id: number | null) => staffList.find((s) => s.id === id);

  // --- Revenue by month (from paid + partial invoice amountPaid, plus total for sent/overdue as booked revenue) ---
  const revenueByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      const key = monthKey(inv.issueDate);
      map.set(key, (map.get(key) ?? 0) + inv.total);
    }
    const keys = Array.from(map.keys()).sort();
    return keys.map((k) => ({ month: monthLabel(k), key: k, revenue: Math.round(map.get(k)! * 100) / 100 }));
  }, [invoices]);

  // --- Jobs by property ---
  const jobsByProperty = useMemo(() => {
    const map = new Map<number, { count: number; revenue: number }>();
    for (const j of jobs) {
      const entry = map.get(j.propertyId) ?? { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += j.price;
      map.set(j.propertyId, entry);
    }
    return Array.from(map.entries())
      .map(([propertyId, stats]) => ({ propertyId, ...stats, property: propertyById(propertyId) }))
      .sort((a, b) => b.count - a.count);
  }, [jobs, properties]);

  // --- Unpaid / overdue invoices ---
  const unpaidInvoices = useMemo(
    () => invoices.filter((i) => i.status === "overdue" || i.status === "partial" || i.status === "sent" || i.status === "viewed")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [invoices]
  );

  // --- Top customers by revenue ---
  const topCustomers = useMemo(() => {
    const map = new Map<number, number>();
    for (const inv of invoices) {
      map.set(inv.customerId, (map.get(inv.customerId) ?? 0) + inv.total);
    }
    return Array.from(map.entries())
      .map(([customerId, revenue]) => ({ customerId, revenue, customer: customerById(customerId) }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [invoices, customers]);

  // --- Recurring jobs summary ---
  const recurringSummary = useMemo(() => {
    return schedules
      .filter((s) => s.active)
      .map((s) => {
        const property = propertyById(s.propertyId);
        const futureJobs = jobs
          .filter((j) => j.scheduleId === s.id && j.scheduledDate >= new Date().toISOString().slice(0, 10))
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
        return {
          scheduleId: s.id,
          property,
          frequency: s.frequency,
          nextDate: futureJobs[0]?.scheduledDate ?? null,
          staff: staffById(s.assignedStaffId ?? null),
        };
      })
      .sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"));
  }, [schedules, jobs, properties, staffList]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-semibold" data-testid="text-page-title">Reports</h1>

      {/* Revenue by month */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Revenue by Month</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportRowsToCsv("revenue-by-month.csv", ["Month", "Revenue"], revenueByMonth.map((r) => [r.month, r.revenue.toFixed(2)]))}
            disabled={revenueByMonth.length === 0}
            data-testid="button-export-revenue-csv"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : revenueByMonth.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground" data-testid="empty-revenue-chart">
              <BarChart3 className="h-6 w-6" />
              <p className="text-sm">No invoice data yet.</p>
            </div>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                  <Tooltip
                    formatter={(v: number) => formatMoney(v)}
                    contentStyle={{ borderRadius: 8, fontSize: 12, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jobs by property */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Jobs by Property</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportRowsToCsv(
              "jobs-by-property.csv",
              ["Property", "Job Count", "Total Revenue"],
              jobsByProperty.map((r) => [r.property?.name ?? `Property #${r.propertyId}`, r.count, r.revenue.toFixed(2)])
            )}
            disabled={jobsByProperty.length === 0}
            data-testid="button-export-jobs-by-property-csv"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : jobsByProperty.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-jobs-by-property">No jobs yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[420px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Property</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Job Count</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobsByProperty.map((r) => (
                    <TableRow key={r.propertyId} data-testid={`row-jobs-by-property-${r.propertyId}`}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/properties/${r.propertyId}`} className="hover:underline font-medium">
                          {r.property?.name ?? `Property #${r.propertyId}`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{r.count}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unpaid / overdue invoices */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Unpaid &amp; Overdue Invoices</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportRowsToCsv(
              "unpaid-overdue-invoices.csv",
              ["Invoice #", "Customer", "Due Date", "Total", "Amount Paid", "Status"],
              unpaidInvoices.map((i) => [i.invoiceNumber, customerById(i.customerId)?.name ?? "", i.dueDate, i.total.toFixed(2), i.amountPaid.toFixed(2), i.status])
            )}
            disabled={unpaidInvoices.length === 0}
            data-testid="button-export-unpaid-csv"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : unpaidInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-unpaid-invoices">All invoices are paid. Nice work.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                    <TableHead className="min-w-[160px]">Customer</TableHead>
                    <TableHead className="whitespace-nowrap">Due Date</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Balance</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidInvoices.map((inv) => (
                    <TableRow key={inv.id} data-testid={`row-unpaid-invoice-${inv.id}`}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/invoices/${inv.id}`} className="hover:underline font-medium">{inv.invoiceNumber}</Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{customerById(inv.customerId)?.name ?? `Customer #${inv.customerId}`}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(inv.total)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">{formatMoney(inv.total - inv.amountPaid)}</TableCell>
                      <TableCell className="whitespace-nowrap"><StatusBadge status={inv.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top customers by revenue */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Top Customers by Revenue</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportRowsToCsv(
              "top-customers.csv",
              ["Customer", "Total Revenue"],
              topCustomers.map((r) => [r.customer?.name ?? `Customer #${r.customerId}`, r.revenue.toFixed(2)])
            )}
            disabled={topCustomers.length === 0}
            data-testid="button-export-top-customers-csv"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-top-customers">No invoiced revenue yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((r) => (
                    <TableRow key={r.customerId} data-testid={`row-top-customer-${r.customerId}`}>
                      <TableCell>
                        <Link href={`/customers/${r.customerId}`} className="hover:underline font-medium">
                          {r.customer?.name ?? `Customer #${r.customerId}`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recurring jobs summary */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Recurring Jobs Summary</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportRowsToCsv(
              "recurring-jobs.csv",
              ["Property", "Frequency", "Next Date", "Assigned Staff"],
              recurringSummary.map((r) => [r.property?.name ?? "", FREQUENCY_LABEL[r.frequency] ?? r.frequency, r.nextDate ?? "", r.staff?.name ?? "Unassigned"])
            )}
            disabled={recurringSummary.length === 0}
            data-testid="button-export-recurring-csv"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {recurringSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-recurring-jobs">No active recurring schedules.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Property</TableHead>
                    <TableHead className="whitespace-nowrap">Frequency</TableHead>
                    <TableHead className="whitespace-nowrap">Next Date</TableHead>
                    <TableHead className="whitespace-nowrap">Assigned Staff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurringSummary.map((r) => (
                    <TableRow key={r.scheduleId} data-testid={`row-recurring-${r.scheduleId}`}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/properties/${r.property?.id}`} className="hover:underline font-medium">
                          {r.property?.name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize whitespace-nowrap">{FREQUENCY_LABEL[r.frequency] ?? r.frequency}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{r.nextDate ? formatDate(r.nextDate) : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.staff?.name ?? "Unassigned"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
