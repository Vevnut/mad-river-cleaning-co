import { useState } from "react";
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
import { StatusBadge } from "@/components/status-badge";
import { businessDate, formatDate, formatMoney } from "@/lib/format";

const jobTypes = [["one_time", "One-time"], ["deep_clean", "Deep clean"], ["turnover", "Turnover"], ["custom", "Custom"]].map(([value, label]) => ({ value, label }));

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const endpoint = `/api/quotes/${id}`;
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [modal, setModal] = useState(""), [job, setJob] = useState<any>({ scheduledDate: businessDate(1), scheduledTime: "09:00", durationMinutes: 120, jobType: "one_time", propertyId: null });
  const { data: q, error: loadError } = useQuery<any>({ queryKey: ["/api/quotes", Number(id)], queryFn: async () => (await apiRequest("GET", endpoint)).json(), staleTime: 0 });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"], enabled: modal === "job" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
  const link = q ? `${window.location.origin}/#/quote/${q.publicToken}` : "";
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); refresh(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const post = (path: string, body: any = {}) => run(async () => { await apiRequest("POST", `${endpoint}/${path}`, body); setModal(""); });
  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loadError) return <p className="p-6 text-destructive">{(loadError as Error).message}</p>;
  if (!q) return <p className="p-6">Loading quote…</p>;
  const open = ["draft", "sent", "expired"].includes(q.status);
  const needsProperty = !q.propertyId && !q.prospectAddressLine1;
  const toInvoice = () => run(async () => {
    const r = await (await apiRequest("POST", `${endpoint}/invoice`)).json();
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }); queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    navigate(`/invoices/${r.id}`);
  });
  const toJob = () => run(async () => {
    const r = await (await apiRequest("POST", `${endpoint}/job`, job)).json();
    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }); queryClient.invalidateQueries({ queryKey: ["/api/customers"] }); queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    navigate(`/jobs/${r.id}`);
  });

  return <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
    <div className="flex flex-wrap items-center gap-3"><Link href="/quotes"><Button variant="ghost" size="icon" aria-label="Back to quotes"><ArrowLeft className="h-4 w-4" /></Button></Link><h1 className="text-xl font-semibold flex-1">{q.quoteNumber}</h1><StatusBadge status={q.status} /></div>

    <div className="flex flex-wrap gap-2">
      {q.status === "draft" && <Button disabled={busy} onClick={() => post("send")} data-testid="button-send-quote"><Send className="h-4 w-4 mr-2" />Send Quote</Button>}
      {(q.status === "sent" || q.status === "expired") && <Button variant="outline" onClick={copy} data-testid="button-copy-quote-link">{copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}{copied ? "Copied" : "Copy customer link"}</Button>}
      {(open || q.status === "declined") && <Link href={`/quotes/${id}/edit`}><Button variant="outline">Edit quote</Button></Link>}
      {open && <><Button variant="outline" disabled={busy} onClick={() => post("respond", { decision: "accept" })} data-testid="button-mark-accepted">Mark accepted</Button><Button variant="outline" disabled={busy} onClick={() => post("respond", { decision: "decline" })}>Mark declined</Button></>}
      {q.status === "accepted" && <>
        {q.invoiceId ? <Link href={`/invoices/${q.invoiceId}`}><Button variant="outline">Open invoice</Button></Link> : <Button disabled={busy} onClick={toInvoice} data-testid="button-quote-to-invoice">Create invoice</Button>}
        {q.jobId ? <Link href={`/jobs/${q.jobId}`}><Button variant="outline">Open job</Button></Link> : <Button variant={q.invoiceId ? "default" : "outline"} disabled={busy} onClick={() => { setError(""); setModal("job"); }} data-testid="button-quote-to-job">Create job</Button>}
      </>}
    </div>
    {q.status === "sent" && <div className="space-y-2"><p className="text-sm text-muted-foreground">Text or email the customer this link. They can view the quote and accept or decline it there.</p><Input readOnly aria-label="Customer link" value={link} onFocus={e => e.target.select()} data-testid="input-quote-link" /></div>}
    {q.status === "expired" && <p className="text-sm text-muted-foreground">The valid-until date has passed, so the customer can't accept it. Edit the date, then send it again.</p>}

    <Card><CardContent className="pt-6 grid sm:grid-cols-2 gap-6 text-sm">
      <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">{q.isProspect ? "New customer" : "Customer"}</p>
        {q.customerId ? <Link href={`/customers/${q.customerId}`} className="font-semibold">{q.customerName}</Link> : <p className="font-semibold">{q.customerName}</p>}
        {q.isProspect && <><p className="text-muted-foreground">{[q.prospectEmail, q.prospectPhone].filter(Boolean).join(" · ")}</p><p className="text-muted-foreground">{q.prospectAddressLine1} {q.prospectAddressLine2}</p><p className="text-muted-foreground">{[q.prospectCity, q.prospectState, q.prospectZip].filter(Boolean).join(" ")}</p></>}
        {q.propertyAddress && <p className="whitespace-pre-line text-muted-foreground">{q.propertyAddress}</p>}
      </div>
      <div className="space-y-1"><p>Quoted {formatDate(q.issueDate)}</p><p>Valid until {formatDate(q.validUntil)}</p>{q.viewedAt && <p className="text-xs text-muted-foreground">Viewed {new Date(q.viewedAt).toLocaleString()}</p>}
        <div className="border-t pt-3 mt-2"><p className="text-muted-foreground">Quote total</p><p className="text-3xl font-semibold tabular-nums" data-testid="text-quote-total">{formatMoney(q.total)}</p></div>
      </div>
    </CardContent></Card>

    {(q.status === "accepted" || q.status === "declined") && <Card data-testid="card-quote-response"><CardContent className="pt-6 text-sm space-y-1">
      <p className="font-medium">{q.status === "accepted" ? "Accepted" : "Declined"}{q.respondedAt ? ` on ${new Date(q.respondedAt).toLocaleString()}` : ""}</p>
      {q.responseName && <p className="text-muted-foreground">{q.responseName}</p>}
      {q.responseNote && <p className="whitespace-pre-wrap">{q.responseNote}</p>}
    </CardContent></Card>}

    <Card><CardHeader><CardTitle className="text-base">Quote charges</CardTitle></CardHeader><CardContent className="space-y-4">
      {q.items.map((i: any) => <div key={i.id} className="flex justify-between gap-4 border-b pb-3"><div className="min-w-0"><p className="font-medium text-sm">{i.description}</p>{i.descriptionSnapshot && <p className="text-xs text-muted-foreground">{i.descriptionSnapshot}</p>}<p className="text-xs text-muted-foreground">{i.quantity} × {formatMoney(i.unitPrice)}</p></div><span className="tabular-nums text-sm">{formatMoney(i.amount)}</span></div>)}
      <div className="ml-auto max-w-sm space-y-2 text-sm">{[["Subtotal", q.subtotal], ["Discount", -q.discountAmount], ["Travel fee", q.travelFee], ["Rush fee", q.rushFee], ["Total", q.total]].filter(([label, value]) => label === "Subtotal" || label === "Total" || Number(value) !== 0).map(([label, value]) => <div key={label} className="flex justify-between"><span>{label}</span><span>{formatMoney(Number(value))}</span></div>)}</div>
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

    <Dialog open={modal === "job"} onOpenChange={v => !v && !busy && setModal("")}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Create a job from this quote</DialogTitle><DialogDescription>The job is priced at {formatMoney(q.total)}.{q.isProspect ? " This also adds them to Customers." : ""}{!q.propertyId && q.prospectAddressLine1 ? " Their address is added to Properties, where you can fill in the details." : ""}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); toJob(); }}>
        {needsProperty && <Field label="Property"><Choice label="Property" value={String(job.propertyId || "none")} options={[{ value: "none", label: "Select property" }, ...properties.filter(p => p.customerId === q.customerId).map(p => ({ value: String(p.id), label: p.name }))]} onChange={v => setJob({ ...job, propertyId: v === "none" ? null : Number(v) })} /></Field>}
        <div className="grid grid-cols-2 gap-4"><Field label="Date"><Input aria-label="Job date" type="date" required value={job.scheduledDate} onChange={e => setJob({ ...job, scheduledDate: e.target.value })} /></Field><Field label="Time"><Input aria-label="Job time" type="time" required value={job.scheduledTime} onChange={e => setJob({ ...job, scheduledTime: e.target.value })} /></Field></div>
        <div className="grid grid-cols-2 gap-4"><Field label="Duration (minutes)"><Input aria-label="Job duration" type="number" min="15" step="15" required value={job.durationMinutes} onChange={e => setJob({ ...job, durationMinutes: e.target.valueAsNumber })} /></Field><Field label="Job type"><Choice label="Job type" value={job.jobType} options={jobTypes} onChange={v => setJob({ ...job, jobType: v })} /></Field></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || (needsProperty && !job.propertyId)} data-testid="button-confirm-quote-job">{busy ? "Creating…" : "Create job"}</Button>
      </form>
    </DialogContent></Dialog>
  </div>;
}
