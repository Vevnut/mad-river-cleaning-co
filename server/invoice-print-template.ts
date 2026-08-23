// ─── Server-rendered printable Invoice HTML (Phase 3) ─────────────────────
// Adapted from reference-boats-and-notes/server/pdf-template.ts — teal accent
// per Ridgeline brand, cleaning line items instead of parts/labor.

const TEAL = "#0e7490";

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt$(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export type PrintInvoice = {
  id: number;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  travelFee: number;
  rushFee: number;
  total: number;
  amountPaid: number;
  notes?: string | null;
};

export type PrintCustomer = {
  name: string;
  companyName?: string | null;
  email: string;
  phone: string;
  billingAddressLine1: string;
  billingAddressLine2?: string | null;
  billingCity: string;
  billingState: string;
  billingZip: string;
};

export type PrintItem = {
  description: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type PrintBusiness = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  invoiceFooterNote: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid in Full",
  partial: "Partially Paid",
  overdue: "Overdue",
  canceled: "Canceled",
};

function statusBannerStyle(status: string): string {
  switch (status) {
    case "paid":
      return "background:#e6f6ec;color:#1a7d43;border:1px solid #b8e6c8;";
    case "partial":
      return "background:#fdf3e0;color:#92600a;border:1px solid #f3d896;";
    case "overdue":
      return "background:#fce8ea;color:#b3123b;border:1px solid #f4b9c6;";
    case "canceled":
      return "background:#f1f2f3;color:#666;border:1px solid #dcdfe2;";
    default:
      return `background:#e8f4f7;color:${TEAL};border:1px solid #b0d4df;`;
  }
}

export function renderInvoicePrintHtml(opts: {
  invoice: PrintInvoice;
  customer: PrintCustomer;
  items: PrintItem[];
  business: PrintBusiness;
}): string {
  const { invoice, customer, items, business } = opts;
  const balance = invoice.total - invoice.amountPaid;
  const billingLines = [
    customer.billingAddressLine1,
    customer.billingAddressLine2,
    `${customer.billingCity}, ${customer.billingState} ${customer.billingZip}`,
  ].filter(Boolean);

  const itemRows = items
    .map(
      (it) => `<tr>
        <td>${esc(it.description)} <span class="muted">(${esc(it.itemType)})</span></td>
        <td class="right">${it.quantity}</td>
        <td class="right">${fmt$(it.unitPrice)}</td>
        <td class="right">${fmt$(it.amount)}</td>
      </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(invoice.invoiceNumber)} — ${esc(business.businessName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 0; background: #fff; }
  .page { padding: 42px 48px; max-width: 800px; margin: 0 auto; }
  .banner { text-align:center; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 8px; border-radius: 6px; margin-bottom: 20px; ${statusBannerStyle(invoice.status)} }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${TEAL}; padding-bottom: 16px; margin-bottom: 20px; }
  .brand-name { font-size: 24px; font-weight: bold; color: ${TEAL}; }
  .brand-sub { font-size: 12px; color: #555; margin-top: 4px; line-height: 1.6; }
  .doc-meta { text-align: right; font-size: 12px; color: #333; }
  .doc-meta .inv-num { font-size: 20px; font-weight: bold; color: ${TEAL}; }
  .info-grid { display: flex; gap: 20px; margin-bottom: 20px; }
  .info-box { flex: 1; background: #f7f8fa; border: 1px solid #e2e5e9; border-radius: 6px; padding: 12px 14px; }
  .info-label { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; color: ${TEAL}; margin-bottom: 6px; }
  .info-row { font-size: 12px; color: #333; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
  thead th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; border-bottom: 2px solid #d8dce1; padding: 6px 4px; }
  tbody td { padding: 7px 4px; border-bottom: 1px solid #eceef1; vertical-align: top; }
  td.right, th.right { text-align: right; }
  .muted { color: #888; font-size: 10.5px; }
  .totals { margin-top: 16px; margin-left: auto; width: 300px; font-size: 12.5px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals-row.grand { border-top: 2px solid ${TEAL}; margin-top: 4px; padding-top: 8px; font-weight: bold; font-size: 15px; color: ${TEAL}; }
  .totals-row.balance { font-weight: bold; color: #b3123b; }
  .notes-block { margin-top: 24px; font-size: 12px; color: #444; background: #f7f8fa; border: 1px solid #e2e5e9; border-radius: 6px; padding: 12px 14px; white-space: pre-wrap; }
  .footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #d8dce1; text-align: center; font-size: 10.5px; color: #777; }
</style>
</head>
<body><div class="page">

  <div class="banner">${esc(STATUS_LABEL[invoice.status] ?? invoice.status)}</div>

  <div class="header">
    <div>
      <div class="brand-name">${esc(business.businessName)}</div>
      <div class="brand-sub">${esc(business.businessAddress)}<br>${esc(business.businessPhone)} &bull; ${esc(business.businessEmail)}</div>
    </div>
    <div class="doc-meta">
      <div class="inv-num">${esc(invoice.invoiceNumber)}</div>
      <div>Issued: ${fmtDate(invoice.issueDate)}</div>
      <div>Due: ${fmtDate(invoice.dueDate)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">Bill To</div>
      <div class="info-row"><strong>${esc(customer.companyName || customer.name)}</strong></div>
      ${customer.companyName ? `<div class="info-row">${esc(customer.name)}</div>` : ""}
      ${billingLines.map((l) => `<div class="info-row">${esc(l)}</div>`).join("")}
      <div class="info-row">${esc(customer.phone)}</div>
      <div class="info-row">${esc(customer.email)}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr></thead>
    <tbody>
      ${itemRows.length > 0 ? itemRows : `<tr><td colspan="4" class="muted">No line items.</td></tr>`}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${fmt$(invoice.subtotal)}</span></div>
    ${invoice.discountAmount > 0 ? `<div class="totals-row"><span>Discount</span><span>-${fmt$(invoice.discountAmount)}</span></div>` : ""}
    ${invoice.travelFee > 0 ? `<div class="totals-row"><span>Travel Fee</span><span>${fmt$(invoice.travelFee)}</span></div>` : ""}
    ${invoice.rushFee > 0 ? `<div class="totals-row"><span>Rush Fee</span><span>${fmt$(invoice.rushFee)}</span></div>` : ""}
    ${invoice.taxAmount > 0 ? `<div class="totals-row"><span>Tax (${(invoice.taxRate * 100).toFixed(2)}%)</span><span>${fmt$(invoice.taxAmount)}</span></div>` : ""}
    <div class="totals-row grand"><span>Total</span><span>${fmt$(invoice.total)}</span></div>
    ${invoice.amountPaid > 0 ? `<div class="totals-row"><span>Amount Paid</span><span>-${fmt$(invoice.amountPaid)}</span></div>` : ""}
    ${balance > 0 ? `<div class="totals-row balance"><span>Balance Due</span><span>${fmt$(balance)}</span></div>` : ""}
  </div>

  ${invoice.notes ? `<div class="notes-block"><strong>Notes:</strong> ${esc(invoice.notes)}</div>` : ""}

  <div class="footer">
    ${esc(business.invoiceFooterNote)}
  </div>

</div></body></html>`;
}
