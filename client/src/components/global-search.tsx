import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users, Home, Search, ClipboardList, Receipt } from "lucide-react";
import type { Customer, Property, Job, Invoice } from "@shared/schema";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";

/**
 * Command-palette style global search (Cmd/Ctrl+K), searching customers and
 * properties. No localStorage-based "recents" — sandboxed iframes block it,
 * so state is transient per the webapp GUIDE.md rule (React state only).
 */
export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: invoices = [] } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const propertyById = (id: number) => properties.find((p) => p.id === id);
  const customerById = (id: number) => customers.find((c) => c.id === id);

  const filteredInvoices = useMemo(
    () => (paymentStatusFilter === "all" ? invoices : invoices.filter((i) => i.status === paymentStatusFilter)),
    [invoices, paymentStatusFilter]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search customers, properties, jobs, invoices..." data-testid="input-command-search" />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs text-muted-foreground shrink-0">Payment status</span>
        <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
          <SelectTrigger className="h-7 w-[140px] text-xs" data-testid="select-command-payment-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All invoices</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1 py-2 text-muted-foreground">
            <Search className="h-4 w-4 opacity-50" />
            <span className="text-xs">No results found.</span>
          </div>
        </CommandEmpty>

        {customers.length > 0 && (
          <CommandGroup heading="Customers">
            {customers.map((c) => (
              <CommandItem
                key={`customer-${c.id}`}
                value={`customer-${c.id}-${c.name}`}
                onSelect={() => go(`/customers/${c.id}`)}
                data-testid={`command-customer-${c.id}`}
              >
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {c.billingCity}, {c.billingState}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {properties.length > 0 && (
          <CommandGroup heading="Properties">
            {properties.map((p) => (
              <CommandItem
                key={`property-${p.id}`}
                value={`property-${p.id}-${p.name}`}
                onSelect={() => go(`/properties/${p.id}`)}
                data-testid={`command-property-${p.id}`}
              >
                <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0 capitalize">
                  {p.cleaningFrequency}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {jobs.length > 0 && (
          <CommandGroup heading="Jobs">
            {jobs.map((j) => {
              const property = propertyById(j.propertyId);
              return (
                <CommandItem
                  key={`job-${j.id}`}
                  value={`job-${j.id}-${property?.name ?? ""}-${j.jobType}`}
                  onSelect={() => go(`/jobs/${j.id}`)}
                  data-testid={`command-job-${j.id}`}
                >
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{property?.name ?? `Property #${j.propertyId}`}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{j.scheduledDate}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {filteredInvoices.length > 0 && (
          <CommandGroup heading="Invoices">
            {filteredInvoices.map((inv) => {
              const customer = customerById(inv.customerId);
              return (
                <CommandItem
                  key={`invoice-${inv.id}`}
                  value={`invoice-${inv.id}-${inv.invoiceNumber}-${customer?.name ?? ""}`}
                  onSelect={() => go(`/invoices/${inv.id}`)}
                  data-testid={`command-invoice-${inv.id}`}
                >
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{inv.invoiceNumber} &middot; {customer?.name ?? ""}</span>
                  <StatusBadge status={inv.status} className="ml-auto shrink-0" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
