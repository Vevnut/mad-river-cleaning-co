import type { QuoteSection } from "@/lib/quote-services";

/** A quote's rate sheet, shared by the owner's page and the customer's link. */
export function QuoteSections({ houseSpecs, sections }: { houseSpecs?: string; sections: QuoteSection[] }) {
  return <div className="space-y-5">
    {houseSpecs && <div className="rounded-md bg-muted/40 p-3 text-sm"><p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">House specs</p>{houseSpecs}</div>}
    {sections.map((s, i) => <section key={i} className="space-y-2 border-b pb-4 last:border-b-0" data-testid={`rate-section-${i}`}>
      <div className="flex justify-between gap-4"><h3 className="text-sm font-semibold">{s.title}</h3>{s.price && <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{s.price}</span>}</div>
      <ul className="space-y-1.5">{s.lines.map((l, n) => <li key={n} className="flex justify-between gap-4 text-sm"><span className="min-w-0">{l.label && <span className="font-medium">{l.label} </span>}<span className="text-muted-foreground">{l.text}</span></span>{l.price && <span className="tabular-nums whitespace-nowrap">{l.price}</span>}</li>)}</ul>
    </section>)}
  </div>;
}
