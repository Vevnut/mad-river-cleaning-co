import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CalendarCheck, CalendarClock, CircleAlert, DollarSign, Users,
  Plus, TrendingUp, TrendingDown, Home, ClipboardList, Receipt,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import type { Customer, Job, Invoice, Staff } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMoney, formatDate, initials } from "@/lib/format";

interface DashboardPageProps {
  onNewCustomer: () => void;
  onNewProperty: () => void;
}

const REVENUE_TREND = [
  { month: "Mar", revenue: 0 },
  { month: "Apr", revenue: 0 },
  { month: "May", revenue: 0 },
  { month: "Jun", revenue: 0 },
  { month: "Jul", revenue: 0 },
  { month: "Aug", revenue: 0 },
];

export default function DashboardPage({ onNewCustomer, onNewProperty }: DashboardPageProps) {
  const { data: customers = [], isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const { data: jobs = [], isLoading: loadingJobs } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });

  const today = new Date().toISOString().slice(0, 10);

  const kpis = useMemo(() => {
    const todaysJobs = jobs.filter((j) => j.scheduledDate === today);
    const next7 = new Date();
    next7.setDate(next7.getDate() + 7);
    const upcoming = jobs.filter((j) => {
      const d = new Date(j.scheduledDate);
      return d >= new Date() && d <= next7;
    });
    const overdueInvoices = invoices.filter((i) => i.status === "overdue");
    const overdueTotal = overdueInvoices.reduce((sum, i) => sum + (i.total - i.amountPaid), 0);
    const monthlyRevenue = invoices
      .filter((i) => i.status === "paid" || i.status === "partial")
      .reduce((sum, i) => sum + i.amountPaid, 0);

    return {
      todaysJobsCount: todaysJobs.length,
      upcomingCount: upcoming.length,
      overdueCount: overdueInvoices.length,
      overdueTotal,
      monthlyRevenue,
      activeCustomers: customers.length,
    };
  }, [jobs, invoices, customers, today]);

  const isLoading = loadingCustomers || loadingJobs || loadingInvoices;

  const staffById = (id: number | null) => staffList.find((s) => s.id === id);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onNewCustomer} data-testid="button-quick-new-customer">
            <Plus className="h-3.5 w-3.5" /> New Customer
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onNewProperty} data-testid="button-quick-new-property">
            <Plus className="h-3.5 w-3.5" /> New Property
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled data-testid="button-quick-new-job">
            <Plus className="h-3.5 w-3.5" /> New Job
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled data-testid="button-quick-new-invoice">
            <Plus className="h-3.5 w-3.5" /> New Invoice
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={CalendarCheck}
          label="Today's Jobs"
          value={kpis.todaysJobsCount}
          loading={isLoading}
          testId="today-jobs"
        />
        <KpiCard
          icon={CalendarClock}
          label="Upcoming (7 days)"
          value={kpis.upcomingCount}
          loading={isLoading}
          testId="upcoming-jobs"
        />
        <KpiCard
          icon={CircleAlert}
          label="Overdue Invoices"
          value={kpis.overdueCount}
          subValue={formatMoney(kpis.overdueTotal)}
          loading={isLoading}
          tone="overdue"
          testId="overdue-invoices"
        />
        <KpiCard
          icon={DollarSign}
          label="Monthly Revenue"
          value={formatMoney(kpis.monthlyRevenue)}
          delta={0}
          loading={isLoading}
          testId="monthly-revenue"
        />
        <KpiCard
          icon={Users}
          label="Active Customers"
          value={kpis.activeCustomers}
          loading={isLoading}
          testId="active-customers"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Today's Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today&rsquo;s Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingJobs ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : jobs.filter((j) => j.scheduledDate === today).length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                text="No jobs scheduled for today."
                actionLabel="Schedule a Job"
                testId="today-jobs"
              />
            ) : (
              <ul className="space-y-2">
                {jobs
                  .filter((j) => j.scheduledDate === today)
                  .map((job) => (
                    <li key={job.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                      <div>
                        <p className="font-medium">Property #{job.propertyId}</p>
                        <p className="text-xs text-muted-foreground">{job.scheduledTime}</p>
                      </div>
                      <StatusBadge status={job.status} />
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Customers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Customers</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCustomers ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : customers.length === 0 ? (
              <EmptyState icon={Users} text="No customers yet." actionLabel="Add Customer" onAction={onNewCustomer} testId="recent-customers" />
            ) : (
              <ul className="space-y-2">
                {customers.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/customers/${c.id}`}
                      className="flex items-center gap-3 rounded-md p-2 text-sm hover-elevate"
                      data-testid={`link-recent-customer-${c.id}`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground shrink-0">
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.billingCity}, {c.billingState}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overdue invoices table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overdue Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <Skeleton className="h-24 w-full" />
          ) : invoices.filter((i) => i.status === "overdue").length === 0 ? (
            <EmptyState icon={Receipt} text="No overdue invoices. Nice work." testId="overdue-table" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices
                    .filter((i) => i.status === "overdue")
                    .map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>#{inv.customerId}</TableCell>
                        <TableCell>{inv.invoiceNumber}</TableCell>
                        <TableCell>{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(inv.total - inv.amountPaid)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue trend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Revenue by Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={REVENUE_TREND}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
                <Tooltip
                  formatter={(v: number) => formatMoney(v)}
                  contentStyle={{
                    borderRadius: 8,
                    fontSize: 12,
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="text-revenue-note">
            No invoices recorded yet — revenue chart will populate once jobs and invoices are added in Phase 2/3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subValue,
  delta,
  loading,
  tone,
  testId,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string | number;
  subValue?: string;
  delta?: number;
  loading?: boolean;
  tone?: "overdue";
  testId: string;
}) {
  return (
    <Card data-testid={`card-kpi-${testId}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${tone === "overdue" ? "text-status-overdue" : "text-muted-foreground"}`} />
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-16" />
        ) : (
          <p className="mt-1 text-xl font-semibold tabular-nums" data-testid={`text-kpi-value-${testId}`}>
            {value}
          </p>
        )}
        {subValue && !loading && (
          <p className="text-xs text-muted-foreground tabular-nums">{subValue}</p>
        )}
        {typeof delta === "number" && !loading && (
          <p className={`flex items-center gap-1 text-xs ${delta >= 0 ? "text-status-paid" : "text-status-overdue"}`}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta === 0 ? "No change vs last month" : `${Math.abs(delta)}% vs last month`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  text,
  actionLabel,
  onAction,
  testId,
}: {
  icon: typeof CalendarCheck;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  testId: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center" data-testid={`empty-${testId}`}>
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" onClick={onAction} data-testid={`button-empty-action-${testId}`}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
