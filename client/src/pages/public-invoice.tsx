import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { InvoicePdfButtons } from "@/components/invoice-pdf-buttons";

export function InvoicePreview({ invoiceId, invoiceNumber }: { invoiceId: number; invoiceNumber?: string }) {
  const { data: html, error } = useQuery({ queryKey: ["/api/invoices", invoiceId, "print"], queryFn: async () => (await apiRequest("GET", `/api/invoices/${invoiceId}/print`)).text() });
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Client preview. Internal notes and property access instructions are not included.</p>
    <InvoicePdfButtons path={`/api/invoices/${invoiceId}/pdf`} fallbackName={`Invoice ${invoiceNumber || invoiceId}.pdf`} />
    {error && <p role="alert">{(error as Error).message}</p>}
    {html && <iframe id="invoice-preview" title="Printable invoice preview" className="w-full h-[65vh] border rounded-md bg-white" sandbox="allow-same-origin allow-modals" srcDoc={html} />}
  </div>;
}
export default function PublicInvoicePage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const token = (routeToken || "").split("?")[0];
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const { data: inv, error: loadError, refetch } = useQuery<any>({ queryKey: [`/api/public/invoices/${token}`], refetchInterval: 10000, staleTime: 0 });
  if (loadError) return <div className="max-w-xl p-6 mx-auto"><h1 className="text-xl font-semibold">Invoice unavailable</h1><p className="mt-3 text-muted-foreground">{(loadError as Error).message} Contact the business for a new link.</p></div>;
  if (!inv) return <p className="p-6">Loading invoice…</p>;
  return <main className="h-[100dvh] overflow-y-auto bg-muted/30 py-6 px-4" data-testid="public-invoice-scroll"><div className="max-w-2xl mx-auto space-y-5">
    <div><p className="text-sm text-muted-foreground">Invoice from</p><h1 className="text-2xl font-semibold">{inv.businessName}</h1></div>
    <Card><CardHeader className="space-y-3"><div className="flex justify-between gap-4 flex-wrap"><CardTitle>{inv.invoiceNumber}</CardTitle><span className="text-sm capitalize">{inv.status === "canceled" ? "Void" : inv.status}</span></div><p className="text-sm text-muted-foreground">Issued {inv.issueDate} · Due {inv.dueDate}</p></CardHeader>
      <CardContent className="space-y-5"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Bill to</p><p className="font-medium">{inv.customerName}</p><p className="text-sm whitespace-pre-line text-muted-foreground mt-2">{inv.propertyAddress}</p></div>
        <div className="divide-y">{inv.items.map((i: any, n: number) => <div key={n} className="flex justify-between gap-4 py-3"><div><p className="text-sm font-medium">{i.description}</p>{i.descriptionSnapshot && <p className="text-xs text-muted-foreground">{i.descriptionSnapshot}</p>}<p className="text-xs text-muted-foreground">{i.quantity} × {formatMoney(i.unitPrice)}</p></div><span className="text-sm tabular-nums">{formatMoney(i.amount)}</span></div>)}</div>
        <div className="border-t pt-4 space-y-2 text-sm">{[["Subtotal", inv.subtotal], ["Discount", -inv.discountAmount], ["Travel fee", inv.travelFee], ["Rush fee", inv.rushFee], ["Total", inv.total], ["Payments received", inv.amountPaid]].map(([label, value]) => <div key={label} className="flex justify-between"><span>{label}</span><span>{formatMoney(Number(value))}</span></div>)}
          <div className="flex justify-between text-xl font-semibold pt-3"><span>Balance due</span><span>{formatMoney(inv.balanceDue)}</span></div></div>
        {inv.notes && <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{inv.notes}</p>}
        {inv.balanceDue > 0 && inv.status !== "canceled" && <div className="space-y-3">
          <Button className="w-full" disabled={!inv.onlineEnabled || busy || inv.status === "draft"} onClick={async () => {
            setBusy(true); setError("");
            try { const r = await (await apiRequest("POST", `/api/public/invoices/${token}/checkout`)).json(); window.location.assign(r.url); }
            catch (e: any) { setError(e.message); refetch(); } finally { setBusy(false); }
          }}>{busy ? "Opening secure checkout…" : inv.onlineEnabled ? "Pay Invoice securely" : "Online payment is not available"}</Button>
          <p className="text-sm text-muted-foreground">Online payment is optional. You may pay using your usual arrangement with the business. Contact {inv.businessEmail || inv.businessPhone} for payment instructions.</p>
        </div>}
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <InvoicePdfButtons path={`/api/public/invoices/${token}/pdf`} fallbackName={`Invoice ${inv.invoiceNumber}.pdf`} />
      </CardContent>
    </Card><p className="text-center text-xs text-muted-foreground">{inv.footer}</p>
  </div></main>;
}
