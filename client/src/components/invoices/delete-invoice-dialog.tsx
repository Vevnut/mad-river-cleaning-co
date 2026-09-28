import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

// Set by the Invoices list "Delete…" menu so the invoice page opens straight into step 1.
export const pendingDelete = { id: "" };

// Deleting an invoice takes three deliberate steps:
// 1. review what will be removed, 2. tick "I understand", 3. type the invoice number.
export function DeleteInvoiceDialog({ open, onOpenChange, inv, customerName, itemCount, payments, onVoidInstead }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inv: any;
  customerName: string;
  itemCount: number;
  payments: any[];
  onVoidInstead?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => { if (open) { setStep(1); setUnderstood(false); setTyped(""); setError(""); } }, [open]);

  const paid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const cardPayment = payments.some(p => (p.provider || "manual") !== "manual");
  const matches = typed.trim().toUpperCase() === String(inv.invoiceNumber).toUpperCase();
  const wasSent = !!inv.sentAt;

  async function remove() {
    setBusy(true); setError("");
    try {
      await apiRequest("POST", `/api/invoices/${inv.id}/delete`, { confirmInvoiceNumber: typed.trim(), understood: true });
      onOpenChange(false);
      navigate("/invoices");
      queryClient.removeQueries({ queryKey: ["/api/invoices", inv.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: `Invoice ${inv.invoiceNumber} deleted` });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-delete-invoice">
        <DialogHeader>
          <DialogTitle>Delete invoice {inv.invoiceNumber}?</DialogTitle>
          <DialogDescription data-testid="text-delete-step">Step {step} of 3 · {step === 1 ? "Review what will be removed" : step === 2 ? "Confirm you understand" : "Type the invoice number"}</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <p><span className="text-muted-foreground">Customer:</span> {customerName}</p>
              <p><span className="text-muted-foreground">Total:</span> {formatMoney(inv.total)} · {itemCount} {itemCount === 1 ? "charge" : "charges"}</p>
              <p><span className="text-muted-foreground">Issued:</span> {inv.issueDate}</p>
              {inv.jobId && <p><span className="text-muted-foreground">Job #{inv.jobId}</span> goes back to completed, ready to invoice again.</p>}
            </div>
            {payments.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 flex gap-2" data-testid="text-delete-payment-warning">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                <p>This also deletes {payments.length === 1 ? "the recorded payment" : `${payments.length} recorded payments`} of <strong>{formatMoney(paid)}</strong>. It will no longer count as revenue.</p>
              </div>
            )}
            {wasSent && <p className="rounded-md bg-muted p-3">This invoice was emailed to the customer. Its link will stop working.</p>}
            {cardPayment && <p role="alert" className="text-destructive">This invoice has an online card payment, so it can't be deleted. Refund it in Stripe first.</p>}
            {!cardPayment && onVoidInstead && (wasSent || payments.length === 0) && inv.status !== "draft" && (
              <p className="text-muted-foreground">If this was a real invoice, voiding keeps the record instead.{" "}
                <button type="button" className="underline text-foreground" onClick={() => { onOpenChange(false); onVoidInstead(); }}>Void instead</button>
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
            <Checkbox id="delete-understood" checked={understood} onCheckedChange={v => setUnderstood(v === true)} data-testid="checkbox-delete-understood" />
            <Label htmlFor="delete-understood" className="font-normal leading-snug">
              I understand this permanently deletes invoice {inv.invoiceNumber}{payments.length ? ` and its ${formatMoney(paid)} payment record` : ""}. It can't be undone in the app.
            </Label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2 text-sm">
            <Label htmlFor="delete-confirm-number">Type <strong className="font-mono">{inv.invoiceNumber}</strong> to confirm</Label>
            <Input id="delete-confirm-number" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed}
              onChange={e => setTyped(e.target.value)} placeholder={inv.invoiceNumber} data-testid="input-delete-confirm-number" />
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={busy} onClick={() => step === 1 ? onOpenChange(false) : setStep(step - 1)} data-testid="button-delete-back">
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step === 1 && <Button variant="destructive" disabled={cardPayment} onClick={() => setStep(2)} data-testid="button-delete-continue">Continue</Button>}
          {step === 2 && <Button variant="destructive" disabled={!understood} onClick={() => setStep(3)} data-testid="button-delete-continue">Continue</Button>}
          {step === 3 && <Button variant="destructive" disabled={!matches || busy} onClick={remove} data-testid="button-delete-permanently">{busy ? "Deleting…" : "Delete permanently"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
