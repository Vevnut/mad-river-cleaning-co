import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import { totalBeds } from "@shared/beds";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Choice } from "@/components/billing-fields";
import { businessDate } from "@/lib/format";
import { houseSpecs, type QuoteSection } from "@/lib/quote-services";

const blank = () => ({
  customerId: null as number | null, propertyId: null as number | null,
  prospectName: "", prospectCompany: "", prospectEmail: "", prospectPhone: "",
  prospectAddressLine1: "", prospectAddressLine2: "", prospectCity: "", prospectState: "", prospectZip: "",
  attention: "", houseSpecs: "", issueDate: businessDate(), validUntil: businessDate(30), notes: "", internalNotes: "",
});
const uid = () => crypto.randomUUID();
const newLine = () => ({ key: uid(), label: "", text: "", price: "" });
const newSection = () => ({ key: uid(), title: "", price: "", lines: [newLine()] });
const keyed = (sections: QuoteSection[]) => sections.map(s => ({ ...s, key: uid(), lines: s.lines.map(l => ({ ...l, key: uid() })) }));
type Template = { id: number; name: string; sections: QuoteSection[] };

export default function QuoteNewPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<any>(blank), [sections, setSections] = useState<QuoteSection[]>([]);
  const [isNew, setIsNew] = useState(false), [wasSent, setWasSent] = useState(false);
  const [templateName, setTemplateName] = useState("Standard");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const requestKey = useRef(crypto.randomUUID()), started = useRef(false);
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"] });
  const { data: templates, refetch: refetchTemplates } = useQuery<Template[]>({ queryKey: ["/api/quote-templates"] });
  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const setSection = (i: number, change: Partial<QuoteSection>) => setSections(list => list.map((s, n) => n === i ? { ...s, ...change } : s));
  const setLine = (i: number, l: number, change: any) => setSections(list => list.map((s, n) => n === i ? { ...s, lines: s.lines.map((x, m) => m === l ? { ...x, ...change } : x) } : s));
  const move = (i: number, by: number) => setSections(list => { const next = [...list]; const [s] = next.splice(i, 1); next.splice(i + by, 0, s); return next; });
  const useTemplate = (t: Template) => { setSections(keyed(t.sections)); setTemplateName(t.name); setNotice(`Started from ${t.name}. Edit anything for this customer.`); };

  useEffect(() => {
    if (id || !templates || started.current) return;
    started.current = true;
    const first = templates.find(t => t.name === "Standard") ?? templates[0];
    if (first) useTemplate(first); else setSections([newSection()]);
  }, [id, templates]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const q = await (await apiRequest("GET", `/api/quotes/${id}`)).json();
        if (cancelled) return;
        setForm(q); setIsNew(!q.customerId); setWasSent(q.status !== "draft"); setSections(keyed(q.sections));
      } catch (e: any) { if (!cancelled) setError(e.message); } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const ownProperties = properties.filter(p => p.customerId === form.customerId);
  const chooseProperty = (v: string) => {
    const p = properties.find(x => String(x.id) === v);
    setForm((f: any) => ({ ...f, propertyId: p?.id ?? null, houseSpecs: p ? houseSpecs(p, totalBeds(p)) : f.houseSpecs }));
  };
  const ready = sections.length > 0 && (isNew ? !!form.prospectName?.trim() : !!form.customerId);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const f = form, text = (v: any) => v ?? "";
      const payload = {
        customerId: isNew ? null : f.customerId, propertyId: isNew ? null : f.propertyId,
        prospectName: text(f.prospectName), prospectCompany: text(f.prospectCompany), prospectEmail: text(f.prospectEmail), prospectPhone: text(f.prospectPhone),
        prospectAddressLine1: text(f.prospectAddressLine1), prospectAddressLine2: text(f.prospectAddressLine2), prospectCity: text(f.prospectCity), prospectState: text(f.prospectState), prospectZip: text(f.prospectZip),
        attention: text(f.attention), houseSpecs: text(f.houseSpecs), issueDate: f.issueDate, validUntil: f.validUntil, notes: f.notes, internalNotes: f.internalNotes, sections,
        requestKey: id ? undefined : requestKey.current,
      };
      const saved = await (await apiRequest(id ? "PATCH" : "POST", `/api/quotes${id ? `/${id}` : ""}`, payload)).json();
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      navigate(`/quotes/${saved.id}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const saveTemplate = async () => {
    setError("");
    try {
      await apiRequest("PUT", "/api/quote-templates", { name: templateName, sections });
      await refetchTemplates();
      setNotice(`Saved as the ${templateName.trim()} template for future quotes.`);
    } catch (e: any) { setError(e.message); }
  };

  const prospectField = (key: string, label: string, type = "text") => <Field label={label}><Input aria-label={label} type={type} value={form[key] ?? ""} onChange={e => set(key, e.target.value)} /></Field>;
  return <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
    <div className="flex items-center gap-3"><Link href={id ? `/quotes/${id}` : "/quotes"}><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Button></Link><div><h1 className="text-xl font-semibold">{id ? "Edit quote" : "New quote"}</h1><p className="text-sm text-muted-foreground">Nothing goes to the customer until you send it.</p></div></div>
    {wasSent && <p role="status" className="text-sm rounded-md border p-3">This quote was already sent. Saving changes turns its link off until you send it again, so the customer can't accept old rates.</p>}
    <form className="space-y-5" onSubmit={save}>
      <Card><CardHeader><CardTitle className="text-base">Who is this for?</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex gap-2"><Button type="button" size="sm" variant={isNew ? "outline" : "default"} onClick={() => setIsNew(false)} data-testid="button-quote-existing">Existing customer</Button><Button type="button" size="sm" variant={isNew ? "default" : "outline"} onClick={() => setIsNew(true)} data-testid="button-quote-new-customer">New customer</Button></div>
        {isNew ? <>
          <div className="grid sm:grid-cols-2 gap-4">{prospectField("prospectName", "Name")}{prospectField("prospectCompany", "Company (optional)")}{prospectField("prospectEmail", "Email", "email")}{prospectField("prospectPhone", "Phone", "tel")}</div>
          <div className="grid sm:grid-cols-2 gap-4">{prospectField("prospectAddressLine1", "Service address")}{prospectField("prospectAddressLine2", "Address line 2")}</div>
          <div className="grid sm:grid-cols-3 gap-4">{prospectField("prospectCity", "City")}{prospectField("prospectState", "State")}{prospectField("prospectZip", "ZIP")}</div>
          <p className="text-xs text-muted-foreground">They're added to Customers once an accepted quote becomes an invoice or job.</p>
        </> : <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Customer"><Choice label="Customer" value={String(form.customerId || "none")} options={[{ value: "none", label: "Select customer" }, ...customers.map(c => ({ value: String(c.id), label: c.companyName || c.name }))]} onChange={v => setForm((f: any) => ({ ...f, customerId: v === "none" ? null : Number(v), propertyId: null }))} /></Field>
          <Field label="Property (optional)"><Choice label="Property" value={String(form.propertyId || "none")} options={[{ value: "none", label: "No property" }, ...ownProperties.map(p => ({ value: String(p.id), label: p.name }))]} onChange={chooseProperty} /></Field>
        </div>}
        <div className="grid sm:grid-cols-3 gap-4">{prospectField("attention", "Attention (optional)")}<Field label="Quote date"><Input aria-label="Quote date" type="date" required value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></Field><Field label="Valid until"><Input aria-label="Valid until" type="date" required min={form.issueDate} value={form.validUntil} onChange={e => set("validUntil", e.target.value)} /></Field></div>
        <Field label="House specs"><Input aria-label="House specs" placeholder="12 guests, 5 bedrooms, 8 beds, & 3 full bathrooms" value={form.houseSpecs ?? ""} onChange={e => set("houseSpecs", e.target.value)} data-testid="input-house-specs" /></Field>
      </CardContent></Card>

      <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Services and rates</CardTitle><p className="text-sm text-muted-foreground mt-1">Prices appear beside each service. There's no total on a quote.</p></div>
        {!!templates?.length && <div className="w-48"><Choice label="Start from template" value="" options={templates.map(t => ({ value: String(t.id), label: t.name }))} onChange={v => { const t = templates.find(x => String(x.id) === v); if (t && (!sections.length || window.confirm(`Replace these sections with ${t.name}?`))) useTemplate(t); }} /></div>}
      </CardHeader>
        <CardContent className="space-y-4">
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          {sections.map((s, i) => <div key={s.key} className="rounded-md border p-3 space-y-3" data-testid={`quote-section-${i}`}>
            <div className="flex flex-wrap gap-2 items-start">
              <div className="flex-1 min-w-[220px]"><Input aria-label={`Section ${i + 1} heading`} className="font-medium" placeholder="Section heading" required value={s.title} onChange={e => setSection(i, { title: e.target.value })} /></div>
              <div className="w-32"><Input aria-label={`Section ${i + 1} price`} placeholder="Price" value={s.price} onChange={e => setSection(i, { price: e.target.value })} /></div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Move ${s.title || "section"} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-4 h-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Move ${s.title || "section"} down`} disabled={i === sections.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-4 h-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${s.title || "section"}`} onClick={() => setSections(sections.filter((_, n) => n !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-2 sm:pl-4">
              {s.lines.map((l, n) => <div key={l.key} className="flex flex-wrap gap-2 items-start">
                <div className="w-full sm:w-36"><Input aria-label={`Section ${i + 1} line ${n + 1} label`} placeholder="Label (optional)" value={l.label} onChange={e => setLine(i, n, { label: e.target.value })} /></div>
                <div className="flex-1 min-w-[200px]"><Textarea aria-label={`Section ${i + 1} line ${n + 1} text`} placeholder="What's included" rows={2} className="min-h-0" value={l.text} onChange={e => setLine(i, n, { text: e.target.value })} /></div>
                <div className="w-28"><Input aria-label={`Section ${i + 1} line ${n + 1} price`} placeholder="Price" value={l.price} onChange={e => setLine(i, n, { price: e.target.value })} /></div>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setSection(i, { lines: s.lines.filter((_, m) => m !== n) })}><Trash2 className="w-4 h-4" /></Button>
              </div>)}
              <Button type="button" variant="ghost" size="sm" onClick={() => setSection(i, { lines: [...s.lines, newLine()] })} data-testid={`button-add-line-${i}`}><Plus className="w-4 h-4 mr-2" />Add line</Button>
            </div>
          </div>)}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setSections([...sections, newSection()])} data-testid="button-add-section"><Plus className="w-4 h-4 mr-2" />Add section</Button>
            <div className="flex items-end gap-2"><div className="w-40"><Field label="Template name"><Input aria-label="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)} /></Field></div><Button type="button" variant="outline" disabled={!sections.length || !templateName.trim()} onClick={saveTemplate} data-testid="button-save-template">Save as template</Button></div>
          </div>
        </CardContent></Card>

      <Card><CardContent className="pt-6 space-y-4">
        <Field label="Message to customer"><Textarea aria-label="Message to customer" value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></Field>
        <Field label="Internal notes (not shown to customer)"><Textarea aria-label="Internal quote notes" value={form.internalNotes || ""} onChange={e => set("internalNotes", e.target.value)} /></Field>
      </CardContent></Card>
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={busy || !ready} data-testid="button-save-quote">{busy ? "Working…" : id ? "Save changes" : "Save & review"}</Button></div>
    </form>
  </div>;
}
