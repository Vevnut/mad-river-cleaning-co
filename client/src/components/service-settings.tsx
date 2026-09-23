import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Field, Choice, behaviorOptions } from "@/components/billing-fields";
import { formatMoney } from "@/lib/format";

const initial = { name: "", description: "", category: "Cleaning", defaultPrice: 0, defaultQuantity: 1, unit: "service", active: true, defaultInclusionBehavior: "suggested", taxable: false, sortOrder: 0 };
const initialProperty = { serviceId: null, customName: "", customDescription: "", customPrice: "", defaultQuantity: 1, enabled: true, invoiceBehavior: "suggested", internalNotes: "", excludesPropertyServiceId: null, saveToCatalog: true, category: "Other" };
const categories = ["Cleaning", "Hot tub", "Grill", "Trash", "Laundry", "Restocking", "Maintenance", "Damage/extra cleaning", "Other"];
const commonJobs = [
  { label: "Hot tub service", name: "Standard hot tub maintenance", category: "Hot tub", description: "Routine hot tub cleaning and maintenance." },
  { label: "Hot tub drain & refill", name: "Full hot tub drain, refill, and maintenance", category: "Hot tub", description: "Drain, clean, refill, and complete standard maintenance. Replaces routine hot tub service when appropriate." },
  { label: "Trash run", name: "Trash removal", category: "Trash", description: "Collect and remove trash; replace liners." },
  { label: "Grill cleaning", name: "Standard grill cleaning", category: "Grill", description: "Clean the grill and cooking surfaces." },
  { label: "Restocking", name: "Restock property supplies", category: "Restocking", description: "Check and replenish the property's agreed supplies." },
  { label: "Special task", name: "", category: "Other", description: "" },
];
export function ServiceSettings({ propertyId }: { propertyId?: number }) {
  const [edit, setEdit] = useState<any>(null), [busy, setBusy] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false), [search, setSearch] = useState("");
  const { toast } = useToast();
  const { data: catalog = [] } = useQuery<any[]>({ queryKey: ["/api/services"] });
  const endpoint = propertyId ? `/api/properties/${propertyId}/services` : "/api/services";
  const { data: services = [], error } = useQuery<any[]>({ queryKey: [endpoint] });
  const set = (k: string, v: any) => setEdit((s: any) => ({ ...s, [k]: v }));
  const fromCatalog = (c: any) => setEdit({ ...initialProperty, serviceId: c.id, customName: c.name, customDescription: c.description,
    customPrice: c.defaultPrice, defaultQuantity: c.defaultQuantity, invoiceBehavior: c.defaultInclusionBehavior, saveToCatalog: false });
  const start = (job?: typeof commonJobs[number]) => setEdit(propertyId
    ? { ...initialProperty, ...(job ? { customName: job.name, customDescription: job.description, category: job.category } : {}) }
    : { ...initial, defaultPrice: "", ...(job ? { name: job.name, description: job.description, category: job.category } : {}) });
  const save = async (value: any) => {
    setBusy(true);
    try {
      const reusable = propertyId && !value.id && !value.serviceId && value.saveToCatalog;
      await apiRequest(value.id ? "PATCH" : "POST", reusable ? `/api/properties/${propertyId}/common-services` : endpoint + (value.id ? `/${value.id}` : ""), value);
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/invoice-defaults`] });
      setEdit(null); toast({ title: reusable ? "Common job saved" : "Service saved", description: reusable ? "Added to this property and available in the library for other properties." : "Existing invoices keep their saved prices." });
    } catch (e: any) { toast({ title: "Could not save service", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };
  return <Card>
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">{propertyId ? "Services & Add-ons" : "Common job library"}</CardTitle>
      <p className="text-sm text-muted-foreground mt-1">{propertyId ? "Common jobs, property-specific prices, and recurring charges." : "Your common job library. Reuse services across properties with individual prices."}</p></div>
      <div className="flex flex-wrap gap-2">{propertyId && <Button variant="outline" onClick={() => setShowLibrary(v => !v)} aria-expanded={showLibrary}>{showLibrary ? "Hide common jobs" : "Browse common jobs"}</Button>}
        <Button onClick={() => start()}>Create common job</Button></div>
    </CardHeader>
    <CardContent className="space-y-3">
      {error && <p role="alert" className="text-destructive">{(error as Error).message}</p>}
      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <p className="text-sm font-medium">Start with a common task</p>
        <p className="text-xs text-muted-foreground">Choose a starting point, then set your price and instructions. Nothing is added or charged until you save.</p>
        <div className="flex flex-wrap gap-2">{commonJobs.map(job => <Button key={job.label} size="sm" variant="outline" onClick={() => start(job)}>{job.label}</Button>)}</div>
      </div>
      {propertyId && showLibrary && <section aria-label="Common job library" className="rounded-md border p-3 space-y-3">
        <h3 className="text-sm font-medium">Common job library</h3>
        <p className="text-xs text-muted-foreground">Choose a saved job, review its price, and add it to this property. Property overrides never change other properties.</p>
        <Input aria-label="Search common jobs" placeholder="Search hot tubs, trash, grills…" value={search} onChange={e => setSearch(e.target.value)} />
        {!catalog.filter(c => c.active && `${c.name} ${c.category}`.toLowerCase().includes(search.toLowerCase())).length && <p className="text-sm text-muted-foreground">No matching common jobs. Create one above to reuse it across your properties.</p>}
        {catalog.filter(c => c.active && `${c.name} ${c.category}`.toLowerCase().includes(search.toLowerCase())).map(c => {
          const existing = services.find(s => s.serviceId === c.id);
          return <div key={c.id} className="flex items-center justify-between gap-3 border-t pt-3">
            <div className="min-w-0"><p className="text-sm font-medium break-words">{c.name}</p><p className="text-xs text-muted-foreground">{c.category} · {formatMoney(c.defaultPrice)} × {c.defaultQuantity}</p></div>
            <Button variant="outline" size="sm" aria-label={existing ? `Edit configured ${c.name}` : `Use ${c.name}`} onClick={() => existing ? setEdit({ ...existing }) : fromCatalog(c)}>{existing ? "Edit configured" : "Use job"}</Button>
          </div>;
        })}
      </section>}
      {!services.length && <p className="text-sm text-muted-foreground py-4">No services configured yet. Add a catalog service or create a custom one.</p>}
      {services.map(s => <div key={s.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-medium text-sm break-words">{propertyId ? s.customName : s.name}</p><p className="text-sm text-muted-foreground">{formatMoney(propertyId ? s.customPrice : s.defaultPrice)} × {s.defaultQuantity} {s.unit || "service"}</p>
          <p className="text-xs text-muted-foreground mt-1">{propertyId ? s.serviceId ? "From common job library · property pricing" : "Property-only service" : s.category}</p>
          <Badge variant="secondary" className="mt-2">{(propertyId ? s.enabled : s.active) ? behaviorOptions.find(o => o.value === (s.invoiceBehavior || s.defaultInclusionBehavior))?.label : "Disabled"}</Badge>
          {s.excludesPropertyServiceId && <p className="text-xs mt-2 text-muted-foreground">Replaces {services.find(x => x.id === s.excludesPropertyServiceId)?.customName}</p>}
          {s.internalNotes && <p className="text-xs mt-2 text-muted-foreground">Internal: {s.internalNotes}</p>}
        </div><Button variant="outline" size="sm" onClick={() => setEdit({ ...s })}>Edit</Button>
      </div>)}
      <Dialog open={!!edit} onOpenChange={v => !v && setEdit(null)}><DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{edit?.id ? "Edit service" : edit?.serviceId ? "Add common job to property" : "Create common job"}</DialogTitle><DialogDescription>{propertyId ? "Set this property's price and invoice behavior. This does not schedule a work order." : "Save reusable service defaults. Add them to individual properties when needed."}</DialogDescription></DialogHeader>
        {edit && <form className="space-y-4" onSubmit={e => { e.preventDefault(); save(edit); }}>
          {propertyId && !edit.id && <Field label="Service source"><Choice label="Service source" value={String(edit.serviceId || "custom")} options={[{ value: "custom", label: "Create a new service" }, ...catalog.filter(c => c.active && !services.some(s => s.serviceId === c.id)).map(c => ({ value: String(c.id), label: c.name }))]} onChange={id => {
            const c = catalog.find(c => String(c.id) === id);
            setEdit({ ...edit, serviceId: c?.id || null, ...(c ? { customName: c.name, customDescription: c.description, customPrice: c.defaultPrice, defaultQuantity: c.defaultQuantity, invoiceBehavior: c.defaultInclusionBehavior } : {}) });
          }} /></Field>}
          {propertyId && !edit.id && !edit.serviceId && <div className="rounded-md border p-3 space-y-3">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={Boolean(edit.saveToCatalog)} onChange={e => set("saveToCatalog", e.target.checked)} /><span>Save to common job library for other properties<span className="block text-xs text-muted-foreground mt-1">Uncheck for a special service used only at this property. Internal instructions and exclusions stay property-specific.</span></span></label>
            {edit.saveToCatalog && <Field label="Category"><Choice label="Category" value={edit.category || "Other"} options={categories.map(v => ({ value: v, label: v }))} onChange={v => set("category", v)} /></Field>}
          </div>}
          <Field label="Service name"><Input aria-label="Service name" required value={propertyId ? edit.customName : edit.name} onChange={e => set(propertyId ? "customName" : "name", e.target.value)} /></Field>
          <Field label="Description shown on invoice"><Textarea aria-label="Service description" value={propertyId ? edit.customDescription : edit.description} onChange={e => set(propertyId ? "customDescription" : "description", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Price ($)"><Input aria-label="Service price" type="number" step=".01" min="0" required value={propertyId ? edit.customPrice : edit.defaultPrice} onChange={e => set(propertyId ? "customPrice" : "defaultPrice", e.target.valueAsNumber)} /></Field>
            <Field label="Default quantity"><Input aria-label="Service quantity" type="number" step=".01" min=".01" required value={edit.defaultQuantity} onChange={e => set("defaultQuantity", e.target.valueAsNumber)} /></Field></div>
          <Field label="Invoice behavior"><Choice label="Invoice behavior" value={propertyId ? edit.invoiceBehavior : edit.defaultInclusionBehavior} options={behaviorOptions} onChange={v => set(propertyId ? "invoiceBehavior" : "defaultInclusionBehavior", v)} /></Field>
          {propertyId ? <>
            <Field label="Replaces / excludes"><Choice label="Excludes service" value={String(edit.excludesPropertyServiceId || "none")} options={[{ value: "none", label: "No exclusion" }, ...services.filter(s => s.id !== edit.id).map(s => ({ value: String(s.id), label: s.customName }))]} onChange={v => set("excludesPropertyServiceId", v === "none" ? null : Number(v))} /></Field>
            <Field label="Internal instructions (never sent to client)"><Textarea aria-label="Internal service instructions" value={edit.internalNotes} onChange={e => set("internalNotes", e.target.value)} /></Field>
          </> : <><div className="grid grid-cols-2 gap-4"><Field label="Category"><Choice label="Category" value={edit.category} options={["Cleaning", "Hot tub", "Grill", "Trash", "Laundry", "Restocking", "Maintenance", "Damage/extra cleaning", "Other"].map(v => ({ value: v, label: v }))} onChange={v => set("category", v)} /></Field>
            <Field label="Unit"><Input aria-label="Service unit" value={edit.unit} onChange={e => set("unit", e.target.value)} /></Field></div>
            <Field label="Sort order"><Input aria-label="Sort order" type="number" step="1" value={edit.sortOrder} onChange={e => set("sortOrder", e.target.valueAsNumber)} /></Field>
            <p className="text-xs text-muted-foreground">Tax is not enabled in this workspace. Existing no-tax invoicing is preserved. Changes here do not overwrite services already configured on properties.</p>
          </>}
          <div className="flex items-center gap-3"><Switch aria-label="Service enabled" checked={Boolean(propertyId ? edit.enabled : edit.active)} onCheckedChange={v => set(propertyId ? "enabled" : "active", v)} /><span className="text-sm">Enabled</span></div>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save service"}</Button>
        </form>}
      </DialogContent></Dialog>
    </CardContent>
  </Card>;
}
export function PropertyInvoices({ propertyId }: { propertyId: number }) {
  const { data = [] } = useQuery<any[]>({ queryKey: ["/api/invoices", { propertyId }], queryFn: async () => (await apiRequest("GET", `/api/invoices?propertyId=${propertyId}`)).json() });
  return <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Invoices</CardTitle><Link href={`/invoices/new?propertyId=${propertyId}`}><Button>Create invoice</Button></Link></CardHeader>
    <CardContent>{!data.length ? <p className="text-sm text-muted-foreground">No invoices for this property yet.</p> : data.map(i => <Link href={`/invoices/${i.id}`} key={i.id} className="flex justify-between gap-3 py-3 border-b text-sm"><span>{i.invoiceNumber}<span className="text-muted-foreground ml-2">{i.status}</span></span><span>{formatMoney(i.total)}</span></Link>)}</CardContent></Card>;
}
export function BillingSetup() {
  const { data } = useQuery<any>({ queryKey: ["/api/integrations"] });
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [message, setMessage] = useState("");
  return <Card><CardHeader><CardTitle className="text-base">Payments, email & workspace access</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
    <p>Stripe: {data?.stripe ? `Configured (${data.mode} mode)` : "Not configured. Manual payments remain available."}</p>
    <p>Invoice email: {data?.email ? "Configured with Resend" : "Not configured. Set server email credentials before sending."}</p>
    <p className="text-muted-foreground">Provider keys belong only on the server. This deployment is one protected organization; every workspace account has full business access. Staff scheduling records do not automatically grant access.</p>
    <form className="space-y-3 border-t pt-4" onSubmit={async e => {
      e.preventDefault(); setMessage("");
      try { await apiRequest("POST", "/api/team", { email, password }); setEmail(""); setPassword(""); setMessage("Workspace account created. Share the password privately and securely."); }
      catch (e: any) { setMessage(e.message); }
    }}><h3 className="font-medium">Add trusted workspace account</h3><Field label="Email"><Input aria-label="Team email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="Initial password (12+ characters)"><Input aria-label="Team password" type="password" minLength={12} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <Button type="submit" variant="outline">Create account</Button><p role="status">{message}</p>
    </form>
  </CardContent></Card>;
}
