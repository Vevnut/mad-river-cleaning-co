import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import type { Customer, Job, Property, AppSettings } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LineItemsEditor, type EditableLineItem } from "@/components/invoices/line-items-editor";
import { formatMoney } from "@/lib/format";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function InvoiceNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: settings } = useQuery<AppSettings>({ queryKey: ["/api/settings"] });

  const [mode, setMode] = useState<"manual" | "from-job">("manual");
  const [customerId, setCustomerId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [travelFee, setTravelFee] = useState(0);
  const [rushFee, setRushFee] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<EditableLineItem[]>([
    { key: "seed-1", description: "Turnover clean base fee", itemType: "service", quantity: 1, unitPrice: 0 },
  ]);

  useEffect(() => {
    if (settings) {
      setTaxRate(settings.defaultTaxRate);
      setDueDate(addDays(new Date().toISOString().slice(0, 10), settings.defaultPaymentTermsDays));
    }
  }, [settings]);

  const completedJobs = useMemo(() => jobs.filter((j) => j.status === "completed"), [jobs]);

  const propertyById = (id: number) => properties.find((p) => p.id === id);

  function applyJobPrefill(id: string) {
    setJobId(id);
    const job = jobs.find((j) => String(j.id) === id);
    if (!job) return;
    setCustomerId(String(job.customerId));
    const property = propertyById(job.propertyId);
    setItems([
      {
        key: "job-line",
        description: `${job.jobType.replace("_", " ")} clean — ${property?.name ?? "Property #" + job.propertyId}`,
        itemType: "service",
        quantity: 1,
        unitPrice: job.price,
      },
    ]);
  }

  const subtotal = useMemo(() => items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0), [items]);
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxable * taxRate;
  const total = taxable + taxAmount + travelFee + rushFee;

  const createInvoice = useMutation({
    mutationFn: async () => {
      if (mode === "from-job" && jobId) {
        const res = await apiRequest("POST", `/api/invoices/generate-from-job/${jobId}`, {});
        return res.json();
      }
      const res = await apiRequest("POST", "/api/invoices", {
        customerId: Number(customerId),
        jobId: null,
        invoiceNumber: `${settings?.invoiceNumberPrefix ?? "INV"}-${Date.now().toString().slice(-6)}`,
        issueDate,
        dueDate,
        status: "draft",
        discountAmount,
        taxRate,
        travelFee,
        rushFee,
        amountPaid: 0,
        notes: notes || null,
        items: items.map((it) => ({
          description: it.description,
          itemType: it.itemType,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      });
      return res.json();
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Invoice created" });
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (err: Error) => toast({ title: "Failed to create invoice", description: err.message, variant: "destructive" }),
  });

  const canSubmit =
    mode === "from-job"
      ? !!jobId
      : !!customerId && !!dueDate && items.some((it) => it.description.trim());

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link href="/invoices">
          <Button size="icon" variant="ghost" data-testid="button-back-invoices">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">New Invoice</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex rounded-lg border overflow-hidden h-9 max-w-xs">
            <button
              onClick={() => setMode("from-job")}
              data-testid="button-mode-from-job"
              className={`flex-1 text-xs font-medium transition-all ${mode === "from-job" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              From Completed Job
            </button>
            <button
              onClick={() => setMode("manual")}
              data-testid="button-mode-manual"
              className={`flex-1 text-xs font-medium transition-all ${mode === "manual" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              Manual
            </button>
          </div>

          {mode === "from-job" ? (
            <div>
              <Label className="text-xs font-medium text-muted-foreground block mb-1">Completed Job</Label>
              <Select value={jobId} onValueChange={applyJobPrefill}>
                <SelectTrigger data-testid="select-invoice-job">
                  <SelectValue placeholder="Select a completed job..." />
                </SelectTrigger>
                <SelectContent>
                  {completedJobs.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No completed jobs available.</div>
                  ) : (
                    completedJobs.map((j) => {
                      const property = propertyById(j.propertyId);
                      return (
                        <SelectItem key={j.id} value={String(j.id)}>
                          {property?.name ?? `Property #${j.propertyId}`} — {j.scheduledDate} ({formatMoney(j.price)})
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Pre-fills the customer and one service line item from the job's price. The job will move to "Invoiced" status.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-medium text-muted-foreground block mb-1">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger data-testid="select-invoice-customer">
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground block mb-1">Issue Date</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} data-testid="input-invoice-issue-date" />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground block mb-1">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="input-invoice-due-date" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {mode === "manual" && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <LineItemsEditor items={items} onChange={setItems} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Fees, Discount &amp; Tax</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground block mb-1">Discount ($)</Label>
                <Input type="number" min={0} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} data-testid="input-invoice-discount" />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground block mb-1">Travel Fee ($)</Label>
                <Input type="number" min={0} step="0.01" value={travelFee} onChange={(e) => setTravelFee(Number(e.target.value))} data-testid="input-invoice-travel-fee" />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground block mb-1">Rush Fee ($)</Label>
                <Input type="number" min={0} step="0.01" value={rushFee} onChange={(e) => setRushFee(Number(e.target.value))} data-testid="input-invoice-rush-fee" />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground block mb-1">Tax Rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={Math.round(taxRate * 10000) / 100}
                  onChange={(e) => setTaxRate(Number(e.target.value) / 100)}
                  data-testid="input-invoice-tax-rate"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional note shown on the printed invoice..." data-testid="textarea-invoice-notes" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(subtotal)}</span></div>
              {discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-{formatMoney(discountAmount)}</span></div>}
              {travelFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Travel Fee</span><span className="tabular-nums">{formatMoney(travelFee)}</span></div>}
              {rushFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Rush Fee</span><span className="tabular-nums">{formatMoney(rushFee)}</span></div>}
              {taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{formatMoney(taxAmount)}</span></div>}
              <div className="flex justify-between pt-1.5 border-t font-semibold text-base"><span>Total</span><span className="tabular-nums" data-testid="text-invoice-new-total">{formatMoney(total)}</span></div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex justify-end gap-2 pb-6">
        <Link href="/invoices">
          <Button variant="outline" data-testid="button-cancel-new-invoice">Cancel</Button>
        </Link>
        <Button
          onClick={() => createInvoice.mutate()}
          disabled={!canSubmit || createInvoice.isPending}
          data-testid="button-submit-new-invoice"
        >
          Create Invoice
        </Button>
      </div>
    </div>
  );
}
