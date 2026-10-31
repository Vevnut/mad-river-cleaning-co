// ─── Downloadable invoice PDF ──────────────────────────────────────────────
// A real PDF file (selectable text, Letter size) in the same navy / forest green design as
// the printable HTML invoice, so it can be saved and attached to an email or text.
import PDFDocument from "pdfkit";
import { invoiceLogo, type PrintBusiness, type PrintCustomer, type PrintInvoice, type PrintItem } from "./invoice-print-template";

const NAVY = "#1f3a5a", NAVY_DARK = "#162b44", GREEN = "#2e5b3f", GREEN_TINT = "#eaf2ec";
const INK = "#1f2933", MUTED = "#64748b", LINE = "#dfe5ea", PANEL = "#f6f8fa";
const PAGE_W = 612, PAGE_H = 792, M = 40, W = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - 56;

const money = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function date(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function terms(issue: string, due: string) {
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${issue}T12:00:00Z`)) / 86400000);
  return !Number.isFinite(days) ? "—" : days <= 0 ? "Due on receipt" : `Net ${days}`;
}
const STATUS: Record<string, [string, string, string]> = { // label, background, text
  paid: ["PAID IN FULL", "#d9efe0", "#1d5a35"], partial: ["PARTIALLY PAID", "#fbefd6", "#80540a"],
  overdue: ["OVERDUE", "#fbe1e5", "#a3122f"], canceled: ["VOID", "#e6e8eb", "#555555"],
  draft: ["DRAFT", "#3a5574", "#ffffff"], sent: ["SENT", "#3a5574", "#ffffff"], viewed: ["SENT", "#3a5574", "#ffffff"],
};

/** "Mad River Cleaning Co. - Invoice INV-2026-00165 - North Peak Stays.pdf", safe on every OS. */
export function invoicePdfFilename(inv: PrintInvoice, customer: PrintCustomer, business: PrintBusiness) {
  const clean = (s: string | null | undefined) => String(s ?? "").replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const who = clean(customer.companyName) || clean(customer.name);
  const name = [clean(business.businessName), `Invoice ${clean(inv.invoiceNumber)}`, who].filter(Boolean).join(" - ");
  const short = Array.from(name.toWellFormed?.() ?? name).slice(0, 150).join("").trim();
  return `${short || "Invoice"}.pdf`;
}

/** Content-Disposition with a plain-ASCII fallback plus the exact UTF-8 name. */
export function pdfDisposition(filename: string, inline = false) {
  const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\%]/g, "") || "Invoice.pdf";
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename.toWellFormed?.() ?? filename).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

export function renderInvoicePdf(opts: {
  invoice: PrintInvoice; customer: PrintCustomer; items: PrintItem[]; business: PrintBusiness; serviceProperty?: string | null;
}): Promise<Buffer> {
  const { invoice: inv, customer, items, business } = opts;
  const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: true, bufferPages: true,
    info: { Title: `Invoice ${inv.invoiceNumber}`, Author: business.businessName, Subject: `Invoice ${inv.invoiceNumber} for ${customer.companyName || customer.name}` } });
  const chunks: Buffer[] = [];
  doc.on("data", c => chunks.push(c));
  const done = new Promise<Buffer>((ok, bad) => { doc.on("end", () => ok(Buffer.concat(chunks))); doc.on("error", bad); });

  const balance = Math.round((inv.total - inv.amountPaid) * 100) / 100;
  const settled = inv.status === "paid" || (balance <= 0 && inv.total > 0);
  const text = (s: string, x: number, y: number, o: PDFKit.Mixins.TextOptions & { size?: number; bold?: boolean; color?: string } = {}) => {
    const { size = 10, bold = false, color = INK, ...rest } = o;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color).text(s, x, y, { lineBreak: rest.width ? true : false, ...rest });
  };
  const measure = (s: string, width: number, size = 10, bold = false) =>
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).heightOfString(s, { width });

  // Header band: navy fading to forest green, round logo, company, invoice number and status.
  const bandH = 116;
  const grad = doc.linearGradient(0, 0, PAGE_W, bandH);
  grad.stop(0, NAVY_DARK).stop(0.62, NAVY).stop(1, GREEN);
  doc.rect(0, 0, PAGE_W, bandH).fill(grad);
  doc.rect(0, bandH, PAGE_W, 5).fill(GREEN);
  const logo = invoiceLogo();
  let nameX = M;
  if (logo) {
    const cx = M + 34, cy = bandH / 2, r = 34;
    doc.circle(cx, cy, r + 3).fillOpacity(0.25).fill("#ffffff").fillOpacity(1);
    doc.circle(cx, cy, r).fill("#ffffff");
    doc.save(); doc.circle(cx, cy, r - 2).clip();
    doc.image(Buffer.from(logo.split(",")[1], "base64"), cx - r + 2, cy - r + 2, { width: 2 * r - 4, height: 2 * r - 4 });
    doc.restore();
    nameX = M + 84;
  }
  const rightW = 170, nameW = PAGE_W - M - rightW - nameX - 12;
  let hy = 34;
  text(business.businessName || "", nameX, hy, { size: 18, bold: true, color: "#ffffff", width: nameW, height: 24, ellipsis: true });
  hy += 26;
  if (business.businessAddress) { text(business.businessAddress, nameX, hy, { size: 9.5, color: "#dfe7ef", width: nameW, height: 13, ellipsis: true }); hy += 14; }
  const contact = [business.businessPhone, business.businessEmail].filter(Boolean).join("   ·   ");
  if (contact) text(contact, nameX, hy, { size: 9.5, color: "#dfe7ef", width: nameW, height: 13, ellipsis: true });
  const rx = PAGE_W - M - rightW;
  text("INVOICE", rx, 30, { size: 9.5, bold: true, color: "#c9d6e3", width: rightW, align: "right", characterSpacing: 3 });
  text(inv.invoiceNumber, rx, 44, { size: 17, bold: true, color: "#ffffff", width: rightW, align: "right" });
  const [label, pillBg, pillInk] = STATUS[inv.status] ?? [String(inv.status).toUpperCase(), "#3a5574", "#ffffff"];
  doc.font("Helvetica-Bold").fontSize(8.5);
  const pillW = doc.widthOfString(label, { characterSpacing: 0.6 }) + 22;
  doc.roundedRect(PAGE_W - M - pillW, 70, pillW, 18, 9).fill(pillBg);
  text(label, PAGE_W - M - pillW, 75, { size: 8.5, bold: true, color: pillInk, width: pillW, align: "center", characterSpacing: 0.6 });

  // Issued / Due / Terms / Amount due.
  let y = bandH + 5 + 24;
  const metaH = 50, cols = [1, 1, 1, 1.3], unit = W / cols.reduce((a, b) => a + b, 0);
  const cells: [string, string][] = [["ISSUED", date(inv.issueDate)], ["DUE", date(inv.dueDate)], ["TERMS", terms(inv.issueDate, inv.dueDate)],
    [settled ? "PAID IN FULL" : "AMOUNT DUE", money(Math.max(balance, 0))]];
  let cx = M;
  cells.forEach(([k, v], i) => {
    const cw = cols[i] * unit, last = i === cells.length - 1;
    if (last) { doc.save(); doc.roundedRect(M, y, W, metaH, 8).clip(); doc.rect(cx, y, cw, metaH).fill(GREEN_TINT); doc.restore(); }
    text(k, cx + 12, y + 10, { size: 7.5, bold: true, color: last ? GREEN : MUTED, characterSpacing: 0.6 });
    text(v, cx + 12, y + (last ? 21 : 24), { size: last ? 16 : 11, bold: true, color: last ? GREEN : NAVY_DARK, width: cw - 20, height: 20, ellipsis: true });
    if (!last) doc.moveTo(cx + cw, y).lineTo(cx + cw, y + metaH).lineWidth(0.8).stroke(LINE);
    cx += cw;
  });
  doc.roundedRect(M, y, W, metaH, 8).lineWidth(0.8).stroke(LINE);
  y += metaH + 18;

  // Bill to / Service property.
  const billTo = customer.companyName?.trim() || customer.name;
  const contactName = customer.companyName && customer.name.trim().toLowerCase() !== customer.companyName.trim().toLowerCase() ? customer.name : "";
  const cityLine = [customer.billingCity, [customer.billingState, customer.billingZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const billLines = [contactName, customer.billingAddressLine1, customer.billingAddressLine2, cityLine, customer.phone, customer.email].filter(Boolean) as string[];
  const svc = (opts.serviceProperty || "").split("\n").map(s => s.trim()).filter(Boolean);
  const partyW = svc.length ? (W - 14) / 2 : W, innerW = partyW - 30;
  const partyHeight = (title: string, lines: string[]) => 30 + measure(title, innerW, 11, true) + lines.reduce((h, l) => h + measure(l, innerW, 9.5) + 1.5, 0) + 12;
  const ph = Math.max(partyHeight(billTo, billLines), svc.length ? partyHeight(svc[0], svc.slice(1)) : 0);
  const party = (x: number, accent: string, heading: string, title: string, lines: string[]) => {
    doc.roundedRect(x, y, partyW, ph, 6).fill(PANEL);
    doc.rect(x, y, 3.5, ph).fill(accent);
    text(heading, x + 16, y + 12, { size: 7.5, bold: true, color: accent, characterSpacing: 0.8 });
    text(title, x + 16, y + 27, { size: 11, bold: true, color: NAVY_DARK, width: innerW });
    let ly = y + 27 + measure(title, innerW, 11, true) + 3;
    for (const l of lines) { text(l, x + 16, ly, { size: 9.5, width: innerW }); ly += measure(l, innerW, 9.5) + 1.5; }
  };
  party(M, GREEN, "BILL TO", billTo, billLines);
  if (svc.length) party(M + partyW + 14, NAVY, "SERVICE PROPERTY", svc[0], svc.slice(1));
  y += ph + 20;

  // Line items, continuing on new pages with the header repeated.
  const cw4 = [W - 230, 50, 85, 95], descW = cw4[0] - 24;
  const header = () => {
    doc.roundedRect(M, y, W, 24, 6).fill(NAVY);
    doc.rect(M, y + 12, W, 12).fill(NAVY);
    let x = M;
    ["DESCRIPTION", "QTY", "RATE", "AMOUNT"].forEach((h, i) => {
      text(h, x + 12, y + 8.5, { size: 7.5, bold: true, color: "#ffffff", width: cw4[i] - 24, align: i ? "right" : "left", characterSpacing: 0.6 });
      x += cw4[i];
    });
    y += 24;
  };
  const newPage = () => { doc.addPage({ size: "LETTER", margin: 0 }); y = M; };
  header();
  if (!items.length) { text("No line items.", M + 12, y + 10, { size: 9.5, color: MUTED }); y += 32; }
  items.forEach((it, i) => {
    const sub = it.descriptionSnapshot || "";
    const rowH = 20 + measure(it.description, descW, 10, true) + (sub ? measure(sub, descW, 8.5) + 2 : 0);
    if (y + rowH > BOTTOM) { newPage(); header(); }
    if (i % 2 === 1) doc.rect(M, y, W, rowH).fill("#f8fafb");
    text(it.description, M + 12, y + 10, { size: 10, bold: true, color: NAVY_DARK, width: descW });
    if (sub) text(sub, M + 12, y + 12 + measure(it.description, descW, 10, true), { size: 8.5, color: "#6b7785", width: descW });
    let x = M + cw4[0];
    [String(it.quantity), money(it.unitPrice), money(it.amount)].forEach((v, j) => {
      text(v, x + 12, y + 10, { size: 10, bold: j === 2, width: cw4[j + 1] - 24, align: "right" });
      x += cw4[j + 1];
    });
    y += rowH;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).stroke("#e6ebef");
  });
  y += 18;

  // Notes and totals.
  const totW = 220, tx = M + W - totW;
  const rows: { k: string; v: string; kind?: "total" | "paid" | "balance" }[] = [{ k: "Subtotal", v: money(inv.subtotal) }];
  if (inv.discountAmount > 0) rows.push({ k: "Discount", v: `-${money(inv.discountAmount)}` });
  if (inv.travelFee > 0) rows.push({ k: "Travel fee", v: money(inv.travelFee) });
  if (inv.rushFee > 0) rows.push({ k: "Rush fee", v: money(inv.rushFee) });
  if (inv.taxAmount > 0) rows.push({ k: "Tax", v: money(inv.taxAmount) });
  rows.push({ k: "Total", v: money(inv.total), kind: "total" });
  if (inv.amountPaid > 0) rows.push({ k: "Paid", v: `-${money(inv.amountPaid)}`, kind: "paid" });
  if (balance > 0 && inv.amountPaid > 0) rows.push({ k: "Balance due", v: money(balance), kind: "balance" });
  const rowH = (r: typeof rows[number]) => (r.kind === "total" || r.kind === "balance" ? 32 : 20);
  const totalsH = rows.reduce((h, r) => h + rowH(r), 0);
  const notesW = W - totW - 24, notes = (inv.notes || "").trim();
  const notesH = notes ? 30 + measure(notes, notesW - 28, 9.5) : 0;
  if (y + Math.max(totalsH, Math.min(notesH, 200)) > BOTTOM) newPage();
  const top = y;
  if (notes) {
    doc.roundedRect(M, top, notesW, notesH, 6).fill(GREEN_TINT);
    text("NOTES", M + 14, top + 11, { size: 7.5, bold: true, color: GREEN, characterSpacing: 0.8 });
    text(notes, M + 14, top + 24, { size: 9.5, color: "#34404c", width: notesW - 28 });
  }
  let ty = top;
  for (const r of rows) {
    const h = rowH(r), big = r.kind === "total" || r.kind === "balance";
    if (big) doc.roundedRect(tx, ty + 3, totW, h - 4, 6).fill(r.kind === "total" ? NAVY : GREEN);
    const color = big ? "#ffffff" : r.kind === "paid" ? GREEN : INK, size = r.kind === "total" ? 13 : big ? 12 : 10;
    const ly = ty + (big ? (h - size) / 2 + 1 : 4);
    text(r.k, tx + 12, ly, { size, bold: big, color });
    text(r.v, tx + 12, ly, { size, bold: big, color, width: totW - 24, align: "right" });
    ty += h;
  }
  y = Math.max(ty, top + notesH) + 26;

  // Footer.
  if (y + 40 > PAGE_H - 20) newPage();
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1.6).stroke(GREEN);
  const right = [business.businessName, business.businessPhone].filter(Boolean).join(" · ");
  text(business.invoiceFooterNote || "", M, y + 12, { size: 9, bold: true, color: NAVY_DARK, width: W - 200 });
  text(right, M + W - 190, y + 12, { size: 9, color: "#5b6774", width: 190, align: "right" });

  // Page numbers when an invoice runs past one page.
  const range = doc.bufferedPageRange();
  if (range.count > 1) for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    text(`${inv.invoiceNumber}  ·  Page ${i + 1} of ${range.count}`, M, PAGE_H - 30, { size: 8, color: MUTED, width: W, align: "right" });
  }
  doc.end();
  return done;
}
