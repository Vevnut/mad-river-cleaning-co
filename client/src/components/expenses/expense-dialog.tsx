import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fuel, ImagePlus, Loader2, ShoppingBag, Trash2, X } from "lucide-react";
import type { Property } from "@shared/schema";
import { SUPPLY_CATEGORIES, PAYMENT_METHODS, type Expense } from "@shared/expenses";
import { apiRequest, apiUrl, authHeaders, queryClient } from "@/lib/queryClient";
import { toJpeg } from "@/lib/image";
import { useToast } from "@/hooks/use-toast";
import { businessDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, Choice } from "@/components/billing-fields";

type Kind = "mileage" | "supply";
type Receipt = { id: number; expenseId: number; originalName: string; size: number; createdAt: string };
const MAX_RECEIPTS = 5;
// Kind "mileage" is the gas entry (kept under that name so older mileage entries still load).
function blank(kind: Kind) {
  return { kind, expenseDate: businessDate(), description: "", amount: "", category: "cleaning_supplies", vendor: "", paymentMethod: "card",
    propertyId: "none", notes: "" };
}
function fromExpense(e: Expense) {
  // Older mileage entries open as gas with the amount they were worth; saving keeps that amount.
  const oldTrip = e.kind === "mileage" && e.totalMiles != null
    ? `Logged as ${e.totalMiles} miles${e.fromLocation || e.toLocation ? ` (${[e.fromLocation, e.toLocation].filter(Boolean).join(" → ")})` : ""}.` : "";
  return { kind: e.kind, expenseDate: e.expenseDate, description: e.description === "Business trip" ? "" : e.description,
    amount: e.amount.toString(), category: e.kind === "supply" ? e.category : "cleaning_supplies",
    vendor: e.vendor ?? "", paymentMethod: e.paymentMethod ?? "card", propertyId: e.propertyId ? String(e.propertyId) : "none",
    notes: e.notes ?? oldTrip };
}

function ReceiptThumb({ id, name, onDelete }: { id: number; name: string; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true, url = "";
    fetch(apiUrl(`/api/expense-receipts/${id}/file`), { headers: authHeaders() as HeadersInit })
      .then(r => (r.ok ? r.blob() : Promise.reject())).then(b => { if (alive) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-md border bg-muted">
      {src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={name} className="h-full w-full object-cover" /></a>
        : <div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
      <button type="button" onClick={onDelete} aria-label={`Remove ${name}`} className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow-sm" data-testid={`button-remove-receipt-${id}`}>
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ExpenseDialog({ open, onOpenChange, expense, defaultKind = "supply" }: {
  open: boolean; onOpenChange: (open: boolean) => void; expense?: Expense | null; defaultKind?: Kind;
}) {
  const { toast } = useToast();
  const [f, setF] = useState(() => (expense ? fromExpense(expense) : blank(defaultKind)));
  const [queued, setQueued] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const receiptsKey = ["/api/expenses", expense?.id, "receipts"];
  const { data: receipts = [] } = useQuery<Receipt[]>({
    queryKey: receiptsKey, enabled: !!expense && open,
    queryFn: async () => (await apiRequest("GET", `/api/expenses/${expense!.id}/receipts`)).json(),
  });

  useEffect(() => {
    if (!open) return;
    setF(expense ? fromExpense(expense) : blank(defaultKind));
    setQueued(q => { q.forEach(x => URL.revokeObjectURL(x.url)); return []; });
    setError("");
  }, [open, expense?.id, defaultKind]);

  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }));
  const propertyOptions = [{ value: "none", label: "No property" }, ...properties.map(p => ({ value: String(p.id), label: p.name }))];
  const receiptTotal = receipts.length + queued.length;

  const pickProperty = (v: string) => set({ propertyId: v });

  async function uploadReceipt(expenseId: number, file: File) {
    const blob = await toJpeg(file);
    const res = await fetch(apiUrl(`/api/expenses/${expenseId}/receipts?name=${encodeURIComponent(file.name)}`), {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "image/jpeg" } as HeadersInit, body: blob,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Receipt upload failed.");
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_RECEIPTS - receiptTotal;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > list.length) toast({ title: `Up to ${MAX_RECEIPTS} receipt photos per expense` });
    if (expense) {
      setBusy(true);
      for (const file of list) {
        try { await uploadReceipt(expense.id, file); }
        catch (e) { toast({ title: `Couldn't add ${file.name}`, description: (e as Error).message, variant: "destructive" }); }
      }
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: receiptsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    } else {
      setQueued(q => [...q, ...list.map(file => ({ file, url: URL.createObjectURL(file) }))]);
    }
    if (input.current) input.current.value = "";
  }

  async function removeReceipt(id: number) {
    try {
      await apiRequest("DELETE", `/api/expense-receipts/${id}`);
      queryClient.invalidateQueries({ queryKey: receiptsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    } catch (e) { toast({ title: "Couldn't remove receipt", description: (e as Error).message, variant: "destructive" }); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const common = { expenseDate: f.expenseDate, description: f.description.trim(), notes: f.notes.trim() || null,
      propertyId: f.propertyId === "none" ? null : Number(f.propertyId), jobId: expense?.jobId ?? null };
    const payload = { kind: f.kind, ...common, amount: Number(f.amount), vendor: f.vendor.trim() || null, paymentMethod: f.paymentMethod,
      ...(f.kind === "supply" ? { category: f.category } : {}) };
    try {
      const res = await apiRequest(expense ? "PATCH" : "POST", expense ? `/api/expenses/${expense.id}` : "/api/expenses", payload);
      const saved: Expense = await res.json();
      let failed = 0;
      for (const q of queued) { try { await uploadReceipt(saved.id, q.file); } catch { failed++; } }
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: expense ? "Expense updated" : f.kind === "mileage" ? `Added ${formatMoney(saved.amount)} gas` : `Added ${formatMoney(saved.amount)} supply cost`,
        ...(failed ? { description: `${failed} receipt photo${failed === 1 ? "" : "s"} couldn't be added. Open the expense to try again.`, variant: "destructive" as const } : {}) });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message.replace(/^\d{3}:\s*/, ""));
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!expense) return;
    setBusy(true);
    try {
      await apiRequest("DELETE", `/api/expenses/${expense.id}`);
      setConfirmDelete(false); onOpenChange(false);
      queryClient.removeQueries({ queryKey: receiptsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"], exact: true });
      toast({ title: "Expense deleted" });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={v => !busy && onOpenChange(v)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-expense">
          <DialogHeader>
            <DialogTitle>{expense ? "Edit expense" : f.kind === "mileage" ? "Add gas" : "Add supply cost"}</DialogTitle>
            <DialogDescription>{f.kind === "mileage" ? "What you spent on gas for the business." : "Anything you bought for the business."}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={save}>
            {!expense && (
              <ToggleGroup type="single" variant="outline" value={f.kind} onValueChange={v => v && set({ kind: v as Kind })} className="justify-start" aria-label="Expense type">
                <ToggleGroupItem value="mileage" className="gap-1.5 px-3" data-testid="toggle-expense-mileage"><Fuel className="h-4 w-4" />Gas</ToggleGroupItem>
                <ToggleGroupItem value="supply" className="gap-1.5 px-3" data-testid="toggle-expense-supply"><ShoppingBag className="h-4 w-4" />Supply cost</ToggleGroupItem>
              </ToggleGroup>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input type="date" required value={f.expenseDate} onChange={e => set({ expenseDate: e.target.value })} data-testid="input-expense-date" /></Field>
              <Field label={f.kind === "mileage" ? "Spent on gas ($)" : "Amount ($)"}><Input type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" required value={f.amount} onChange={e => set({ amount: e.target.value })} data-testid="input-expense-amount" /></Field>
            </div>
            {f.kind === "mileage" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Gas station (optional)"><Input value={f.vendor} maxLength={120} placeholder="e.g. Irving, Cumberland Farms" onChange={e => set({ vendor: e.target.value })} data-testid="input-expense-vendor" /></Field>
                <Field label="Paid with"><Choice label="Paid with" value={f.paymentMethod} options={PAYMENT_METHODS as any} onChange={v => set({ paymentMethod: v })} /></Field>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category"><Choice label="Category" value={f.category} options={SUPPLY_CATEGORIES as any} onChange={v => set({ category: v })} /></Field>
                  <Field label="Store / vendor"><Input value={f.vendor} maxLength={120} placeholder="e.g. Walmart" onChange={e => set({ vendor: e.target.value })} data-testid="input-expense-vendor" /></Field>
                </div>
                <Field label="What you bought"><Input value={f.description} maxLength={300} placeholder="e.g. Bleach, paper towels, trash bags" onChange={e => set({ description: e.target.value })} data-testid="input-expense-description" /></Field>
                <Field label="Paid with"><Choice label="Paid with" value={f.paymentMethod} options={PAYMENT_METHODS as any} onChange={v => set({ paymentMethod: v })} /></Field>
              </>
            )}
            <div className="space-y-2">
              <Label>Receipt photos <span className="font-normal text-muted-foreground">(optional, up to {MAX_RECEIPTS})</span></Label>
              <div className="flex flex-wrap gap-2">
                {receipts.map(r => <ReceiptThumb key={r.id} id={r.id} name={r.originalName} onDelete={() => removeReceipt(r.id)} />)}
                {queued.map((q, i) => (
                  <div key={q.url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                    <img src={q.url} alt={q.file.name} className="h-full w-full object-cover" />
                    <button type="button" aria-label={`Remove ${q.file.name}`} className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow-sm"
                      onClick={() => setQueued(list => { URL.revokeObjectURL(list[i].url); return list.filter((_, j) => j !== i); })}><X className="h-3 w-3" /></button>
                  </div>
                ))}
                {receiptTotal < MAX_RECEIPTS && (
                  <button type="button" onClick={() => input.current?.click()} disabled={busy}
                    className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-muted/50" data-testid="button-add-receipt">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                    <span className="text-[10px]">Add receipt</span>
                  </button>
                )}
              </div>
              <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} data-testid="input-expense-receipt" />
            </div>

            <Field label="Property (optional)"><Choice label="Property" value={f.propertyId} options={propertyOptions} onChange={pickProperty} /></Field>
            <Field label="Notes (optional)"><Textarea rows={2} maxLength={2000} value={f.notes} onChange={e => set({ notes: e.target.value })} data-testid="input-expense-notes" /></Field>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:justify-between sm:gap-0">
              {expense ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)} data-testid="button-delete-expense"><Trash2 className="mr-2 h-4 w-4" />Delete</Button> : <span />}
              <Button type="submit" disabled={busy} data-testid="button-save-expense">{busy ? "Saving…" : expense ? "Save changes" : f.kind === "mileage" ? "Add gas" : "Add expense"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {expense && `${formatMoney(expense.amount)} on ${expense.expenseDate}`}{expense?.receiptCount ? ` and its ${expense.receiptCount} receipt photo${expense.receiptCount === 1 ? "" : "s"}` : ""} will be removed from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); remove(); }} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-expense">Delete expense</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
