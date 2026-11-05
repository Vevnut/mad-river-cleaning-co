import type { QuoteSection } from "@/lib/quote-services";
import { formatDate } from "@/lib/format";

/**
 * A live look at the quote while it's being built, in the PDF's navy and green. Fixed light
 * colors on purpose: this shows the printed page, so it doesn't follow the app's dark mode.
 */
export function QuotePreview({ business, customerName, attention, address, property, houseSpecs, issueDate, validUntil, sections, notes }: {
  business?: any; customerName: string; attention: string; address: string[]; property: string[]; houseSpecs: string; issueDate: string; validUntil: string; sections: QuoteSection[]; notes: string;
}) {
  const navy = "#1f3a5a", dark = "#162b44", green = "#2e5b3f", tint = "#eaf2ec", panel = "#f6f8fa", ink = "#1f2933", muted = "#64748b";
  const label = "text-[9px] font-bold tracking-wider";
  return <div className="rounded-md border overflow-hidden shadow-sm" style={{ background: "#ffffff", color: ink }} data-testid="quote-preview">
    <div className="flex items-center gap-3 px-4 py-3" style={{ background: `linear-gradient(100deg, ${dark}, ${navy} 62%, ${green})`, borderBottom: `3px solid ${green}` }}>
      <img src="favicon-192.png" alt="" className="h-11 w-11 rounded-full bg-white p-0.5" />
      <div className="min-w-0 flex-1 text-white"><p className="text-sm font-bold truncate">{business?.businessName || "Mad River Cleaning Co."}</p><p className="text-[10px] truncate" style={{ color: "#dfe7ef" }}>{[business?.businessPhone, business?.businessEmail].filter(Boolean).join(" · ")}</p></div>
      <p className="text-[10px] font-bold tracking-widest" style={{ color: "#c9d6e3" }}>QUOTE</p>
    </div>
    <div className="p-4 space-y-3 text-[11px] leading-snug">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded p-2" style={{ background: panel, borderLeft: `3px solid ${green}` }}><p className={label} style={{ color: green }}>PREPARED FOR</p><p className="font-bold text-xs" style={{ color: dark }}>{customerName || "Choose a customer"}</p>{attention && <p>Attention: {attention}</p>}{address.map((l, i) => <p key={i}>{l}</p>)}</div>
        <div className="rounded p-2" style={{ background: panel, borderLeft: `3px solid ${navy}` }}><p className={label} style={{ color: navy }}>VALID UNTIL</p><p className="font-bold text-xs" style={{ color: dark }}>{validUntil ? formatDate(validUntil) : ""}</p><p style={{ color: muted }}>Quoted {issueDate ? formatDate(issueDate) : ""}</p>{property.map((l, i) => <p key={i}>{l}</p>)}</div>
      </div>
      {houseSpecs && <div className="rounded p-2" style={{ background: tint }}><p className={label} style={{ color: green }}>HOUSE SPECS</p><p>{houseSpecs}</p></div>}
      <div className="flex justify-between rounded px-2 py-1.5 text-white" style={{ background: navy }}><span className={label}>DESCRIPTION</span><span className={label}>AMOUNT</span></div>
      {sections.map((s, i) => <div key={s.key ?? i} className="space-y-1 pb-2" style={{ borderBottom: i < sections.length - 1 ? "1px solid #e6ebef" : undefined }}>
        <div className="flex justify-between gap-3 font-bold text-xs" style={{ color: dark }}><span>{s.title || "New service"}</span>{s.price && <span className="whitespace-nowrap" style={{ color: green }}>{s.price}</span>}</div>
        <ul className="space-y-0.5">{s.lines.filter(l => l.label || l.text || l.price).map((l, n) => <li key={l.key ?? n} className="flex justify-between gap-3"><span className="min-w-0"><span style={{ color: green }}>• </span>{l.label && <b style={{ color: dark }}>{l.label} </b>}{l.text}</span>{l.price && <b className="whitespace-nowrap">{l.price}</b>}</li>)}</ul>
      </div>)}
      {!sections.length && <p style={{ color: muted }}>Switch on a service to see it here.</p>}
      {notes && <div className="rounded p-2 whitespace-pre-wrap" style={{ background: tint }}><p className={label} style={{ color: green }}>NOTES</p>{notes}</div>}
      <div className="flex justify-between gap-3 pt-2 font-bold" style={{ borderTop: `2px solid ${green}`, color: dark }}><span>Thank you for your business.</span><span className="font-normal" style={{ color: muted }}>{business?.businessPhone}</span></div>
    </div>
  </div>;
}
