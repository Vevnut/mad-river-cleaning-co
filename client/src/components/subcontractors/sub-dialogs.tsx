import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SUB_PAYMENT_METHODS, type Subcontractor, type SubJob } from "@shared/subcontractors";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { businessDate, formatDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field, Choice } from "@/components/billing-fields";

export function refreshSubcontractors() {
  queryClient.invalidateQueries({ queryKey: ["/api/subcontractors"] });
  queryClient.invalidateQueries({ queryKey: ["/api/subcontractor-payments"] });
}

function blankSub() {
  return { name: "", businessName: "", email: "", phone: "", services: "", payType: "per_job", defaultPay: "", w9OnFile: false, insuranceExpires: "", notes: "", active: true };
}
function fromSub(s: Subcontractor) {
  return { name: s.name, businessName: s.businessName ?? "", email: s.email ?? "", phone: s.phone ?? "", services: s.services ?? "", payType: s.payType,
    defaultPay: s.defaultPay?.toString() ?? "", w9OnFile: s.w9OnFile, insuranceExpires: s.insuranceExpires ?? "", notes: s.notes ?? "", active: s.active };
}

export function SubcontractorDialog({ open, onOpenChange, subcontractor, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; subcontractor?: Subcontractor | null; onSaved?: (s: Subcontractor) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState(blankSub);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setF(subcontractor ? fromSub(subcontractor) : blankSub()); setError(""); } }, [open, subcontractor?.id]);
  const set = (p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body = { ...f, defaultPay: f.defaultPay === "" ? null : Number(f.defaultPay) };
    try {
      const res = await apiRequest(subcontractor ? "PATCH" : "POST", subcontractor ? `/api/subcontractors/${subcontractor.id}` : "/api/subcontractors", body);
      const saved = await res.json();
      refreshSubcontractors();
      toast({ title: subcontractor ? "Subcontractor updated" : "Subcontractor added" });
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{subcontractor ? "Edit subcontractor" : "Add subcontractor"}</DialogTitle>
          <DialogDescription>Contact details, pay and paperwork for someone you hire out work to.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" data-testid="form-subcontractor">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *"><Input value={f.name} onChange={e => set({ name: e.target.value })} required maxLength={120} data-testid="input-sub-name" /></Field>
            <Field label="Business name"><Input value={f.businessName} onChange={e => set({ businessName: e.target.value })} maxLength={160} data-testid="input-sub-business" /></Field>
            <Field label="Phone"><Input type="tel" value={f.phone} onChange={e => set({ phone: e.target.value })} maxLength={40} data-testid="input-sub-phone" /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={e => set({ email: e.target.value })} maxLength={200} data-testid="input-sub-email" /></Field>
          </div>
          <Field label="What they do"><Input value={f.services} onChange={e => set({ services: e.target.value })} placeholder="e.g. Turnovers, laundry, hot tub service" maxLength={300} data-testid="input-sub-services" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Usually paid">
              <Choice label="Usually paid" value={f.payType} onChange={v => set({ payType: v })} options={[{ value: "per_job", label: "Per job" }, { value: "hourly", label: "By the hour" }]} />
            </Field>
            <Field label={f.payType === "hourly" ? "Hourly rate" : "Default pay per job"}>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={f.defaultPay} onChange={e => set({ defaultPay: e.target.value })} placeholder="0.00" data-testid="input-sub-pay" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div><Label htmlFor="sub-w9">W-9 on file</Label><p className="text-xs text-muted-foreground">Needed before you file a 1099.</p></div>
              <Switch id="sub-w9" checked={f.w9OnFile} onCheckedChange={v => set({ w9OnFile: v })} data-testid="switch-sub-w9" />
            </div>
            <Field label="Insurance expires"><Input type="date" value={f.insuranceExpires} onChange={e => set({ insuranceExpires: e.target.value })} data-testid="input-sub-insurance" /></Field>
          </div>
          <Field label="Notes"><Textarea value={f.notes} onChange={e => set({ notes: e.target.value })} rows={2} maxLength={2000} data-testid="input-sub-notes" /></Field>
          {subcontractor && (
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div><Label htmlFor="sub-active">Active</Label><p className="text-xs text-muted-foreground">Inactive subcontractors keep their history but drop out of job pickers.</p></div>
              <Switch id="sub-active" checked={f.active} onCheckedChange={v => set({ active: v })} data-testid="switch-sub-active" />
            </div>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !f.name.trim()} data-testid="button-save-sub">{busy ? "Saving…" : subcontractor ? "Save changes" : "Add subcontractor"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDialog({ open, onOpenChange, subcontractor, jobs = [], suggested }: {
  open: boolean; onOpenChange: (v: boolean) => void; subcontractor: Subcontractor; jobs?: SubJob[]; suggested?: number;
}) {
  const { toast } = useToast();
  const blank = () => ({ paidDate: businessDate(), amount: suggested && suggested > 0 ? suggested.toFixed(2) : "", method: "check", reference: "", jobId: "none", note: "" });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setF(blank()); setError(""); } }, [open]);
  const set = (p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p }));
  const jobOptions = [{ value: "none", label: "Not for one job" }, ...jobs.map(j => ({ value: String(j.jobId), label: `${formatDate(j.scheduledDate)} · ${j.propertyName ?? "Job"} · ${formatMoney(j.pay)}` }))];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await apiRequest("POST", "/api/subcontractor-payments", {
        subcontractorId: subcontractor.id, paidDate: f.paidDate, amount: Number(f.amount), method: f.method,
        reference: f.reference.trim() || null, note: f.note.trim() || null, jobId: f.jobId === "none" ? null : Number(f.jobId),
      });
      refreshSubcontractors();
      queryClient.invalidateQueries({ queryKey: ["/api/subcontractors", subcontractor.id] });
      toast({ title: `Payment to ${subcontractor.name} recorded` });
      onOpenChange(false);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Money you paid {subcontractor.name}. It counts toward their 1099 total and your expenses.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" data-testid="form-sub-payment">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date paid"><Input type="date" value={f.paidDate} onChange={e => set({ paidDate: e.target.value })} required data-testid="input-payment-date" /></Field>
            <Field label="Amount"><Input type="number" inputMode="decimal" min={0.01} step="0.01" value={f.amount} onChange={e => set({ amount: e.target.value })} required placeholder="0.00" data-testid="input-payment-amount" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Paid with"><Choice label="Paid with" value={f.method} onChange={v => set({ method: v })} options={SUB_PAYMENT_METHODS.map(m => ({ value: m.value, label: m.label }))} /></Field>
            <Field label="Check # / reference"><Input value={f.reference} onChange={e => set({ reference: e.target.value })} maxLength={120} data-testid="input-payment-reference" /></Field>
          </div>
          {jobs.length > 0 && <Field label="For job"><Choice label="For job" value={f.jobId} onChange={v => set({ jobId: v })} options={jobOptions} /></Field>}
          <Field label="Note"><Textarea value={f.note} onChange={e => set({ note: e.target.value })} rows={2} maxLength={1000} data-testid="input-payment-note" /></Field>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !(Number(f.amount) > 0)} data-testid="button-save-payment">{busy ? "Saving…" : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** All subcontractors, for pickers. */
export function useSubcontractors() {
  return useQuery<Subcontractor[]>({ queryKey: ["/api/subcontractors"] });
}
