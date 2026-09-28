import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Search, Receipt, Download } from "lucide-react";
import type { Invoice, Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { StatusBadge } from "@/components/status-badge";
import { pendingDelete } from "@/components/invoices/delete-invoice-dialog";
import { formatMoney, formatDate } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/csv-export";

const INVOICE_STATUSES = ["draft", "sent", "viewed", "paid", "partial", "overdue", "canceled"] as const;

export default function InvoicesListPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [, navigate] = useLocation();

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const customerById = (id: number) => customers.find((c) => c.id === id);

  const filtered = useMemo(() => {
    return invoices
      .filter((inv) => {
        if (statusFilter !== "all" && inv.status !== statusFilter) return false;
        if (customerFilter !== "all" && String(inv.customerId) !== customerFilter) return false;
        if (dateFrom && inv.issueDate < dateFrom) return false;
        if (dateTo && inv.issueDate > dateTo) return false;
        if (search.trim()) {
          const customer = customerById(inv.customerId);
          const haystack = `${inv.invoiceNumber} ${customer?.name ?? ""}`.toLowerCase();
          if (!haystack.includes(search.trim().toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [invoices, statusFilter, customerFilter, dateFrom, dateTo, search, customers]);

  function handleExport() {
    exportRowsToCsv(
      "invoices.csv",
      ["Invoice #", "Customer", "Issue Date", "Due Date", "Total", "Amount Paid", "Status"],
      filtered.map((inv) => [
        inv.invoiceNumber,
        customerById(inv.customerId)?.name ?? `Customer #${inv.customerId}`,
        inv.issueDate,
        inv.dueDate,
        inv.total.toFixed(2),
        inv.amountPaid.toFixed(2),
        inv.status,
      ])
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Invoices</h1>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport} disabled={filtered.length === 0} data-testid="button-export-invoices-csv">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Link href="/invoices/new">
            <Button size="sm" className="gap-1.5" data-testid="button-new-invoice">
              <Plus className="h-3.5 w-3.5" /> New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by invoice # or customer..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-invoices"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9" data-testid="select-filter-invoice-status">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {INVOICE_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[180px] h-9" data-testid="select-filter-invoice-customer">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px] h-9"
            data-testid="input-invoice-date-from"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px] h-9"
            data-testid="input-invoice-date-to"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center" data-testid="empty-invoices-list">
          <Receipt className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {invoices.length === 0 ? "No invoices yet." : "No invoices match your filters."}
          </p>
          <Link href="/invoices/new">
            <Button size="sm" variant="outline" data-testid="button-empty-new-invoice">
              Create an Invoice
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                <TableHead className="min-w-[140px]">Customer</TableHead>
                <TableHead className="hidden md:table-cell">Issue Date</TableHead>
                <TableHead className="hidden sm:table-cell">Due Date</TableHead>
                <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                <TableHead className="hidden md:table-cell text-right">Paid</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const customer = customerById(inv.customerId);
                return (
                  <ContextMenu key={inv.id}>
                    <ContextMenuTrigger asChild>
                      <TableRow data-testid={`row-invoice-${inv.id}`}>
                        <TableCell className="whitespace-nowrap">
                          <Link href={`/invoices/${inv.id}`} className="hover:underline font-medium">
                            {inv.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          <Link href={`/invoices/${inv.id}`} className="hover:underline truncate block">
                            {customer?.name ?? `Customer #${inv.customerId}`}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell tabular-nums whitespace-nowrap">{formatDate(inv.issueDate)}</TableCell>
                        <TableCell className="hidden sm:table-cell tabular-nums whitespace-nowrap">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">{formatMoney(inv.total)}</TableCell>
                        <TableCell className="hidden md:table-cell text-right tabular-nums whitespace-nowrap">{formatMoney(inv.amountPaid)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent data-testid={`contextmenu-invoice-${inv.id}`}>
                      <ContextMenuItem
                        data-testid={`contextmenuitem-open-${inv.id}`}
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        Open Invoice
                      </ContextMenuItem>
                      <ContextMenuItem
                        data-testid={`contextmenuitem-delete-${inv.id}`}
                        className="text-destructive"
                        onClick={() => { pendingDelete.id = String(inv.id); navigate(`/invoices/${inv.id}`); }}
                      >
                        Delete…
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

    </div>
  );
}
