/** Beds at a property, by type. Handy for linens, laundry and setup. */
export const BED_TYPES = [
  { key: "bedKing", label: "King", plural: "Kings" },
  { key: "bedQueen", label: "Queen", plural: "Queens" },
  { key: "bedFull", label: "Full", plural: "Fulls" },
  { key: "bedTwin", label: "Twin", plural: "Twins" },
  { key: "bedBunk", label: "Bunk bed", plural: "Bunk beds" },
  { key: "bedSofa", label: "Sofa bed", plural: "Sofa beds" },
] as const;
export type BedKey = (typeof BED_TYPES)[number]["key"];
type WithBeds = Partial<Record<BedKey, number | null>>;

export const totalBeds = (p: WithBeds) => BED_TYPES.reduce((n, t) => n + (Number(p[t.key]) || 0), 0);

/** e.g. "1 King, 2 Queens, 1 Bunk bed" — empty string when no beds are recorded. */
export function bedSummary(p: WithBeds): string {
  return BED_TYPES.filter(t => (Number(p[t.key]) || 0) > 0)
    .map(t => { const n = Number(p[t.key]); return `${n} ${n === 1 ? t.label : t.plural}`; }).join(", ");
}
