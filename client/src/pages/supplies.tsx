import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Package, Pencil, Plus, Trash2 } from "lucide-react";
import type { Property } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Supply = { id: number; name: string; propertyId: number | null; propertyName: string | null; quantity: number; unit: string; reorderAt: number | null; notes: string; low: boolean; flaggedAt: string | null; flaggedBy: string | null };
const OURS = "ours";
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });

export default function SuppliesPage() {
  const { toast } = useToast();
  const { data: items = [], isLoading } = useQuery<Supply[]>({ queryKey: ["/api/supplies"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const [where, setWhere] = useState("all"), [lowOnly, setLowOnly] = useState(false), [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supply | "new" | null>(null);
  const shown = useMemo(() => items.filter(s =>
    (where === "all" || (where === OURS ? s.propertyId == null : String(s.propertyId) === where)) && (!lowOnly || s.low)
    && (!search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase()))), [items, where, lowOnly, search]);
  const lowCount = items.filter(s => s.low).length;

  const adjust = useMutation({
    mutationFn: async ({ id, delta }: { id: number; delta: number }) => (await apiRequest("POST", `/api/supplies/${id}/adjust`, { delta })).json(),
    onSuccess: (s: Supply) => queryClient.setQueryData<Supply[]>(["/api/supplies"], list => list?.map(x => (x.id === s.id ? s : x))),
    onError: (e: Error) => toast({ title: "Couldn't change the count", description: e.message, variant: "destructive" }),
  });

  return <div className="p-4 md:p-6 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Supplies</h1>
        <p className="text-sm text-muted-foreground">What's on hand in your own stock and at each property. Set a reorder level to flag items running low. Cleaners can update counts and flag items at the houses they clean.</p>
      </div>
      <Button onClick={() => setEditing("new")} className="gap-1.5" data-testid="button-add-supply"><Plus className="h-4 w-4" />Add item</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Input className="max-w-xs" placeholder="Search items" aria-label="Search supplies" value={search} onChange={e => setSearch(e.target.value)} />
      <Select value={where} onValueChange={setWhere}><SelectTrigger className="w-52" aria-label="Filter by location"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">All locations</SelectItem><SelectItem value={OURS}>Our stock</SelectItem>
        {properties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
      </SelectContent></Select>
      <label className="flex items-center gap-2 text-sm"><Switch checked={lowOnly} onCheckedChange={setLowOnly} aria-label="Show only low items" />Low only{lowCount ? ` (${lowCount})` : ""}</label>
    </div>

    {isLoading ? <Skeleton className="h-40 w-full" /> : !shown.length ? <div className="rounded-md border border-dashed p-10 text-center space-y-2">
      <Package className="h-6 w-6 mx-auto text-muted-foreground" />
      <p className="text-sm font-medium">{items.length ? "No items match." : "No supplies yet."}</p>
      {!items.length && <p className="text-sm text-muted-foreground">Add what you keep on hand, like paper towels, trash bags or hot tub chemicals.</p>}
    </div> : <div className="rounded-md border overflow-x-auto"><Table className="min-w-[620px]">
      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Location</TableHead><TableHead className="text-center">On hand</TableHead><TableHead>Reorder at</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
      <TableBody>{shown.map(s => <TableRow key={s.id} data-testid={`row-supply-${s.id}`}>
        <TableCell><span className="font-medium">{s.name}</span>{s.low && <Badge variant="outline" className="ml-2 bg-status-overdue-bg text-status-overdue border-transparent">Low</Badge>}{s.flaggedAt && <span className="block text-xs text-status-overdue">Flagged running low by {s.flaggedBy} · add stock or edit to clear</span>}{s.notes && <span className="block text-xs text-muted-foreground max-w-[260px] truncate">{s.notes}</span>}</TableCell>
        <TableCell className="whitespace-nowrap">{s.propertyName ?? "Our stock"}</TableCell>
        <TableCell><div className="flex items-center justify-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`One less ${s.name}`} disabled={adjust.isPending || s.quantity <= 0} onClick={() => adjust.mutate({ id: s.id, delta: -1 })}><Minus className="h-3.5 w-3.5" /></Button>
          <span className="min-w-[4.5rem] text-center tabular-nums" data-testid={`text-supply-qty-${s.id}`}>{fmt(s.quantity)}{s.unit ? ` ${s.unit}` : ""}</span>
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`One more ${s.name}`} disabled={adjust.isPending} onClick={() => adjust.mutate({ id: s.id, delta: 1 })}><Plus className="h-3.5 w-3.5" /></Button>
        </div></TableCell>
        <TableCell className="tabular-nums text-muted-foreground">{s.reorderAt == null ? "—" : fmt(s.reorderAt)}</TableCell>
        <TableCell><Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button></TableCell>
      </TableRow>)}</TableBody>
    </Table></div>}
    {editing && <SupplyDialog item={editing === "new" ? null : editing} properties={properties} defaultWhere={where === "all" ? OURS : where} onClose={() => setEditing(null)} />}
  </div>;
}

function SupplyDialog({ item, properties, defaultWhere, onClose }: { item: Supply | null; properties: Property[]; defaultWhere: string; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(item?.name ?? ""), [where, setWhere] = useState(item ? (item.propertyId == null ? OURS : String(item.propertyId)) : defaultWhere);
  const [quantity, setQuantity] = useState(item ? fmt(item.quantity) : "0"), [unit, setUnit] = useState(item?.unit ?? "");
  const [reorderAt, setReorderAt] = useState(item?.reorderAt == null ? "" : fmt(item.reorderAt)), [notes, setNotes] = useState(item?.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const body = { name, propertyId: where === OURS ? null : Number(where), quantity: Number(quantity || 0), unit, reorderAt: reorderAt.trim() === "" ? null : Number(reorderAt), notes };
      if ([body.quantity, body.reorderAt ?? 0].some(n => !Number.isFinite(n) || n < 0)) throw new Error("Counts must be zero or more.");
      return apiRequest(item ? "PATCH" : "POST", item ? `/api/supplies/${item.id}` : "/api/supplies", body);
    },
    onSuccess: () => { refresh(); onClose(); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/supplies/${item!.id}`),
    onSuccess: () => { refresh(); onClose(); toast({ title: `${item!.name} removed` }); },
    onError: (e: Error) => toast({ title: "Couldn't remove", description: e.message, variant: "destructive" }),
  });
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="max-w-md">
    <DialogHeader><DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <div className="space-y-1"><Label htmlFor="supply-name">Item</Label><Input id="supply-name" value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="Paper towels" autoFocus required /></div>
      <div className="space-y-1"><Label>Location</Label><Select value={where} onValueChange={setWhere}><SelectTrigger aria-label="Location"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value={OURS}>Our stock</SelectItem>{properties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
      </SelectContent></Select></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1"><Label htmlFor="supply-qty">On hand</Label><Input id="supply-qty" type="number" inputMode="decimal" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="supply-unit">Unit</Label><Input id="supply-unit" value={unit} maxLength={30} onChange={e => setUnit(e.target.value)} placeholder="rolls" /></div>
        <div className="space-y-1"><Label htmlFor="supply-reorder">Reorder at</Label><Input id="supply-reorder" type="number" inputMode="decimal" min="0" step="any" value={reorderAt} onChange={e => setReorderAt(e.target.value)} placeholder="Optional" /></div>
      </div>
      <div className="space-y-1"><Label htmlFor="supply-notes">Notes</Label><Textarea id="supply-notes" rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brand, where to buy, reimbursed by owner…" /></div>
      <DialogFooter className="gap-2 sm:justify-between">
        {item ? (confirmDelete
          ? <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>Yes, remove it</Button>
          : <Button type="button" variant="ghost" className="gap-1.5 text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" />Remove</Button>) : <span />}
        <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={save.isPending || !name.trim()}>Save</Button></div>
      </DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
