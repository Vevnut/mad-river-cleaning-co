import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { totalBeds } from "@shared/beds";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Choice } from "@/components/billing-fields";
import { QuotePreview } from "@/components/quote-preview";
import { businessDate } from "@/lib/format";
import { houseSpecs, type QuoteLine, type QuoteSection } from "@/lib/quote-services";

const blank = () => ({
  customerId: null as number | null, propertyId: null as number | null,
  prospectName: "", prospectCompany: "", prospectEmail: "", prospectPhone: "",
  prospectAddressLine1: "", prospectAddressLine2: "", prospectCity: "", prospectState: "", prospectZip: "",
  attention: "", houseSpecs: "", issueDate: businessDate(), validUntil: businessDate(30), notes: "", internalNotes: "",
});
type Row = QuoteSection & { key: string; on: boolean };
type Template = { id: number; name: string; sections: QuoteSection[] };
const uid = () => crypto.randomUUID();
const newLine = (): QuoteLine => ({ key: uid(), label: "", text: "", price: "" });
const rows = (sections: QuoteSection[], on = true): Row[] => sections.map(s => ({ ...s, key: uid(), on, lines: s.lines.map(l => ({ ...l, key: uid() })) }));
const lineText = (l: QuoteLine) => [l.label, l.text].filter(Boolean).join(" ");
// One text box per line: a label like "Laundry:" stays bold as long as the line still starts with it.
const editLine = (l: QuoteLine, value: string) => (l.label && value.startsWith(l.label) ? { label: l.label, text: value.slice(l.label.length).trimStart() } : { label: "", text: value });
const money = (n: number) => `$${n.toFixed(2)}`;

export default function QuoteNewPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<any>(blank), [sections, setSections] = useState<Row[]>([]);
  const [isNew, setIsNew] = useState(false), [wasSent, setWasSent] = useState(false), [loaded, setLoaded] = useState(!id);
  const [open, setOpen] = useState(""), [showMore, setShowMore] = useState(false), [showPreview, setShowPreview] = useState(false);
  const [templateName, setTemplateName] = useState("Standard");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const requestKey = useRef(crypto.randomUUID()), started = useRef(false);
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"] });
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const { data: templates, refetch: refetchTemplates } = useQuery<Template[]>({ queryKey: ["/api/quote-templates"] });
  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const setRow = (key: string, change: Partial<Row>) => setSections(list => list.map(s => (s.key === key ? { ...s, ...change } : s)));
  const setLine = (key: string, n: number, change: Partial<QuoteLine>) => setSections(list => list.map(s => (s.key === key ? { ...s, lines: s.lines.map((l, m) => (m === n ? { ...l, ...change } : l)) } : s)));
  const move = (i: number, by: number) => setSections(list => { const next = [...list]; const [s] = next.splice(i, 1); next.splice(i + by, 0, s); return next; });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const q = await (await apiRequest("GET", `/api/quotes/${id}`)).json();
        if (cancelled) return;
        setForm(q); setIsNew(!q.customerId); setWasSent(q.status !== "draft"); setSections(rows(q.sections)); setLoaded(true);
      } catch (e: any) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // A new quote starts from the template. An edited one also lists any template services it left out, switched off.
  useEffect(() => {
    if (!templates || !loaded || started.current) return;
    started.current = true;
    const standard = templates.find(t => t.name === "Standard") ?? templates[0];
    if (standard) setTemplateName(standard.name);
    setSections(list => {
      if (!id) return standard ? rows(standard.sections) : [];
      const has = new Set(list.map(s => s.title));
      return [...list, ...rows((standard?.sections ?? []).filter(s => !has.has(s.title)), false)];
    });
  }, [id, templates, loaded]);

  const ownProperties = properties.filter(p => p.customerId === form.customerId);
  const property = properties.find(p => p.id === form.propertyId);
  const customer = customers.find(c => c.id === form.customerId);
  const chooseProperty = (v: string) => {
    const p = properties.find(x => String(x.id) === v);
    setForm((f: any) => ({ ...f, propertyId: p?.id ?? null, houseSpecs: p ? houseSpecs(p, totalBeds(p)) : f.houseSpecs }));
    if (p?.standardDepartureRate != null) setSections(list => {
      const first = list.find(s => /departure/i.test(s.title) && s.price);
      return first ? list.map(s => (s === first ? { ...s, price: money(p.standardDepartureRate) } : s)) : list;
    });
  };
  const addService = () => { const row: Row = { key: uid(), on: true, title: "", price: "", lines: [newLine()] }; setSections([...sections, row]); setOpen(row.key); };
  const onSections = sections.filter(s => s.on);
  const ready = onSections.length > 0 && (isNew ? !!form.prospectName?.trim() : !!form.customerId);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const f = form, text = (v: any) => v ?? "";
      const payload = {
        customerId: isNew ? null : f.customerId, propertyId: isNew ? null : f.propertyId,
        prospectName: text(f.prospectName), prospectCompany: text(f.prospectCompany), prospectEmail: text(f.prospectEmail), prospectPhone: text(f.prospectPhone),
        prospectAddressLine1: text(f.prospectAddressLine1), prospectAddressLine2: text(f.prospectAddressLine2), prospectCity: text(f.prospectCity), prospectState: text(f.prospectState), prospectZip: text(f.prospectZip),
        attention: text(f.attention), houseSpecs: text(f.houseSpecs), issueDate: f.issueDate, validUntil: f.validUntil, notes: f.notes, internalNotes: f.internalNotes, sections: onSections,
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
      setNotice(`Saved. New quotes will start from ${templateName.trim()}.`);
    } catch (e: any) { setError(e.message); }
  };

  const prospectField = (key: string, label: string, type = "text") => <Field label={label}><Input aria-label={label} type={type} value={form[key] ?? ""} onChange={e => set(key, e.target.value)} /></Field>;
  const preview = <QuotePreview business={settings} sections={onSections} houseSpecs={form.houseSpecs ?? ""} attention={form.attention ?? ""} notes={form.notes ?? ""} issueDate={form.issueDate} validUntil={form.validUntil}
    customerName={isNew ? form.prospectCompany || form.prospectName : customer?.companyName || customer?.name || ""}
    address={isNew ? [form.prospectAddressLine1, [form.prospectCity, form.prospectState, form.prospectZip].filter(Boolean).join(" ")].filter(Boolean) : []}
    property={property ? [property.name, property.addressLine1, `${property.city}, ${property.state} ${property.zip}`] : []} />;

  return <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
    <div className="flex items-center gap-3"><Link href={id ? `/quotes/${id}` : "/quotes"}><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Button></Link><div className="flex-1"><h1 className="text-xl font-semibold">{id ? "Edit quote" : "New quote"}</h1><p className="text-sm text-muted-foreground">Pick who it's for and switch on what they need.</p></div></div>
    {wasSent && <p role="status" className="text-sm rounded-md border p-3">This quote was already sent. Saving changes turns its link off until you send it again, so the customer can't accept old rates.</p>}
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] gap-5 items-start">
      <form className="space-y-4" onSubmit={save}>
        <Card><CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">Who's it for?</p><Button type="button" size="sm" variant="ghost" onClick={() => setIsNew(!isNew)} data-testid="button-quote-new-customer">{isNew ? "Choose an existing customer" : "New customer"}</Button></div>
          {isNew ? <>
            <div className="grid sm:grid-cols-2 gap-3">{prospectField("prospectName", "Name")}{prospectField("prospectPhone", "Phone", "tel")}{prospectField("prospectEmail", "Email", "email")}{prospectField("prospectAddressLine1", "Service address")}</div>
            <div className="grid grid-cols-3 gap-3">{prospectField("prospectCity", "City")}{prospectField("prospectState", "State")}{prospectField("prospectZip", "ZIP")}</div>
          </> : <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Customer"><Choice label="Customer" value={String(form.customerId || "none")} options={[{ value: "none", label: "Select customer" }, ...customers.map(c => ({ value: String(c.id), label: c.companyName || c.name }))]} onChange={v => setForm((f: any) => ({ ...f, customerId: v === "none" ? null : Number(v), propertyId: null }))} /></Field>
            <Field label="Property"><Choice label="Property" value={String(form.propertyId || "none")} options={[{ value: "none", label: ownProperties.length ? "Select property" : "No property" }, ...ownProperties.map(p => ({ value: String(p.id), label: p.name }))]} onChange={chooseProperty} /></Field>
          </div>}
          <Field label="House specs"><Input aria-label="House specs" placeholder="12 guests, 5 bedrooms, 8 beds, & 3 full bathrooms" value={form.houseSpecs ?? ""} onChange={e => set("houseSpecs", e.target.value)} data-testid="input-house-specs" /></Field>
        </CardContent></Card>

        <Card><CardContent className="pt-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Services</p>{(templates?.length ?? 0) > 1 && <div className="w-44"><Choice label="Use a different template" value="" options={templates!.map(t => ({ value: String(t.id), label: t.name }))} onChange={v => { const t = templates!.find(x => String(x.id) === v); if (t && window.confirm(`Replace these services with ${t.name}?`)) { setSections(rows(t.sections)); setTemplateName(t.name); } }} /></div>}</div>
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          {!sections.length && <p className="text-sm text-muted-foreground">No services yet. Add one below.</p>}
          <div className="divide-y rounded-md border">{sections.map((s, i) => {
            const rates = s.lines.filter(l => l.price).length, expanded = open === s.key;
            return <div key={s.key} data-testid={`quote-service-${i}`}>
              <div className="flex items-center gap-3 px-3 py-2">
                <Switch checked={s.on} onCheckedChange={on => setRow(s.key, { on })} aria-label={`Include ${s.title || "this service"}`} data-testid={`switch-service-${i}`} />
                <button type="button" className={`flex-1 min-w-0 text-left text-sm font-medium truncate ${s.on ? "" : "text-muted-foreground"}`} onClick={() => setOpen(expanded ? "" : s.key)}>{s.title.replace(/:\s*$/, "").replace(/\s+service includes$/i, "") || "New service"}</button>
                {s.price ? <Input aria-label={`Price for ${s.title}`} className="h-8 w-24 text-right text-sm" value={s.price} disabled={!s.on} onChange={e => setRow(s.key, { price: e.target.value })} data-testid={`input-service-price-${i}`} /> : rates > 0 && <span className="text-xs text-muted-foreground whitespace-nowrap">{rates} rate{rates === 1 ? "" : "s"}</span>}
                <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" aria-expanded={expanded} onClick={() => setOpen(expanded ? "" : s.key)} data-testid={`button-edit-service-${i}`}>Edit<ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} /></Button>
              </div>
              {expanded && <div className="space-y-2 border-t bg-muted/20 p-3">
                <Input aria-label={`Heading for service ${i + 1}`} placeholder="Service name" required={s.on} value={s.title} onChange={e => setRow(s.key, { title: e.target.value })} />
                {!s.price && <Input aria-label={`Overall price for service ${i + 1}`} placeholder="Overall price (optional)" className="w-44" onBlur={e => { if (e.target.value.trim()) setRow(s.key, { price: e.target.value.trim() }); }} />}
                {s.lines.map((l, n) => <div key={l.key} className="flex gap-2 items-start">
                  <Textarea aria-label={`Service ${i + 1} line ${n + 1}`} rows={Math.min(10, Math.max(2, Math.ceil(lineText(l).length / 55)))} className="min-h-0 flex-1 resize-none text-xs" placeholder="What's included" value={lineText(l)} onChange={e => setLine(s.key, n, editLine(l, e.target.value))} />
                  <Input aria-label={`Service ${i + 1} line ${n + 1} price`} className="h-8 w-24 text-right text-xs" placeholder="Price" value={l.price} onChange={e => setLine(s.key, n, { price: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove line" onClick={() => setRow(s.key, { lines: s.lines.filter((_, m) => m !== n) })}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>)}
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRow(s.key, { lines: [...s.lines, newLine()] })}><Plus className="w-3.5 h-3.5 mr-1" />Add line</Button>
                  <span className="flex-1" />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setSections(sections.filter(x => x.key !== s.key))}>Remove service</Button>
                </div>
              </div>}
            </div>;
          })}</div>
          <Button type="button" variant="ghost" size="sm" onClick={addService} data-testid="button-add-section"><Plus className="w-4 h-4 mr-1" />Add a service</Button>
        </CardContent></Card>

        <Card><CardContent className="pt-4 pb-4 space-y-3">
          <button type="button" className="flex w-full items-center justify-between text-sm font-medium" aria-expanded={showMore} onClick={() => setShowMore(!showMore)} data-testid="button-more-options">More options<ChevronDown className={`w-4 h-4 transition-transform ${showMore ? "rotate-180" : ""}`} /></button>
          {showMore && <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">{prospectField("attention", "Attention")}<Field label="Quote date"><Input aria-label="Quote date" type="date" required value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></Field><Field label="Valid until"><Input aria-label="Valid until" type="date" required min={form.issueDate} value={form.validUntil} onChange={e => set("validUntil", e.target.value)} /></Field></div>
            {isNew && <div className="grid sm:grid-cols-2 gap-3">{prospectField("prospectCompany", "Company")}{prospectField("prospectAddressLine2", "Address line 2")}</div>}
            <Field label="Message to customer"><Textarea aria-label="Message to customer" rows={2} value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></Field>
            <Field label="Internal notes (not shown to customer)"><Textarea aria-label="Internal quote notes" rows={2} value={form.internalNotes || ""} onChange={e => set("internalNotes", e.target.value)} /></Field>
            <div className="flex items-end gap-2 border-t pt-3"><div className="w-44"><Field label="Template name"><Input aria-label="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)} /></Field></div><Button type="button" variant="outline" disabled={!sections.length || !templateName.trim()} onClick={saveTemplate} data-testid="button-save-template">Save services as template</Button></div>
          </div>}
        </CardContent></Card>

        {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" className="lg:hidden" onClick={() => setShowPreview(!showPreview)} data-testid="button-toggle-preview">{showPreview ? "Hide preview" : "Preview"}</Button>
          <span className="flex-1" />
          <Button type="submit" disabled={busy || !ready} data-testid="button-save-quote">{busy ? "Working…" : id ? "Save changes" : "Save & review"}</Button>
        </div>
        {showPreview && <div className="lg:hidden">{preview}</div>}
      </form>
      <aside className="hidden lg:block lg:sticky lg:top-4 max-h-[calc(100vh-7rem)] overflow-y-auto">{preview}</aside>
    </div>
  </div>;
}
