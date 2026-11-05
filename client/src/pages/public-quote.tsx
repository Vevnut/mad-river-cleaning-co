import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoicePdfButtons } from "@/components/invoice-pdf-buttons";
import { QuoteSections } from "@/components/quote-sections";
import { formatDate } from "@/lib/format";

const LABEL: Record<string, string> = { sent: "Awaiting your answer", accepted: "Accepted", declined: "Declined", expired: "Expired", canceled: "Canceled", draft: "Draft" };

/** What the customer sees at #/quote/<token>. No sign-in: the long random link is the key. */
export default function PublicQuotePage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const token = (routeToken || "").split("?")[0];
  const [mode, setMode] = useState<"" | "accept" | "decline">(""), [name, setName] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { data: q, error: loadError, refetch } = useQuery<any>({ queryKey: [`/api/public/quotes/${token}`], staleTime: 0 });
  if (loadError) return <div className="max-w-xl p-6 mx-auto"><h1 className="text-xl font-semibold">Quote unavailable</h1><p className="mt-3 text-muted-foreground">This quote link isn't active. Contact the business for a new one.</p></div>;
  if (!q) return <p className="p-6">Loading quote…</p>;
  const respond = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await apiRequest("POST", `/api/public/quotes/${token}/respond`, { decision: mode, name, note }); setMode(""); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); refetch(); }
  };
  return <main className="h-[100dvh] overflow-y-auto bg-muted/30 py-6 px-4" data-testid="public-quote-scroll"><div className="max-w-2xl mx-auto space-y-5">
    <div><p className="text-sm text-muted-foreground">Quote from</p><h1 className="text-2xl font-semibold">{q.businessName}</h1></div>
    <Card><CardHeader className="space-y-3"><div className="flex justify-between gap-4 flex-wrap"><CardTitle>{q.quoteNumber}</CardTitle><span className="text-sm" data-testid="text-public-quote-status">{LABEL[q.status] ?? q.status}</span></div><p className="text-sm text-muted-foreground">Quoted {formatDate(q.issueDate)} · Valid until {formatDate(q.validUntil)}</p></CardHeader>
      <CardContent className="space-y-5"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Prepared for</p><p className="font-medium">{q.customerName}</p>{q.attention && <p className="text-sm text-muted-foreground">Attention: {q.attention}</p>}{q.propertyAddress && <p className="text-sm whitespace-pre-line text-muted-foreground mt-2">{q.propertyAddress}</p>}</div>
        <QuoteSections houseSpecs={q.houseSpecs} sections={q.sections} />
        {q.notes && <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{q.notes}</p>}

        {q.status === "sent" && !mode && <div className="space-y-2"><div className="grid sm:grid-cols-2 gap-2"><Button onClick={() => { setError(""); setMode("accept"); }} data-testid="button-accept-quote">Accept quote</Button><Button variant="outline" onClick={() => { setError(""); setMode("decline"); }} data-testid="button-decline-quote">Decline</Button></div><p className="text-xs text-muted-foreground">No payment is taken here.</p></div>}
        {mode && <form className="space-y-3 rounded-md border p-4" onSubmit={respond}>
          {mode === "accept" ? <>
            <p className="text-sm font-medium">Accept this quote and the rates above?</p>
            <div className="space-y-2"><Label htmlFor="quote-name">Your name</Label><Input id="quote-name" required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} data-testid="input-quote-name" /></div>
            <p className="text-xs text-muted-foreground">{q.businessName} will contact you to arrange the work. No payment is taken here.</p>
          </> : <>
            <p className="text-sm font-medium">Decline this quote?</p>
            <div className="space-y-2"><Label htmlFor="quote-note">Anything you'd like us to know? (optional)</Label><Textarea id="quote-note" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></div>
          </>}
          <div className="flex gap-2"><Button type="submit" disabled={busy} data-testid="button-confirm-quote-answer">{busy ? "Sending…" : mode === "accept" ? "Confirm acceptance" : "Confirm decline"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("")}>Back</Button></div>
        </form>}
        {q.status === "accepted" && <p className="text-sm rounded-md bg-muted/40 p-3" role="status">Accepted{q.responseName ? ` by ${q.responseName}` : ""}{q.respondedAt ? ` on ${formatDate(q.respondedAt)}` : ""}. Thank you! {q.businessName} will be in touch.</p>}
        {q.status === "declined" && <p className="text-sm rounded-md bg-muted/40 p-3" role="status">You declined this quote. Thanks for letting us know.</p>}
        {q.status === "expired" && <p className="text-sm rounded-md bg-muted/40 p-3" role="status">This quote has expired. Contact {q.businessEmail || q.businessPhone} for an updated one.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <InvoicePdfButtons path={`/api/public/quotes/${token}/pdf`} fallbackName={`Quote ${q.quoteNumber}.pdf`} />
      </CardContent>
    </Card>
    <p className="text-center text-xs text-muted-foreground">Questions? {[q.businessPhone, q.businessEmail].filter(Boolean).join(" · ")}</p>
  </div></main>;
}
