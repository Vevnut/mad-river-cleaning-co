import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Choice, rateOptions } from "@/components/billing-fields";
import { businessDate, formatMoney } from "@/lib/format";

const blank = () => ({
  customerId: null as number | null, propertyId: null as number | null, rateType: "custom",
  prospectName: "", prospectCompany: "", prospectEmail: "", prospectPhone: "",
  prospectAddressLine1: "", prospectAddressLine2: "", prospectCity: "", prospectState: "", prospectZip: "",
  issueDate: businessDate(), validUntil: businessDate(30), notes: "", internalNotes: "", discountAmount: 0, travelFee: 0, rushFee: 0,
});
const manualLine = (over: any = {}) => ({ key: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, itemType: "service", lineItemType: "manual", isAutoAdded: false, ...over });
const asManual = (i: any) => ({ ...i, sourcePropertyServiceId: null, isAutoAdded: false, lineItemType: "manual" });

export default function QuoteNewPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<any>(blank), [items, setItems] = useState<any[]>([]), [addOns, setAddOns] = useState<any[]>([]);
  const [isNew, setIsNew] = useState(false), [wasSent, setWasSent] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const requestKey = useRef(crypto.randomUUID()), loadVersion = useRef(0);
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"] });
  const { data: services = [] } = useQuery<any[]>({ queryKey: ["/api/services"] });
  const priceList = services.filter(s => s.active);
  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const setItem = (index: number, change: any) => setItems(list => list.map((i, n) => n === index ? { ...i, ...change } : i));

  const loadDefaults = async (propertyId: number, rateType: string) => {
    const version = ++loadVersion.current; setBusy(true); setError("");
    try {
      const d = await (await apiRequest("GET", `/api/properties/${propertyId}/invoice-defaults?rateType=${rateType}`)).json();
      if (version !== loadVersion.current) return;
      setAddOns(d.services);
      setItems(d.items.map((i: any) => ({ ...i, key: crypto.randomUUID() })));
      setForm((f: any) => ({ ...f, propertyId, rateType, notes: f.notes || d.notes }));
      setNotice(d.items.length ? "Property prices loaded. Edit or remove any line below." : "This property has no default rate. Add lines below.");
    } catch (e: any) { setError(e.message); } finally { if (version === loadVersion.current) setBusy(false); }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const q = await (await apiRequest("GET", `/api/quotes/${id}`)).json();
        if (cancelled) return;
        setForm(q); setIsNew(!q.customerId); setWasSent(q.status !== "draft");
        setItems(q.items.map((i: any) => ({ ...i, isAutoAdded: !!i.isAutoAdded, key: crypto.randomUUID() })));
        if (q.propertyId) {
          const d = await (await apiRequest("GET", `/api/properties/${q.propertyId}/invoice-defaults?rateType=${q.rateType}`)).json();
          if (!cancelled) setAddOns(d.services);
        }
      } catch (e: any) { if (!cancelled) setError(e.message); } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const chooseProperty = (v: string) => {
    if (v === "none") { setForm((f: any) => ({ ...f, propertyId: null, rateType: "custom" })); setAddOns([]); setItems(items.map(asManual)); return; }
    if (items.length) {
      // Keep the lines already priced, but they no longer belong to any property's add-ons.
      setForm((f: any) => ({ ...f, propertyId: Number(v), rateType: "custom" })); setItems(items.map(asManual));
      setNotice("Your lines were kept. Use the rate below to load this property's prices instead.");
      apiRequest("GET", `/api/properties/${v}/invoice-defaults?rateType=custom`).then(r => r.json()).then(d => setAddOns(d.services)).catch(() => setAddOns([]));
    } else loadDefaults(Number(v), "standard");
  };
  const addAddOn = (s: any) => {
    const replacing = items.filter(i => (s.excludesPropertyServiceId != null && i.sourcePropertyServiceId === s.excludesPropertyServiceId) ||
      (i.sourcePropertyServiceId != null && addOns.find(x => x.id === i.sourcePropertyServiceId)?.excludesPropertyServiceId === s.id));
    setItems([...items.filter(i => !replacing.includes(i)), { ...s.item, isAutoAdded: false, key: crypto.randomUUID() }]);
    setNotice(replacing.length ? `${s.customName} added; replaced ${replacing.map(i => i.description).join(", ")} to avoid double charging.` : `${s.customName} added.`);
  };

  const ownProperties = properties.filter(p => p.customerId === form.customerId);
  const subtotal = items.reduce((sum, i) => sum + Math.round((Number(i.quantity) * Number(i.unitPrice) + Number.EPSILON) * 100), 0) / 100;
  const total = Math.round((subtotal - Number(form.discountAmount) + Number(form.travelFee) + Number(form.rushFee)) * 100) / 100;
  const ready = items.length > 0 && (isNew ? !!form.prospectName?.trim() : !!form.customerId);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const { customerId, propertyId, rateType, prospectName, prospectCompany, prospectEmail, prospectPhone, prospectAddressLine1, prospectAddressLine2, prospectCity, prospectState, prospectZip, issueDate, validUntil, notes, internalNotes } = form;
      const payload = {
        customerId: isNew ? null : customerId, propertyId: isNew ? null : propertyId, rateType: isNew ? "custom" : rateType,
        prospectName: prospectName ?? "", prospectCompany: prospectCompany ?? "", prospectEmail: prospectEmail ?? "", prospectPhone: prospectPhone ?? "",
        prospectAddressLine1: prospectAddressLine1 ?? "", prospectAddressLine2: prospectAddressLine2 ?? "", prospectCity: prospectCity ?? "", prospectState: prospectState ?? "", prospectZip: prospectZip ?? "",
        issueDate, validUntil, notes, internalNotes, discountAmount: Number(form.discountAmount), travelFee: Number(form.travelFee), rushFee: Number(form.rushFee),
        items: items.map(({ key, id, quoteId, amount, sortOrder, ...i }) => isNew ? asManual(i) : i), requestKey: id ? undefined : requestKey.current,
      };
      const saved = await (await apiRequest(id ? "PATCH" : "POST", `/api/quotes${id ? `/${id}` : ""}`, payload)).json();
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      navigate(`/quotes/${saved.id}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const prospectField = (key: string, label: string, type = "text") => <Field label={label}><Input aria-label={label} type={type} value={form[key] ?? ""} onChange={e => set(key, e.target.value)} /></Field>;
  return <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
    <div className="flex items-center gap-3"><Link href={id ? `/quotes/${id}` : "/quotes"}><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Button></Link><div><h1 className="text-xl font-semibold">{id ? "Edit quote" : "New quote"}</h1><p className="text-sm text-muted-foreground">Nothing goes to the customer until you send it.</p></div></div>
    {wasSent && <p role="status" className="text-sm rounded-md border p-3">This quote was already sent. Saving changes turns its link off until you send it again, so the customer can't accept an old price.</p>}
    <form className="space-y-5" onSubmit={save}>
      <Card><CardHeader><CardTitle className="text-base">Who is this for?</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex gap-2"><Button type="button" size="sm" variant={isNew ? "outline" : "default"} onClick={() => setIsNew(false)} data-testid="button-quote-existing">Existing customer</Button><Button type="button" size="sm" variant={isNew ? "default" : "outline"} onClick={() => { setIsNew(true); setAddOns([]); }} data-testid="button-quote-new-customer">New customer</Button></div>
        {isNew ? <>
          <div className="grid sm:grid-cols-2 gap-4">{prospectField("prospectName", "Name")}{prospectField("prospectCompany", "Company (optional)")}{prospectField("prospectEmail", "Email", "email")}{prospectField("prospectPhone", "Phone", "tel")}</div>
          <div className="grid sm:grid-cols-2 gap-4">{prospectField("prospectAddressLine1", "Service address")}{prospectField("prospectAddressLine2", "Address line 2")}</div>
          <div className="grid sm:grid-cols-3 gap-4">{prospectField("prospectCity", "City")}{prospectField("prospectState", "State")}{prospectField("prospectZip", "ZIP")}</div>
          <p className="text-xs text-muted-foreground">They're added to Customers once an accepted quote becomes an invoice or job.</p>
        </> : <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Customer"><Choice label="Customer" value={String(form.customerId || "none")} options={[{ value: "none", label: "Select customer" }, ...customers.map(c => ({ value: String(c.id), label: c.companyName || c.name }))]} onChange={v => { setForm((f: any) => ({ ...f, customerId: v === "none" ? null : Number(v), propertyId: null, rateType: "custom" })); setAddOns([]); setItems(items.map(asManual)); }} /></Field>
            <Field label="Property (optional)"><Choice label="Property" value={String(form.propertyId || "none")} options={[{ value: "none", label: "No property" }, ...ownProperties.map(p => ({ value: String(p.id), label: p.name }))]} onChange={chooseProperty} /></Field>
          </div>
          {form.propertyId && <Field label="Rate"><Choice label="Rate" value={form.rateType} options={rateOptions} onChange={v => loadDefaults(form.propertyId, v)} /></Field>}
        </>}
        <div className="grid sm:grid-cols-2 gap-4"><Field label="Quote date"><Input aria-label="Quote date" type="date" required value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></Field><Field label="Valid until"><Input aria-label="Valid until" type="date" required min={form.issueDate} value={form.validUntil} onChange={e => set("validUntil", e.target.value)} /></Field></div>
      </CardContent></Card>

      <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Charges</CardTitle><div className="flex flex-wrap gap-2">
        {!!priceList.length && <div className="w-52"><Choice label="Add from price list" value="" options={priceList.map(s => ({ value: String(s.id), label: `${s.name} · ${formatMoney(s.defaultPrice)}` }))} onChange={v => { const s = priceList.find(x => String(x.id) === v); if (s) setItems([...items, manualLine({ description: s.name, descriptionSnapshot: s.description || null, quantity: s.defaultQuantity, unitPrice: s.defaultPrice })]); }} /></div>}
        <Button type="button" variant="outline" onClick={() => setItems([...items, manualLine()])} data-testid="button-add-quote-line"><Plus className="w-4 h-4 mr-2" />Add line</Button>
      </div></CardHeader>
        <CardContent className="space-y-4">
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          {!items.length && <p className="text-sm text-muted-foreground">Pick from your price list or add a line.</p>}
          {items.map((item, index) => <div key={item.key} className="rounded-md border p-3 space-y-3">
            <div className="flex gap-2 items-start"><div className="flex-1 min-w-0"><Input aria-label={`Description ${index + 1}`} placeholder="Service description" required value={item.description} onChange={e => setItem(index, { description: e.target.value })} />
              {item.isAutoAdded ? <Badge variant="secondary" className="mt-2">From property defaults</Badge> : item.sourcePropertyServiceId ? <Badge variant="outline" className="mt-2">Property add-on</Badge> : null}
              {item.descriptionSnapshot && <p className="text-xs text-muted-foreground mt-2">{item.descriptionSnapshot}</p>}</div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.description || "line"}`} onClick={() => setItems(items.filter((_, n) => n !== index))}><Trash2 className="w-4 h-4" /></Button></div>
            <div className="grid grid-cols-3 gap-3"><Field label="Quantity"><Input aria-label={`Quantity ${index + 1}`} type="number" required min=".01" step=".01" value={item.quantity} onChange={e => setItem(index, { quantity: e.target.valueAsNumber })} /></Field>
              <Field label="Unit price ($)"><Input aria-label={`Unit price ${index + 1}`} type="number" required min="0" step=".01" value={item.unitPrice} onChange={e => setItem(index, { unitPrice: e.target.valueAsNumber })} /></Field>
              <div className="text-right self-end py-2 text-sm font-medium tabular-nums">{formatMoney(item.quantity * item.unitPrice)}</div></div>
          </div>)}
        </CardContent></Card>

      {!isNew && !!addOns.length && <Card><CardHeader><CardTitle className="text-base">Property add-ons</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 gap-3">
        {addOns.map(s => { const added = items.some(i => i.sourcePropertyServiceId === s.id); return <div key={s.id} className="flex justify-between items-start gap-3 border rounded-md p-3"><div className="min-w-0"><p className="text-sm font-medium">{s.customName}</p><p className="text-xs text-muted-foreground mt-1">{formatMoney(s.customPrice)} × {s.defaultQuantity}</p></div><Button type="button" size="sm" variant="outline" disabled={added} onClick={() => addAddOn(s)}>{added ? "Added" : "Add"}</Button></div>; })}
      </CardContent></Card>}

      <Card><CardContent className="pt-6 space-y-4"><div className="grid sm:grid-cols-3 gap-4">{[["discountAmount", "Discount ($)"], ["travelFee", "Travel fee ($)"], ["rushFee", "Rush fee ($)"]].map(([k, label]) => <Field key={k} label={label}><Input aria-label={label} type="number" min="0" step=".01" required value={form[k]} onChange={e => set(k, e.target.valueAsNumber)} /></Field>)}</div>
        <Field label="Message to customer"><Textarea aria-label="Message to customer" value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></Field>
        <Field label="Internal notes (not shown to customer)"><Textarea aria-label="Internal quote notes" value={form.internalNotes || ""} onChange={e => set("internalNotes", e.target.value)} /></Field>
        <div className="border-t pt-4 space-y-2 text-sm max-w-sm ml-auto"><div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div><div className="flex justify-between font-semibold text-lg"><span>Quote total</span><span data-testid="text-quote-total">{formatMoney(total)}</span></div></div>
      </CardContent></Card>
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={busy || !ready} data-testid="button-save-quote">{busy ? "Working…" : id ? "Save changes" : "Save & review"}</Button></div>
    </form>
  </div>;
}
