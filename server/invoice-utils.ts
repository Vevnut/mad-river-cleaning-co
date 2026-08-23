/**
 * Shared server-side invoice math. Totals are always computed here, never
 * trusted from the client, per the Phase 3 spec ("Invoice totals computed
 * server-side on save").
 */
import type { InvoiceItem } from "@shared/schema";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeInvoiceTotals(opts: {
  items: Pick<InvoiceItem, "amount">[];
  discountAmount: number;
  taxRate: number;
  travelFee: number;
  rushFee: number;
}): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = round2(opts.items.reduce((sum, i) => sum + i.amount, 0));
  const taxable = Math.max(0, subtotal - opts.discountAmount);
  const taxAmount = round2(taxable * opts.taxRate);
  const total = round2(taxable + taxAmount + opts.travelFee + opts.rushFee);
  return { subtotal, taxAmount, total };
}

/** Derives the correct status from due date + amounts, unless explicitly draft/canceled. */
export function deriveInvoiceStatus(opts: {
  currentStatus: string;
  dueDate: string;
  total: number;
  amountPaid: number;
}): "draft" | "sent" | "paid" | "partial" | "overdue" | "canceled" {
  if (opts.currentStatus === "draft" || opts.currentStatus === "canceled") {
    return opts.currentStatus as "draft" | "canceled";
  }
  if (opts.amountPaid >= opts.total && opts.total > 0) return "paid";
  const isPastDue = new Date(opts.dueDate + "T23:59:59") < new Date();
  if (opts.amountPaid > 0) return isPastDue ? "partial" : "partial";
  return isPastDue ? "overdue" : "sent";
}
