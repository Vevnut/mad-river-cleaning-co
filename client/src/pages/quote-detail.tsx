import { useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, Send, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Choice } from "@/components/billing-fields";
import { InvoicePdfButtons } from "@/components/invoice-pdf-buttons";
import { QuoteSections } from "@/components/quote-sections";
import { StatusBadge } from "@/components/status-badge";
import { businessDate, formatDate, formatMoney } from "@/lib/format";
import { pricedServices } from "@/lib/quote-services";

const jobTypes = [["one_time", "One-time"], ["deep_clean", "Deep clean"], ["turnover", "Turnover"], ["custom", "Custom"]].map(([value, label]) => ({ value, label }));
type Pick = { on: boolean; description: string; quantity: number; unitPrice: number };

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const endpoint = `/api/quotes/${id}`;
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [modal, setModal] = useState<"" | "invoice" | "job">(""), [picks, setPicks] = useState<Record<string, Pick>>({});
  const [job, setJob] = useState<any>({ scheduledDate: businessDate(1), scheduledTime: "09:00", durationMinutes: 120, jobType: "one_time", propertyId: null });
  const requestKey = useRef(crypto.randomUUID());
  const { data: q, error: loadError } = useQuery<any>({ queryKey: ["/api/quotes", Number(id)], queryFn: async () => (await apiRequest("GET", endpoint)).json(), staleTime: 0 });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"], enabled: modal === "job" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
  const link = q ? `${window.location.origin}/#/quote/${q.publicToken}` : "";
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); refresh(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const post = (path: string, body: any = {}) => run(async () => { await apiRequest("POST", `${endpoint}/${path}`, body); });
  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loadError) return <p className="p-6 text-destructive">{(loadError as Error).message}</p>;
  if (!q) return <p className="p-6">Loading quote…</p>;
  const open = ["draft", "sent", "expired"].includes(q.status);
  const needsProperty = !q.propertyId && !q.prospectAddressLine1;
  const services = pricedServices(q.sections);
  const startPicking = (mode: "invoice" | "job") => {
    setPicks(Object.fromEntries(services.map(s => [s.key, { on: false, description: s.description, quantity: 1, unitPrice: s.unitPrice }])));
    requestKey.current = crypto.randomUUID(); setError(""); setModal(mode);
  };
  const setPick = (key: string, change: Partial<Pick>) => setPicks(p => ({ ...p, [key]: { ...p[key], ...change } }));
  const lines = Object.values(picks).filter(p => p.on).map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice }));
  const pickedTotal = Math.round(lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0) * 100) / 100;
  const create = () => run(async () => {
    const r = await (await apiRequest("POST", `${endpoint}/${modal}`, modal === "invoice" ? { lines, requestKey: requestKey.current } : { ...job, lines })).json();
    for (const key of ["/api/invoices", "/api/jobs", "/api/customers", "/api/properties"]) queryClient.invalidateQueries({ queryKey: [key] });
    navigate(modal === "invoice" ? `/invoices/${r.id}` : `/jobs/${r.id}`);
  });

  return <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
    <div className="flex flex-wrap items-center gap-3"><Link href="/quotes"><Button variant="ghost" size="icon" aria-label="Back to quotes"><ArrowLeft className="h-4 w-4" /></Button></Link><h1 className="text-xl font-semibold flex-1">{q.quoteNumber}</h1><StatusBadge status={q.status} /></div>

    <div className="flex flex-wrap gap-2">
      {q.status === "draft" && <Button disabled={busy} onClick={() => post("send")} data-testid="button-send-quote"><Send className="h-4 w-4 mr-2" />Send Quote</Button>}
      {(q.status === "sent" || q.status === "expired") && <Button variant="outline" onClick={copy} data-testid="button-copy-quote-link">{copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}{copied ? "Copied" : "Copy customer link"}</Button>}
      {(open || q.status === "declined") && <Link href={`/quotes/${id}/edit`}><Button variant="outline">Edit quote</Button></Link>}
      {open && <><Button variant="outline" disabled={busy} onClick={() => post("respond", { decision: "accept" })} data-testid="button-mark-accepted">Mark accepted</Button><Button variant="outline" disabled={busy} onClick={() => post("respond", { decision: "decline" })}>Mark declined</Button></>}
      {q.status === "accepted" && <>
        <Button disabled={busy} onClick={() => startPicking("invoice")} data-testid="button-quote-to-invoice">Create invoice</Button>
        <Button variant="outline" disabled={busy} onClick={() => startPicking("job")} data-testid="button-quote-to-job">Create job</Button>
        {q.invoiceId && <Link href={`/invoices/${q.invoiceId}`}><Button variant="ghost">Latest invoice</Button></Link>}
        {q.jobId && <Link href={`/jobs/${q.jobId}`}><Button variant="ghost">Latest job</Button></Link>}
      </>}
    </div>
    {q.status === "sent" && <div className="space-y-2"><p className="text-sm text-muted-foreground">Text or email the customer this link. They can view the quote and accept or decline it there.</p><Input readOnly aria-label="Customer link" value={link} onFocus={e => e.target.select()} data-testid="input-quote-link" /></div>}
    {q.status === "expired" && <p className="text-sm text-muted-foreground">The valid-until date has passed, so the customer can't accept it. Edit the date, then send it again.</p>}
    {q.status === "accepted" && <p className="text-sm text-muted-foreground">These rates are agreed. Create an invoice or job each time work comes up.</p>}

    <Card><CardContent className="pt-6 grid sm:grid-cols-2 gap-6 text-sm">
      <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">{q.isProspect ? "New customer" : "Customer"}</p>
        {q.customerId ? <Link href={`/customers/${q.customerId}`} className="font-semibold">{q.customerName}</Link> : <p className="font-semibold">{q.customerName}</p>}
        {q.attention && <p className="text-muted-foreground">Attention: {q.attention}</p>}
        {q.isProspect && <><p className="text-muted-foreground">{[q.prospectEmail, q.prospectPhone].filter(Boolean).join(" · ")}</p><p className="text-muted-foreground">{q.prospectAddressLine1} {q.prospectAddressLine2}</p><p className="text-muted-foreground">{[q.prospectCity, q.prospectState, q.prospectZip].filter(Boolean).join(" ")}</p></>}
        {q.propertyAddress && <p className="whitespace-pre-line text-muted-foreground">{q.propertyAddress}</p>}
      </div>
      <div className="space-y-1"><p>Quoted {formatDate(q.issueDate)}</p><p>Valid until {formatDate(q.validUntil)}</p>{q.viewedAt && <p className="text-xs text-muted-foreground">Viewed {new Date(q.viewedAt).toLocaleString()}</p>}</div>
    </CardContent></Card>

    {(q.status === "accepted" || q.status === "declined") && <Card data-testid="card-quote-response"><CardContent className="pt-6 text-sm space-y-1">
      <p className="font-medium">{q.status === "accepted" ? "Accepted" : "Declined"}{q.respondedAt ? ` on ${new Date(q.respondedAt).toLocaleString()}` : ""}</p>
      {q.responseName && <p className="text-muted-foreground">{q.responseName}</p>}
      {q.responseNote && <p className="whitespace-pre-wrap">{q.responseNote}</p>}
    </CardContent></Card>}

    <Card><CardHeader><CardTitle className="text-base">Services and rates</CardTitle></CardHeader><CardContent className="space-y-4">
      <QuoteSections houseSpecs={q.houseSpecs} sections={q.sections} />
      {q.notes && <div className="bg-muted/40 p-3 rounded-md text-sm whitespace-pre-wrap"><p className="font-medium mb-1">Message to customer</p>{q.notes}</div>}
      {q.internalNotes && <div className="border rounded-md p-3 text-sm whitespace-pre-wrap"><p className="font-medium mb-1">Internal notes · not shown to customer</p>{q.internalNotes}</div>}
      <InvoicePdfButtons path={`${endpoint}/pdf`} fallbackName={`Quote ${q.quoteNumber}.pdf`} />
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Quote activity</CardTitle></CardHeader><CardContent className="space-y-3">
      {q.activity.map((h: any) => <div key={h.id} className="text-sm border-b pb-2"><p className="capitalize font-medium">{h.activityType.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()} · {h.actor}</p>{h.details && <p className="text-xs mt-1 whitespace-pre-wrap">{h.details}</p>}</div>)}
    </CardContent></Card>

    <div className="flex flex-wrap gap-2 border-t pt-4">
      {q.status !== "canceled" && !q.invoiceId && !q.jobId && <Button variant="ghost" disabled={busy} onClick={() => post("cancel")}><X className="h-4 w-4 mr-2" />Cancel quote</Button>}
      {q.status === "draft" && !q.sentAt && <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => run(async () => { await apiRequest("DELETE", endpoint); navigate("/quotes"); })}>Delete draft</Button>}
    </div>
    {error && !modal && <p role="alert" className="text-destructive text-sm">{error}</p>}

    <Dialog open={!!modal} onOpenChange={v => !v && !busy && setModal("")}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{modal === "invoice" ? "What should this invoice bill?" : "What's this job for?"}</DialogTitle>
        <DialogDescription>Tick the services that apply. Change the quantity or price if a rate needs it.{q.isProspect ? " This also adds them to Customers." : ""}{modal === "job" && !q.propertyId && q.prospectAddressLine1 ? " Their address is added to Properties, where you can fill in the details." : ""}{modal === "invoice" ? " If this work already has a job, invoice from the job instead so it isn't billed twice." : ""}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); create(); }}>
        <div className="space-y-2">
          {services.map(s => { const p = picks[s.key]; if (!p) return null; return <div key={s.key} className="rounded-md border p-2 space-y-2" data-testid={`pick-${s.key}`}>
            <label className="flex items-start gap-2 text-sm cursor-pointer"><input type="checkbox" className="mt-0.5" checked={p.on} onChange={e => setPick(s.key, { on: e.target.checked })} aria-label={`Include ${s.description}`} /><span className="flex-1">{s.description}</span><span className="text-muted-foreground whitespace-nowrap">{s.priceText}</span></label>
            {p.on && <div className="grid grid-cols-[1fr_5rem_6rem] gap-2 pl-5"><Input aria-label={`Description for ${s.description}`} required value={p.description} onChange={e => setPick(s.key, { description: e.target.value })} /><Input aria-label={`Quantity for ${s.description}`} type="number" min=".01" step=".01" required value={p.quantity} onChange={e => setPick(s.key, { quantity: e.target.valueAsNumber })} /><Input aria-label={`Price for ${s.description}`} type="number" min="0" step=".01" required value={p.unitPrice} onChange={e => setPick(s.key, { unitPrice: e.target.valueAsNumber })} /></div>}
          </div>; })}
          {!services.length && <p className="text-sm text-muted-foreground">This quote has no priced services.</p>}
        </div>
        {modal === "job" && <>
          {needsProperty && <Field label="Property"><Choice label="Property" value={String(job.propertyId || "none")} options={[{ value: "none", label: "Select property" }, ...properties.filter(p => p.customerId === q.customerId).map(p => ({ value: String(p.id), label: p.name }))]} onChange={v => setJob({ ...job, propertyId: v === "none" ? null : Number(v) })} /></Field>}
          <div className="grid grid-cols-2 gap-4"><Field label="Date"><Input aria-label="Job date" type="date" required value={job.scheduledDate} onChange={e => setJob({ ...job, scheduledDate: e.target.value })} /></Field><Field label="Time"><Input aria-label="Job time" type="time" required value={job.scheduledTime} onChange={e => setJob({ ...job, scheduledTime: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-4"><Field label="Duration (minutes)"><Input aria-label="Job duration" type="number" min="15" step="15" required value={job.durationMinutes} onChange={e => setJob({ ...job, durationMinutes: e.target.valueAsNumber })} /></Field><Field label="Job type"><Choice label="Job type" value={job.jobType} options={jobTypes} onChange={v => setJob({ ...job, jobType: v })} /></Field></div>
        </>}
        <div className="flex items-center justify-between gap-3 border-t pt-3"><p className="text-sm font-medium" data-testid="text-picked-total">{modal === "invoice" ? "Invoice total" : "Job price"}: {formatMoney(pickedTotal)}</p><Button type="submit" disabled={busy || !lines.length || (modal === "job" && needsProperty && !job.propertyId)} data-testid="button-confirm-quote-work">{busy ? "Creating…" : modal === "invoice" ? "Create invoice" : "Create job"}</Button></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </DialogContent></Dialog>
  </div>;
}
