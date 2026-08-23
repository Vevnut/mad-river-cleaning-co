import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Invoice } from "@shared/schema";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";

export function RecordPaymentDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const balance = Math.max(0, invoice.total - invoice.amountPaid);
  const [amount, setAmount] = useState(String(balance.toFixed(2)));
  const [method, setMethod] = useState<"card" | "cash" | "check" | "ach" | "other">("card");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  const recordPayment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payments", {
        invoiceId: invoice.id,
        amount: Number(amount),
        method,
        paidDate,
        reference: reference || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoice.id, "payments"] });
      toast({ title: "Payment recorded" });
      onOpenChange(false);
      setReference("");
    },
    onError: (err: Error) => toast({ title: "Failed to record payment", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-record-payment">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Balance due: <span className="font-medium text-foreground tabular-nums">{formatMoney(balance)}</span>
          </p>
          <div>
            <Label htmlFor="payment-amount" className="text-xs font-medium text-muted-foreground block mb-1">Amount</Label>
            <Input
              id="payment-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-payment-amount"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger data-testid="select-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="payment-date" className="text-xs font-medium text-muted-foreground block mb-1">Date</Label>
            <Input
              id="payment-date"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              data-testid="input-payment-date"
            />
          </div>
          <div>
            <Label htmlFor="payment-reference" className="text-xs font-medium text-muted-foreground block mb-1">Reference (optional)</Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Check #, transaction ID..."
              data-testid="input-payment-reference"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-payment">Cancel</Button>
          <Button
            onClick={() => recordPayment.mutate()}
            disabled={recordPayment.isPending || !amount || Number(amount) <= 0}
            data-testid="button-submit-payment"
          >
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
