import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, DollarSign, Building2, Briefcase } from "lucide-react";
import type { Invoice, Customer, InvoiceItem, Payment, AppSettings, Job } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { formatMoney, formatDate } from "@/lib/format";

const BANNER_STYLES: Record<string, string> = {
  paid: "bg-status-paid-bg text-status-paid border-status-paid/20",
  partial: "bg-status-partial-bg text-status-partial border-status-partial/20",
  overdue: "bg-status-overdue-bg text-status-overdue border-status-overdue/20",
  canceled: "bg-status-canceled-bg text-status-canceled border-status-canceled/20",
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-status-scheduled-bg text-status-scheduled border-status-scheduled/20",
};

const BANNER_LABEL: Record<string, string> = {
  paid: "Paid in Full",
  partial: "Partially Paid",
  overdue: "Overdue",
  canceled: "Canceled",
  draft: "Draft — Not Yet Sent",
  sent: "Sent — Awaiting Payment",
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = Number(params.id);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: invoice, isLoading } = useQuery<Invoice>({
    queryKey: ["/api/invoices", invoiceId],
    queryFn: async () => (await apiRequest("GET", `/api/invoices/${invoiceId}`)).json(),
  });
  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customers", invoice?.customerId],
    queryFn: async () => (await apiRequest("GET", `/api/customers/${invoice!.customerId}`)).json(),
    enabled: !!invoice,
  });
  const { data: items = [] } = useQuery<InvoiceItem[]>({
    queryKey: ["/api/invoices", invoiceId, "items"],
    queryFn: async () => (await apiRequest("GET", `/api/invoices/${invoiceId}/items`)).json(),
    enabled: !!invoice,
  });
  const { data: paymentsList = [] } = useQuery<Payment[]>({
    queryKey: ["/api/invoices", invoiceId, "payments"],
    queryFn: async () => (await apiRequest("GET", `/api/invoices/${invoiceId}/payments`)).json(),
    enabled: !!invoice,
  });
  const { data: job } = useQuery<Job>({
    queryKey: ["/api/jobs", invoice?.jobId],
    queryFn: async () => (await apiRequest("GET", `/api/jobs/${invoice!.jobId}`)).json(),
    enabled: !!invoice?.jobId,
  });
  const { data: settings } = useQuery<AppSettings>({ queryKey: ["/api/settings"] });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Invoice not found.</p>
        <Link href="/invoices" className="text-sm text-primary hover:underline">Back to Invoices</Link>
      </div>
    );
  }

  const balance = Math.max(0, invoice.total - invoice.amountPaid);
  const canRecordPayment = invoice.status !== "paid" && invoice.status !== "canceled";

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/invoices">
          <Button size="icon" variant="ghost" data-testid="button-back-invoices-detail">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold min-w-0 basis-full sm:basis-auto sm:flex-1 truncate" data-testid="text-invoice-number">
          {invoice.invoiceNumber}
        </h1>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => window.open(`/api/invoices/${invoiceId}/print`, "_blank")}
          data-testid="button-print-invoice"
        >
          <Printer className="h-3.5 w-3.5" /> Print / Save PDF
        </Button>
        {canRecordPayment && (
          <Button size="sm" className="gap-1.5" onClick={() => setPaymentOpen(true)} data-testid="button-open-record-payment">
            <DollarSign className="h-3.5 w-3.5" /> Record Payment
          </Button>
        )}
      </div>

      {/* Payment status banner */}
      <div
        className={`rounded-md border px-4 py-2.5 text-sm font-medium ${BANNER_STYLES[invoice.status] ?? BANNER_STYLES.draft}`}
        data-testid="banner-payment-status"
      >
        {BANNER_LABEL[invoice.status] ?? invoice.status}
        {balance > 0 && invoice.status !== "draft" && (
          <span className="ml-1.5 font-normal opacity-90">— balance due {formatMoney(balance)}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" /> Bill To
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {customer ? (
              <>
                <Link href={`/customers/${customer.id}`} className="font-medium hover:underline" data-testid="link-invoice-customer">
                  {customer.companyName || customer.name}
                </Link>
                {customer.companyName && <p className="text-muted-foreground">{customer.name}</p>}
                <p className="text-muted-foreground">{customer.billingAddressLine1}{customer.billingAddressLine2 ? `, ${customer.billingAddressLine2}` : ""}</p>
                <p className="text-muted-foreground">{customer.billingCity}, {customer.billingState} {customer.billingZip}</p>
                <p className="text-muted-foreground">{customer.phone} &middot; {customer.email}</p>
              </>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" /> Invoice Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Issued:</span> {formatDate(invoice.issueDate)}</p>
            <p><span className="text-muted-foreground">Due:</span> {formatDate(invoice.dueDate)}</p>
            {job && (
              <p>
                <span className="text-muted-foreground">Source job:</span>{" "}
                <Link href={`/jobs/${job.id}`} className="hover:underline" data-testid="link-invoice-source-job">
                  Job #{job.id}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Description</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Qty</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Unit Price</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No line items.</TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow key={it.id} data-testid={`row-invoice-item-${it.id}`}>
                      <TableCell className="whitespace-nowrap">
                        {it.description} <span className="text-xs text-muted-foreground capitalize">({it.itemType})</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{it.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(it.unitPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">{formatMoney(it.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 ml-auto max-w-[280px] space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(invoice.subtotal)}</span></div>
            {invoice.discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-{formatMoney(invoice.discountAmount)}</span></div>}
            {invoice.travelFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Travel Fee</span><span className="tabular-nums">{formatMoney(invoice.travelFee)}</span></div>}
            {invoice.rushFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Rush Fee</span><span className="tabular-nums">{formatMoney(invoice.rushFee)}</span></div>}
            <div className="flex justify-between pt-1.5 border-t font-semibold text-base"><span>Total</span><span className="tabular-nums" data-testid="text-invoice-total">{formatMoney(invoice.total)}</span></div>
            {invoice.amountPaid > 0 && <div className="flex justify-between text-status-paid"><span>Amount Paid</span><span className="tabular-nums">-{formatMoney(invoice.amountPaid)}</span></div>}
            {balance > 0 && <div className="flex justify-between font-semibold text-status-overdue"><span>Balance Due</span><span className="tabular-nums" data-testid="text-invoice-balance">{formatMoney(balance)}</span></div>}
          </div>

          {invoice.notes && (
            <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-invoice-notes">
              {invoice.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2" data-testid="empty-payment-history">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {paymentsList.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm" data-testid={`row-payment-${p.id}`}>
                  <div>
                    <p className="font-medium tabular-nums">{formatMoney(p.amount)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.method} &middot; {formatDate(p.paidDate)}{p.reference ? ` · ${p.reference}` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog invoice={invoice} open={paymentOpen} onOpenChange={setPaymentOpen} />
    </div>
  );
}
