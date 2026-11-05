// Quotes are rate sheets. Prices are text ("$350.00", "$25/30 mins"), so these helpers turn the
// priced services on a quote into something that can be ticked and billed.
export type QuoteLine = { key?: string; label: string; text: string; price: string };
export type QuoteSection = { key?: string; title: string; price: string; lines: QuoteLine[] };
export type PricedService = { key: string; description: string; priceText: string; unitPrice: number };

/** The first dollar figure in a price, or 0 when there isn't one. */
export function parsePrice(price: string) {
  const m = /(\d[\d,]*(?:\.\d{1,2})?)/.exec(price || "");
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}
const heading = (title: string) => title.replace(/:\s*$/, "").replace(/\s+(service\s+)?includes$/i, "").trim();
const shortName = (l: QuoteLine) => (l.label || l.text).replace(/^[-*\s]+/, "").split(/[:(]/)[0].trim().slice(0, 90);

export function pricedServices(sections: QuoteSection[]): PricedService[] {
  return sections.flatMap((s, i) => [
    ...(s.price ? [{ key: `${i}`, description: heading(s.title), priceText: s.price, unitPrice: parsePrice(s.price) }] : []),
    ...s.lines.flatMap((l, n) => (l.price ? [{ key: `${i}.${n}`, description: `${heading(s.title)}: ${shortName(l)}`, priceText: l.price, unitPrice: parsePrice(l.price) }] : [])),
  ]);
}

/** "12 guests, 5 bedrooms, 8 beds, & 3 full bathrooms", leaving out anything not recorded. */
export function houseSpecs(p: any, beds: number) {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [p.maxOccupancy > 0 && plural(p.maxOccupancy, "guest"), p.bedrooms > 0 && plural(p.bedrooms, "bedroom"), beds > 0 && plural(beds, "bed"),
    p.fullBathrooms > 0 && `${p.fullBathrooms} full bathroom${p.fullBathrooms === 1 ? "" : "s"}`, p.halfBathrooms > 0 && `${p.halfBathrooms} half bathroom${p.halfBathrooms === 1 ? "" : "s"}`].filter(Boolean) as string[];
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, & ${parts[parts.length - 1]}` : parts.join("");
}
