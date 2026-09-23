import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { Field, Choice, rateOptions } from "@/components/billing-fields";
import { InvoicePreview } from "@/pages/public-invoice";
import { formatMoney, businessDate } from "@/lib/format";
import { ArrowLeft, Send, Printer, Plus } from "lucide-react";

const methods = [["cash", "Cash"], ["check", "Check"], ["venmo", "Venmo"], ["zelle", "Zelle"], ["bank_transfer", "Bank transfer"], ["manual_card", "Card processed manually"], ["other", "Other"]].map(([value, label]) => ({ value, label }));
export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const endpoint = `/api/invoices/${id}`;
  const [modal, setModal] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [send, setSend] = useState<any>({}), [payment, setPayment] = useState<any>({});
  const { data: inv, error: loadError } = useQuery<any>({ queryKey: ["/api/invoices", Number(id)], queryFn: async () => (await apiRequest("GET", endpoint)).json(), staleTime: 0 });
  const { data: items = [] } = useQuery<any[]>({ queryKey: ["/api/invoices", Number(id), "items"], queryFn: async () => (await apiRequest("GET", `${endpoint}/items`)).json() });
  const { data: payments = [] } = useQuery<any[]>({ queryKey: ["/api/invoices", Number(id), "payments"], queryFn: async () => (await apiRequest("GET", `${endpoint}/payments`)).json() });
  const { data: history = [] } = useQuery<any[]>({ queryKey: ["/api/invoices", Number(id), "activity"], queryFn: async () => (await apiRequest("GET", `${endpoint}/activity`)).json() });
  const { data: owner } = useQuery<any>({ queryKey: ["/api/customers", inv?.customerId], enabled: !!inv, queryFn: async () => (await apiRequest("GET", `/api/customers/${inv.customerId}`)).json() });
  const { data: config } = useQuery<any>({ queryKey: ["/api/integrations"] });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }); queryClient.invalidateQueries({ queryKey: ["/api/payments"] }); };
  const action = async (path: string, payload?: any) => {
    setBusy(true); setError("");
    try { await apiRequest("POST", path, payload); refresh(); setModal(""); if (path.endsWith("/send")) setSend({}); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (loadError) return <p className="p-6 text-destructive">{(loadError as Error).message}</p>;
  if (!inv) return <p className="p-6">Loading invoice…</p>;
  const customer = inv.customerSnapshot ? JSON.parse(inv.customerSnapshot) : owner;
  return <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
    <div className="flex flex-wrap items-center gap-3"><Link href="/invoices"><Button variant="ghost" size="icon" aria-label="Back to invoices"><ArrowLeft className="h-4 w-4" /></Button></Link><h1 className="text-xl font-semibold flex-1">{inv.invoiceNumber}</h1><StatusBadge status={inv.status} /></div>
    <div className="flex flex-wrap gap-2">
      {inv.status !== "canceled" && <Button disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try {
          const pending = await (await apiRequest("GET", `${endpoint}/pending-send`)).json();
          if (pending) setSend({ ...pending, locked: true });
          else if (!send.requestKey) setSend({ recipient: customer?.email || "", subject: `Invoice ${inv.invoiceNumber} from Mad River Cleaning Co.`, message: inv.notes || "Thank you for your business. Please review your invoice below.", requestKey: crypto.randomUUID() });
          setModal("send");
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}><Send className="h-4 w-4 mr-2" />Send Invoice</Button>}
      <Button variant="outline" onClick={() => { setModal("preview"); setError(""); }}><Printer className="h-4 w-4 mr-2" />Preview / PDF</Button>
      {inv.status !== "canceled" && <><Link href={`/invoices/${id}/edit`}><Button variant="outline">Edit invoice</Button></Link>
        {inv.balanceDue > 0 && <Button variant="outline" onClick={() => { setPayment({ invoiceId: inv.id, amount: inv.balanceDue, method: "cash", paidDate: businessDate(), reference: "", note: "", requestKey: crypto.randomUUID() }); setError(""); setModal("payment"); }}><Plus className="h-4 w-4 mr-2" />Record Payment</Button>}
      </>}
    </div>
    <Card><CardContent className="pt-6 grid sm:grid-cols-2 gap-6">
      <div className="space-y-2 text-sm"><p className="text-xs uppercase tracking-wide text-muted-foreground">Customer / owner</p><Link href={`/customers/${inv.customerId}`} className="font-semibold">{customer?.companyName || customer?.name}</Link><p className="text-muted-foreground">{customer?.email}</p><p className="text-muted-foreground">{customer?.billingAddressLine1}<br />{customer?.billingCity}, {customer?.billingState} {customer?.billingZip}</p>
        {inv.propertyId && <Link href={`/properties/${inv.propertyId}`} className="block whitespace-pre-line">{inv.propertyAddress}</Link>}
      </div>
      <div className="space-y-2 text-sm"><p>Issued {inv.issueDate}</p><p>Due {inv.dueDate}</p><p className="text-muted-foreground">{rateOptions.find(r => r.value === inv.rateType)?.label}</p>{inv.jobId && <Link href={`/jobs/${inv.jobId}`} className="block text-primary">Source job #{inv.jobId}</Link>}
        {inv.sentAt && <p className="text-xs text-muted-foreground">Sent {new Date(inv.sentAt).toLocaleString()}</p>}
        <div className="border-t pt-3"><p className="text-muted-foreground">Balance due</p><p className="text-3xl font-semibold tabular-nums" data-testid="text-invoice-balance">{formatMoney(inv.balanceDue)}</p></div>
      </div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Invoice charges</CardTitle></CardHeader><CardContent className="space-y-4">
      {items.map(i => <div key={i.id} className="flex justify-between gap-4 border-b pb-3"><div className="min-w-0"><p className="font-medium text-sm">{i.description}</p>{!!i.isAutoAdded && <p className="text-xs text-primary">From property defaults</p>}{i.descriptionSnapshot && <p className="text-xs text-muted-foreground">{i.descriptionSnapshot}</p>}<p className="text-xs text-muted-foreground">{i.quantity} × {formatMoney(i.unitPrice)}</p></div><span className="tabular-nums text-sm">{formatMoney(i.amount)}</span></div>)}
      <div className="ml-auto max-w-sm space-y-2 text-sm">{[["Subtotal", inv.subtotal], ["Discount", -inv.discountAmount], ["Travel fee", inv.travelFee], ["Rush fee", inv.rushFee], ["Total", inv.total], ["Payments received", inv.amountPaid]].map(([label, value]) => <div key={label} className="flex justify-between"><span>{label}</span><span>{formatMoney(Number(value))}</span></div>)}</div>
      {inv.notes && <div className="bg-muted/40 p-3 rounded-md text-sm whitespace-pre-wrap"><p className="font-medium mb-1">Message to client</p>{inv.notes}</div>}
      {inv.internalNotes && <div className="border rounded-md p-3 text-sm whitespace-pre-wrap"><p className="font-medium mb-1">Internal notes · not shown to client</p>{inv.internalNotes}</div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Payment history</CardTitle></CardHeader><CardContent className="space-y-3">
      {!payments.length && <p className="text-sm text-muted-foreground">No payments recorded. Cash, check, Venmo, Zelle and other methods are still welcome.</p>}
      {payments.map(p => <div key={p.id} className="border rounded-md p-3 text-sm"><div className="flex justify-between"><span className="capitalize">{p.method.replaceAll("_", " ")}</span><strong>{formatMoney(p.amount)}</strong></div><p className="text-xs text-muted-foreground">{p.paidDate} · {p.provider || "manual"} · {p.reference || p.providerTransactionId || "No reference"}</p>{p.note && <p className="text-xs mt-2">Internal: {p.note}</p>}</div>)}
      {config?.stripe && <Button variant="outline" size="sm" disabled={busy} onClick={() => action(`${endpoint}/cancel-checkout`)}>Cancel / reconcile active online checkout</Button>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Invoice activity</CardTitle></CardHeader><CardContent className="space-y-4">
      {!history.length && <p className="text-sm text-muted-foreground">Historical invoice. Activity tracking starts with this upgrade.</p>}
      {history.map(h => { const d = JSON.parse(h.details); return <div key={h.id} className="text-sm border-b pb-3"><p className="capitalize font-medium">{h.activityType.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()} · {h.actor}</p>{d.recipient && <p className="text-xs mt-1">To: {d.recipient} {d.subject && `· ${d.subject}`}</p>}{d.message && <p className="text-xs whitespace-pre-wrap mt-1">{d.message}</p>}{d.amount != null && <p className="text-xs">{formatMoney(d.amount)}</p>}</div>; })}
    </CardContent></Card>
    {!inv.amountPaid && inv.status !== "canceled" && <Button variant="ghost" onClick={() => { setError(""); setModal("void"); }}>Void / cancel invoice</Button>}
    {error && !modal && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <Dialog open={!!modal} onOpenChange={v => !v && !busy && setModal("")}><DialogContent className={modal === "preview" || modal === "send" ? "max-w-3xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[90vh] overflow-y-auto"}>
      <DialogHeader><DialogTitle>{modal === "send" ? "Review & send invoice" : modal === "payment" ? "Record Payment" : modal === "void" ? "Void this invoice?" : "Client invoice preview"}</DialogTitle>
        <DialogDescription>{modal === "send" ? "Confirm the recipient and complete message before sending." : modal === "payment" ? "Record a payment already received outside online checkout." : modal === "void" ? "This cancels the invoice and disables its payment link. History is retained." : "Print or save a professional PDF."}</DialogDescription></DialogHeader>
      {modal === "preview" && <InvoicePreview invoiceId={inv.id} />}
      {modal === "send" && <form className="space-y-4" onSubmit={async e => { e.preventDefault(); await action(`${endpoint}/send`, send); }}>
        {send.locked && <p className="text-sm rounded-md border p-3">A previous send has an uncertain result. Review the original message and retry it unchanged to avoid duplicate emails.</p>}
        {!config?.email && <p className="text-sm rounded-md bg-muted p-3">Email is not configured yet. A server administrator must configure Resend before this can be sent. No email has been sent.</p>}
        <Field label="Recipient"><Input aria-label="Invoice recipient" readOnly={send.locked} required type="email" value={send.recipient || ""} onChange={e => setSend({ ...send, recipient: e.target.value })} /></Field>
        <Field label="Subject"><Input aria-label="Invoice email subject" readOnly={send.locked} required value={send.subject || ""} onChange={e => setSend({ ...send, subject: e.target.value })} /></Field>
        <Field label="Message"><Textarea aria-label="Invoice email message" readOnly={send.locked} value={send.message || ""} onChange={e => setSend({ ...send, message: e.target.value })} /></Field>
        <div className="rounded-md border p-3 text-sm space-y-2"><p>Invoice {inv.invoiceNumber} · Total {formatMoney(inv.total)}</p><p>Balance {formatMoney(inv.balanceDue)} · Due {inv.dueDate}</p><p>{config?.stripe ? `View & Pay Invoice button (${config.mode} card payments)` : "View Invoice button; online card payments unavailable"}</p><p>You may also pay using your usual arrangement with the business. Online payment is optional.</p></div>
        <details><summary className="text-sm cursor-pointer">View client invoice</summary><div className="mt-3"><InvoicePreview invoiceId={inv.id} /></div></details>
        <Button type="submit" disabled={busy || !config?.email}>{busy ? "Sending…" : "Confirm & send invoice"}</Button>
      </form>}
      {modal === "payment" && <form className="space-y-4" onSubmit={e => { e.preventDefault(); action("/api/payments", payment); }}>
        <Field label={`Amount ($) · outstanding ${formatMoney(inv.balanceDue)}`}><Input aria-label="Payment amount" type="number" min=".01" max={inv.balanceDue} step=".01" required value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.valueAsNumber })} /></Field>
        <Field label="Payment method"><Choice label="Payment method" value={payment.method} options={methods} onChange={v => setPayment({ ...payment, method: v })} /></Field>
        <Field label="Payment date"><Input aria-label="Payment date" type="date" required value={payment.paidDate} onChange={e => setPayment({ ...payment, paidDate: e.target.value })} /></Field>
        <Field label="Reference / check number"><Input aria-label="Payment reference" value={payment.reference} onChange={e => setPayment({ ...payment, reference: e.target.value })} /></Field>
        <Field label="Internal payment note"><Textarea aria-label="Payment note" value={payment.note} onChange={e => setPayment({ ...payment, note: e.target.value })} /></Field>
        <Button type="submit" disabled={busy}>{busy ? "Recording…" : "Record received payment"}</Button>
      </form>}
      {modal === "void" && <Button variant="destructive" disabled={busy} onClick={() => action(`${endpoint}/void`)}>Confirm void invoice</Button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent></Dialog>
  </div>;
}
