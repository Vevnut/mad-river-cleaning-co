// ─── Server-rendered printable Invoice HTML ───────────────────────────────
// Used for the in-app preview, the customer's public invoice page and printing/PDF.
// Mad River brand: navy (logo ring) and forest green (logo pines).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const NAVY = "#1f3a5a";
const NAVY_DARK = "#162b44";
const GREEN = "#2e5b3f";
const GREEN_TINT = "#eaf2ec";

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function fmt$(n: number | null | undefined): string {
  return money.format(n ?? 0);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return esc(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Net 15", or "Due on receipt" when the due date is the issue date. */
function terms(issue: string, due: string): string {
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${issue}T12:00:00Z`)) / 86400000);
  if (!Number.isFinite(days)) return "";
  return days <= 0 ? "Due on receipt" : `Net ${days}`;
}

// The round brand mark, embedded so the logo shows everywhere the invoice does (preview,
// public link, saved PDF) without depending on where static files are served. The full
// logo.png is ~900 KB; the 192px icon is the same mark at a fraction of the size.
let logo: string | null | undefined;
export function invoiceLogo(): string | null {
  if (logo !== undefined) return logo;
  // Production build (CommonJS) serves dist/public next to the bundle; dev and tests run from the repo.
  const built = typeof __dirname === "string" ? [resolve(__dirname, "public/favicon-192.png")] : [];
  const file = [...built, resolve("client/public/favicon-192.png")].find(existsSync);
  logo = file ? `data:image/png;base64,${readFileSync(file).toString("base64")}` : null;
  return logo;
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
  descriptionSnapshot?: string | null;
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
  viewed: "Sent",
  paid: "Paid in full",
  partial: "Partially paid",
  overdue: "Overdue",
  canceled: "Void",
};

function statusPill(status: string): string {
  switch (status) {
    case "paid": return "background:#d9efe0;color:#1d5a35;";
    case "partial": return "background:#fbefd6;color:#80540a;";
    case "overdue": return "background:#fbe1e5;color:#a3122f;";
    case "canceled": return "background:#e6e8eb;color:#555;";
    default: return "background:rgba(255,255,255,.16);color:#fff;";
  }
}

export function renderInvoicePrintHtml(opts: {
  invoice: PrintInvoice;
  customer: PrintCustomer;
  items: PrintItem[];
  business: PrintBusiness;
  /** Where the cleaning was done (name and address lines), when different from billing. */
  serviceProperty?: string | null;
}): string {
  const { invoice, customer, items, business } = opts;
  const balance = Math.round((invoice.total - invoice.amountPaid) * 100) / 100;
  const logoSrc = invoiceLogo();
  const billTo = customer.companyName?.trim() || customer.name;
  // Show the contact name under the company only when it's a different name.
  const contact = customer.companyName && customer.name.trim().toLowerCase() !== customer.companyName.trim().toLowerCase() ? customer.name : "";
  const cityLine = [customer.billingCity, [customer.billingState, customer.billingZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const billingLines = [customer.billingAddressLine1, customer.billingAddressLine2, cityLine].filter(Boolean);
  const serviceLines = (opts.serviceProperty || "").split("\n").map(s => s.trim()).filter(Boolean);
  const termsText = terms(invoice.issueDate, invoice.dueDate);
  const status = invoice.status;
  const settled = status === "paid" || (balance <= 0 && invoice.total > 0);

  const itemRows = items
    .map(
      (it) => `<tr>
        <td><div class="item">${esc(it.description)}</div>${it.descriptionSnapshot ? `<div class="muted">${esc(it.descriptionSnapshot)}</div>` : ""}</td>
        <td class="right">${esc(String(it.quantity))}</td>
        <td class="right">${fmt$(it.unitPrice)}</td>
        <td class="right strong">${fmt$(it.amount)}</td>
      </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(invoice.invoiceNumber)} — ${esc(business.businessName)}</title>
<style>
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; color: #1f2933; margin: 0; background: #fff; font-size: 13px; line-height: 1.45; }
  .page { max-width: 820px; margin: 0 auto; }
  .band { background: linear-gradient(120deg, ${NAVY_DARK} 0%, ${NAVY} 62%, ${GREEN} 100%); color: #fff; padding: 28px 40px; display: flex; justify-content: space-between; align-items: center; gap: 24px; }
  .brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .logo { width: 72px; height: 72px; border-radius: 50%; background: #fff; padding: 3px; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(255,255,255,.25); }
  .brand-name { font-size: 22px; font-weight: 700; letter-spacing: .01em; }
  .brand-sub { font-size: 12px; opacity: .85; margin-top: 2px; }
  .doc { text-align: right; flex-shrink: 0; }
  .doc-label { font-size: 12px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; opacity: .8; }
  .doc-num { font-size: 22px; font-weight: 700; margin-top: 2px; }
  .pill { display: inline-block; margin-top: 8px; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .accent { height: 5px; background: ${GREEN}; }
  .body { padding: 28px 40px 36px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr) 1.3fr; border: 1px solid #dfe5ea; border-radius: 10px; overflow: hidden; }
  .meta > div { padding: 12px 16px; border-right: 1px solid #dfe5ea; }
  .meta > div:last-child { border-right: 0; background: ${GREEN_TINT}; }
  .meta .k { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
  .meta .v { font-size: 14px; font-weight: 600; margin-top: 2px; color: ${NAVY_DARK}; }
  .meta .due .k { color: ${GREEN}; }
  .meta .due .v { font-size: 22px; color: ${GREEN}; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
  .party { border-left: 4px solid ${GREEN}; background: #f6f8fa; border-radius: 0 8px 8px 0; padding: 12px 16px; }
  .party.service { border-left-color: ${NAVY}; }
  .label { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${GREEN}; margin-bottom: 6px; }
  .party.service .label { color: ${NAVY}; }
  .party .name { font-size: 14px; font-weight: 700; color: ${NAVY_DARK}; }
  .party div { margin-top: 1px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 26px; }
  thead tr { background: ${NAVY}; }
  thead th { background: ${NAVY}; box-shadow: 1px 0 0 ${NAVY}; color: #fff; text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: 10px 12px; }
  thead th:first-child { border-radius: 8px 0 0 0; } thead th:last-child { border-radius: 0 8px 0 0; }
  tbody td { padding: 11px 12px; border-bottom: 1px solid #e6ebef; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafb; }
  .item { font-weight: 600; color: ${NAVY_DARK}; }
  td.right, th.right { text-align: right; white-space: nowrap; }
  .strong { font-weight: 600; }
  .muted { color: #6b7785; font-size: 11.5px; margin-top: 2px; }
  .summary { display: flex; justify-content: space-between; gap: 28px; margin-top: 22px; align-items: flex-start; }
  .notes { flex: 1; font-size: 12.5px; color: #34404c; background: ${GREEN_TINT}; border-radius: 8px; padding: 12px 16px; white-space: pre-wrap; }
  .notes .label { margin-bottom: 4px; }
  .totals { width: 300px; margin-left: auto; flex-shrink: 0; }
  .row { display: flex; justify-content: space-between; padding: 6px 12px; }
  .row.total { background: ${NAVY}; color: #fff; font-weight: 700; font-size: 16px; border-radius: 8px; margin-top: 6px; padding: 10px 12px; }
  .row.paid { color: ${GREEN}; }
  .row.balance { background: ${GREEN}; color: #fff; font-weight: 700; font-size: 15px; border-radius: 8px; margin-top: 6px; padding: 10px 12px; }
  .footer { margin-top: 36px; padding-top: 16px; border-top: 2px solid ${GREEN}; display: flex; justify-content: space-between; gap: 16px; font-size: 11.5px; color: #5b6774; }
  .footer .thanks { color: ${NAVY_DARK}; font-weight: 600; }
  @media (max-width: 600px) {
    .band, .body { padding-left: 16px; padding-right: 16px; }
    .band { flex-direction: column; align-items: flex-start; }
    .doc { text-align: left; }
    .logo { width: 56px; height: 56px; }
    .meta { grid-template-columns: 1fr 1fr; }
    .meta > div:nth-child(2) { border-right: 0; }
    .meta > div:nth-child(-n+2) { border-bottom: 1px solid #dfe5ea; }
    .parties { grid-template-columns: 1fr; }
    .summary { flex-direction: column; align-items: stretch; }
    .totals { width: 100%; }
    .footer { flex-direction: column; }
  }
  @media print { .page { max-width: none; } thead { display: table-header-group; } tr, .party, .notes, .totals { break-inside: avoid; } }
</style>
</head>
<body><div class="page">

  <div class="band">
    <div class="brand">
      ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="">` : ""}
      <div>
        <div class="brand-name">${esc(business.businessName)}</div>
        ${business.businessAddress ? `<div class="brand-sub">${esc(business.businessAddress)}</div>` : ""}
        <div class="brand-sub">${[business.businessPhone, business.businessEmail].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ")}</div>
      </div>
    </div>
    <div class="doc">
      <div class="doc-label">Invoice</div>
      <div class="doc-num">${esc(invoice.invoiceNumber)}</div>
      <span class="pill" style="${statusPill(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>
    </div>
  </div>
  <div class="accent"></div>

  <div class="body">
    <div class="meta">
      <div><div class="k">Issued</div><div class="v">${fmtDate(invoice.issueDate)}</div></div>
      <div><div class="k">Due</div><div class="v">${fmtDate(invoice.dueDate)}</div></div>
      <div><div class="k">Terms</div><div class="v">${esc(termsText) || "—"}</div></div>
      <div class="due"><div class="k">${settled ? "Paid in full" : "Amount due"}</div><div class="v">${fmt$(Math.max(balance, 0))}</div></div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="label">Bill to</div>
        <div class="name">${esc(billTo)}</div>
        ${contact ? `<div>${esc(contact)}</div>` : ""}
        ${billingLines.map((l) => `<div>${esc(l)}</div>`).join("")}
        ${customer.phone ? `<div>${esc(customer.phone)}</div>` : ""}
        ${customer.email ? `<div>${esc(customer.email)}</div>` : ""}
      </div>
      ${serviceLines.length ? `<div class="party service">
        <div class="label">Service property</div>
        <div class="name">${esc(serviceLines[0])}</div>
        ${serviceLines.slice(1).map((l) => `<div>${esc(l)}</div>`).join("")}
      </div>` : ""}
    </div>

    <table>
      <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${itemRows.length > 0 ? itemRows : `<tr><td colspan="4" class="muted">No line items.</td></tr>`}
      </tbody>
    </table>

    <div class="summary">
      ${invoice.notes ? `<div class="notes"><div class="label">Notes</div>${esc(invoice.notes)}</div>` : "<div></div>"}
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${fmt$(invoice.subtotal)}</span></div>
        ${invoice.discountAmount > 0 ? `<div class="row"><span>Discount</span><span>−${fmt$(invoice.discountAmount)}</span></div>` : ""}
        ${invoice.travelFee > 0 ? `<div class="row"><span>Travel fee</span><span>${fmt$(invoice.travelFee)}</span></div>` : ""}
        ${invoice.rushFee > 0 ? `<div class="row"><span>Rush fee</span><span>${fmt$(invoice.rushFee)}</span></div>` : ""}
        ${invoice.taxAmount > 0 ? `<div class="row"><span>Tax</span><span>${fmt$(invoice.taxAmount)}</span></div>` : ""}
        <div class="row total"><span>Total</span><span>${fmt$(invoice.total)}</span></div>
        ${invoice.amountPaid > 0 ? `<div class="row paid"><span>Paid</span><span>−${fmt$(invoice.amountPaid)}</span></div>` : ""}
        ${balance > 0 && invoice.amountPaid > 0 ? `<div class="row balance"><span>Balance due</span><span>${fmt$(balance)}</span></div>` : ""}
      </div>
    </div>

    <div class="footer">
      <div class="thanks">${esc(business.invoiceFooterNote)}</div>
      <div>${esc(business.businessName)}${business.businessPhone ? ` · ${esc(business.businessPhone)}` : ""}</div>
    </div>
  </div>

</div></body></html>`;
}
