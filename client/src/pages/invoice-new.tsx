import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, Choice, rateOptions } from "@/components/billing-fields";
import { formatMoney, businessDate } from "@/lib/format";
import { Plus, Trash2, ArrowLeft } from "lucide-react";

const initial = () => ({ customerId: 0, propertyId: null as number | null, jobId: null as number | null, invoiceNumber: "", issueDate: businessDate(), dueDate: businessDate(15), rateType: "standard", notes: "", internalNotes: "", discountAmount: 0, travelFee: 0, rushFee: 0, amountPaid: 0 });
export default function InvoiceNewPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<any>(initial), [items, setItems] = useState<any[]>([]), [services, setServices] = useState<any[]>([]);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [change, setChange] = useState<{ propertyId: number; rateType: string } | null>(null);
  const requestKey = useRef(crypto.randomUUID()), loadVersion = useRef(0);
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"] });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: jobs = [] } = useQuery<any[]>({ queryKey: ["/api/jobs"] });
  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const applyDefaults = async (propertyId: number, rateType: string, job?: any) => {
    const version = ++loadVersion.current; setBusy(true); setError("");
    try {
      const d = await (await apiRequest("GET", `/api/properties/${propertyId}/invoice-defaults?rateType=${rateType}`)).json();
      if (version !== loadVersion.current) return;
      const lines = d.items;
      if (job) {
        const base = lines.find((i: any) => ["standard_rate", "owner_rate"].includes(i.lineItemType));
        if (base) base.unitPrice = job.price;
        else if (job.price > 0) lines.unshift({ description: "Job service", quantity: 1, unitPrice: job.price, itemType: "service", lineItemType: "manual" });
      }
      setItems(lines.map((i: any) => ({ ...i, key: crypto.randomUUID() }))); setServices(d.services);
      setForm((f: any) => ({ ...f, propertyId, customerId: d.customerId, rateType, jobId: job?.id || null, notes: job?.customerNotes || d.notes }));
      setNotice("Property defaults loaded once. Edit or remove any charge below.");
    } catch (e: any) { setError(e.message); } finally { if (version === loadVersion.current) setBusy(false); }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        if (id) {
          const inv = await (await apiRequest("GET", `/api/invoices/${id}`)).json();
          const lines = await (await apiRequest("GET", `/api/invoices/${id}/items`)).json();
          if (cancelled) return;
          setForm(inv); setItems(lines.map((i: any) => ({ ...i, key: crypto.randomUUID() })));
          if (inv.propertyId) {
            const d = await (await apiRequest("GET", `/api/properties/${inv.propertyId}/invoice-defaults?rateType=${inv.rateType}`)).json();
            if (!cancelled) setServices(d.services);
          }
        } else {
          const settings = await (await apiRequest("GET", "/api/settings")).json();
          if (!cancelled) setForm((f: any) => ({ ...f, dueDate: businessDate(settings.defaultPaymentTermsDays ?? 15) }));
          const params = new URLSearchParams(window.location.hash.split("?")[1] || window.location.search);
          // Wouter's hash navigator moves query strings before '#'. Consume them
          // once so returning to New Invoice does not reuse an old property/job.
          if (window.location.search) {
            const clean = new URL(window.location.href); clean.search = "";
            window.history.replaceState(window.history.state, "", clean);
          }
          if (params.get("jobId")) {
            const job = await (await apiRequest("GET", `/api/jobs/${params.get("jobId")}`)).json();
            if (!cancelled) await applyDefaults(job.propertyId, job.rateType || "custom", job);
          } else if (params.get("propertyId")) await applyDefaults(Number(params.get("propertyId")), "standard");
        }
      } catch (e: any) { if (!cancelled) setError(e.message); } finally { if (!cancelled) setBusy(false); }
    })(); return () => { cancelled = true; };
  }, [id]);
  const switchDefaults = (propertyId: number, rateType: string) => {
    if (items.length) setChange({ propertyId, rateType }); else applyDefaults(propertyId, rateType);
  };
  const addService = (s: any) => {
    if (items.some(i => i.sourcePropertyServiceId === s.id)) return;
    const replacing = items.filter(i => (s.excludesPropertyServiceId != null && i.sourcePropertyServiceId === s.excludesPropertyServiceId) ||
      (i.sourcePropertyServiceId != null && services.find(x => x.id === i.sourcePropertyServiceId)?.excludesPropertyServiceId === s.id));
    setItems([...items.filter(i => !replacing.includes(i)), { ...s.item, isAutoAdded: false, key: crypto.randomUUID() }]);
    setNotice(replacing.length ? `${s.customName} added; replaced ${replacing.map(i => i.description).join(", ")} to avoid double charging.` : `${s.customName} added.`);
  };
  const subtotal = items.reduce((sum, i) => sum + Math.round((Number(i.quantity) * Number(i.unitPrice) + Number.EPSILON) * 100), 0) / 100;
  const total = Math.round((subtotal - Number(form.discountAmount) + Number(form.travelFee) + Number(form.rushFee)) * 100) / 100;
  const property = properties.find(p => p.id === form.propertyId);
  return <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
    <div className="flex items-center gap-3"><Link href={id ? `/invoices/${id}` : "/invoices"}><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Button></Link><div><h1 className="text-xl font-semibold">{id ? "Edit invoice" : "New invoice"}</h1><p className="text-sm text-muted-foreground">Property defaults first. Your adjustments stay on this invoice.</p></div></div>
    <form className="space-y-5" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        const payload = { customerId: form.customerId, propertyId: form.propertyId, jobId: form.jobId, invoiceNumber: form.invoiceNumber || undefined, issueDate: form.issueDate, dueDate: form.dueDate, rateType: form.rateType, notes: form.notes, internalNotes: form.internalNotes, discountAmount: Number(form.discountAmount), travelFee: Number(form.travelFee), rushFee: Number(form.rushFee), items: items.map(({ key, id, invoiceId, amount, ...i }) => i), requestKey: requestKey.current };
        const inv = await (await apiRequest(id ? "PATCH" : "POST", `/api/invoices${id ? `/${id}` : ""}`, payload)).json();
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }); queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }); navigate(`/invoices/${inv.id}`);
      } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }}>
      <Card><CardHeader><CardTitle className="text-base">Property & owner</CardTitle></CardHeader><CardContent className="space-y-4">
        {!id && <Field label="Completed job (optional)"><Choice label="Completed job" value={String(form.jobId || "none")} options={[{ value: "none", label: "Invoice without a job" }, ...jobs.filter(j => j.status === "completed").map(j => ({ value: String(j.id), label: `Job #${j.id} · ${properties.find(p => p.id === j.propertyId)?.name || j.propertyId} · ${j.scheduledDate}` }))]} onChange={v => { if (v === "none") set("jobId", null); else { const j = jobs.find(j => String(j.id) === v); applyDefaults(j.propertyId, j.rateType || "custom", j); } }} /></Field>}
        <div className="grid sm:grid-cols-2 gap-4"><Field label="Property"><Choice label="Property" value={String(form.propertyId || "none")} options={[{ value: "none", label: "No property / manual invoice" }, ...properties.map(p => ({ value: String(p.id), label: p.name }))]} onChange={v => {
          if (v === "none") { set("propertyId", null); set("jobId", null); set("rateType", "custom"); setServices([]); setItems(items.map(i => ({ ...i, sourcePropertyServiceId: null, isAutoAdded: false, lineItemType: "manual" }))); }
          else switchDefaults(Number(v), form.rateType);
        }} /></Field>
          <Field label="Customer / owner"><Choice label="Customer / owner" value={String(form.customerId || "none")} options={[{ value: "none", label: "Select customer" }, ...customers.filter(c => !property || c.id === property.customerId).map(c => ({ value: String(c.id), label: c.name }))]} onChange={v => set("customerId", Number(v))} /></Field></div>
        {property && <><p className="text-sm text-muted-foreground">{property.addressLine1} {property.addressLine2} · {property.city}, {property.state} {property.zip}</p>
          <Field label="Default rate"><Choice label="Default rate" value={form.rateType} options={rateOptions} onChange={v => switchDefaults(property.id, v)} /></Field></>}
        <div className="grid sm:grid-cols-3 gap-4"><Field label="Invoice number"><Input aria-label="Invoice number" placeholder="Assigned when saved" value={form.invoiceNumber} onChange={e => set("invoiceNumber", e.target.value)} /></Field><Field label="Issue date"><Input aria-label="Issue date" type="date" required value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></Field><Field label="Due date"><Input aria-label="Due date" type="date" required min={form.issueDate} value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></Field></div>
      </CardContent></Card>
      <Card><CardHeader className="flex-row items-center justify-between gap-3"><CardTitle className="text-base">Charges</CardTitle><Button type="button" variant="outline" onClick={() => setItems([...items, { key: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, itemType: "service", lineItemType: "manual", isAutoAdded: false }])}><Plus className="w-4 h-4 mr-2" />Manual item</Button></CardHeader>
        <CardContent className="space-y-4">
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          {!items.length && <p className="text-sm text-muted-foreground">Choose a property with a default rate or add a manual item. Blank property rates are not charged.</p>}
          {items.map((item, index) => <div key={item.key} className="rounded-md border p-3 space-y-3">
            <div className="flex gap-2 items-start"><div className="flex-1 min-w-0"><Input aria-label={`Description ${index + 1}`} placeholder="Service description" required value={item.description} onChange={e => setItems(items.map((i, n) => n === index ? { ...i, description: e.target.value } : i))} />
              {item.isAutoAdded ? <Badge variant="secondary" className="mt-2">From property defaults</Badge> : item.sourcePropertyServiceId ? <Badge variant="outline" className="mt-2">Property add-on</Badge> : null}
              {item.descriptionSnapshot && <p className="text-xs text-muted-foreground mt-2">{item.descriptionSnapshot}</p>}</div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.description || "item"}`} onClick={() => setItems(items.filter((_, n) => n !== index))}><Trash2 className="w-4 h-4" /></Button></div>
            <div className="grid grid-cols-3 gap-3"><Field label="Quantity"><Input aria-label={`Quantity ${index + 1}`} type="number" required min=".01" step=".01" value={item.quantity} onChange={e => setItems(items.map((i, n) => n === index ? { ...i, quantity: e.target.valueAsNumber } : i))} /></Field>
              <Field label="Unit price ($)"><Input aria-label={`Unit price ${index + 1}`} type="number" required min="0" step=".01" value={item.unitPrice} onChange={e => setItems(items.map((i, n) => n === index ? { ...i, unitPrice: e.target.valueAsNumber } : i))} /></Field>
              <div className="text-right self-end py-2 text-sm font-medium tabular-nums">{formatMoney(item.quantity * item.unitPrice)}</div></div>
          </div>)}
        </CardContent></Card>
      {!!services.length && <Card><CardHeader><CardTitle className="text-base">Property add-ons</CardTitle><p className="text-sm text-muted-foreground">Tap to add. Replacement services remove their conflicting charge.</p></CardHeader><CardContent className="grid sm:grid-cols-2 gap-3">
        {services.map(s => { const added = items.some(i => i.sourcePropertyServiceId === s.id); return <div key={s.id} className="flex justify-between items-start gap-3 border rounded-md p-3"><div className="min-w-0"><p className="text-sm font-medium">{s.customName}</p><p className="text-xs text-muted-foreground mt-1">{formatMoney(s.customPrice)} × {s.defaultQuantity} · {s.invoiceBehavior.replace("_", " ")}</p>{s.internalNotes && <p className="text-xs text-muted-foreground mt-1">Internal: {s.internalNotes}</p>}{s.excludesPropertyServiceId && <p className="text-xs text-primary mt-1">Replaces {services.find(x => x.id === s.excludesPropertyServiceId)?.customName}</p>}</div><Button type="button" size="sm" variant="outline" disabled={added} onClick={() => addService(s)}>{added ? "Added" : "Add"}</Button></div>; })}
      </CardContent></Card>}
      <Card><CardContent className="pt-6 space-y-4"><div className="grid sm:grid-cols-3 gap-4">{[["discountAmount", "Discount ($)"], ["travelFee", "Travel fee ($)"], ["rushFee", "Rush fee ($)"]].map(([k, label]) => <Field key={k} label={label}><Input aria-label={label} type="number" min="0" step=".01" required value={form[k]} onChange={e => set(k, e.target.valueAsNumber)} /></Field>)}</div>
        <Field label="Message / notes to client"><Textarea aria-label="Message to client" value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></Field>
        <Field label="Internal notes (not shown to client)"><Textarea aria-label="Internal invoice notes" value={form.internalNotes || ""} onChange={e => set("internalNotes", e.target.value)} /></Field>
        <div className="border-t pt-4 space-y-2 text-sm max-w-sm ml-auto"><div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div><div className="flex justify-between text-muted-foreground"><span>Tax</span><span>Not enabled</span></div><div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(total)}</span></div><div className="flex justify-between"><span>Payments received</span><span>{formatMoney(form.amountPaid || 0)}</span></div><div className="flex justify-between font-semibold text-lg"><span>Balance due</span><span>{formatMoney(total - (form.amountPaid || 0))}</span></div></div>
      </CardContent></Card>
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={busy || !items.length || !form.customerId}>{busy ? "Working…" : id ? "Save changes" : "Save draft & review"}</Button></div>
    </form>
    <Dialog open={!!change} onOpenChange={v => !v && setChange(null)}><DialogContent><DialogHeader><DialogTitle>Replace charges with property defaults?</DialogTitle><DialogDescription>Changing the property or rate replaces current line items and client notes. Saved property defaults are not changed.</DialogDescription></DialogHeader><div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setChange(null)}>Keep current items</Button><Button onClick={() => { if (change) applyDefaults(change.propertyId, change.rateType); setChange(null); }}>Load selected defaults</Button></div></DialogContent></Dialog>
  </div>;
}
