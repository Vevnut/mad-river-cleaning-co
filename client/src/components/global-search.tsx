import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users, Home, Search } from "lucide-react";
import type { Customer, Property } from "@shared/schema";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";

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

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search customers, properties, jobs, invoices..." data-testid="input-command-search" />
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
      </CommandList>
    </CommandDialog>
  );
}
