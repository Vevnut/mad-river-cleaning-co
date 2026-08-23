import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Home, MoreHorizontal } from "lucide-react";
import type { Property, Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyFormDialog } from "@/components/properties/property-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatMoney } from "@/lib/format";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function PropertiesListPage() {
  const [search, setSearch] = useState("");
  const [freqFilter, setFreqFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);
  const { toast } = useToast();

  const { data: properties = [], isLoading } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const customerName = (id: number) => customers.find((c) => c.id === id)?.name ?? `Customer #${id}`;

  const filtered = useMemo(() => {
    let rows = properties;
    if (freqFilter !== "all") rows = rows.filter((p) => p.cleaningFrequency === freqFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          customerName(p.customerId).toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [properties, search, freqFilter, customers]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest("DELETE", `/api/properties/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: "Property deleted" });
    } catch (err) {
      toast({ title: "Couldn't delete property", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Properties</h1>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="button-new-property"
        >
          <Plus className="h-4 w-4" /> New Property
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search properties..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-properties"
          />
        </div>
        <Select value={freqFilter} onValueChange={setFreqFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Frequencies</SelectItem>
            <SelectItem value="turnover">Turnover</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Biweekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="one_time">One Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border py-16 text-center" data-testid="empty-properties">
          <Home className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No properties found</p>
            <p className="text-sm text-muted-foreground">
              {properties.length === 0 ? "Add your first property to get started." : "Try adjusting your search or filters."}
            </p>
          </div>
          {properties.length === 0 && (
            <Button size="sm" onClick={() => setFormOpen(true)} data-testid="button-empty-new-property">
              <Plus className="h-4 w-4 mr-1.5" /> New Property
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Unit Type</TableHead>
                <TableHead>Bed/Bath</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Base Price</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} data-testid={`row-property-${p.id}`}>
                  <TableCell>
                    <Link href={`/properties/${p.id}`} className="font-medium hover:underline" data-testid={`link-property-${p.id}`}>
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{customerName(p.customerId)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.city}, {p.state}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{p.unitType}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{p.bedrooms}bd / {p.bathrooms}ba</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{p.cleaningFrequency}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.basePrice)}</TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge variant="outline" className="bg-status-completed-bg text-status-completed border-transparent">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-status-canceled-bg text-status-canceled border-transparent">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`button-row-menu-${p.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          data-testid={`menuitem-edit-${p.id}`}
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`menuitem-delete-${p.id}`}
                          className="text-destructive"
                          onClick={() => setDeleteTarget(p)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PropertyFormDialog open={formOpen} onOpenChange={setFormOpen} property={editing} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete property?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.name}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
