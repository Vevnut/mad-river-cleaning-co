import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import { DEEP_CLEAN_TASKS, HOT_TUB_DRAIN, UPKEEP_DUE_DAYS, upkeepState } from "@shared/upkeep";
import { businessDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UpkeepBadge, lastDoneText } from "@/components/properties/upkeep-card";

type Row = { propertyId: number; name: string; hasHotTub: boolean; lastDone: Record<string, string> };

/** Every property's deep-cleaning and hot tub status, most overdue first. Click a row to log work. */
export default function UpkeepPage() {
  const [, navigate] = useLocation();
  const today = businessDate();
  const { data = [], isLoading } = useQuery<Row[]>({ queryKey: ["/api/upkeep"] });
  const rows = useMemo(() => data.map(p => {
    const due = DEEP_CLEAN_TASKS.filter(t => ["due", "never"].includes(upkeepState(p.lastDone[t.key], today))).length;
    const dates = DEEP_CLEAN_TASKS.map(t => p.lastDone[t.key]).filter(Boolean).sort();
    const drain = p.lastDone[HOT_TUB_DRAIN.key];
    const drainState = p.hasHotTub ? upkeepState(drain, today) : null;
    return { ...p, due, latest: dates[dates.length - 1], drain, drainState };
  }).sort((a, b) => (b.due + (b.drainState === "due" || b.drainState === "never" ? 1 : 0)) - (a.due + (a.drainState === "due" || a.drainState === "never" ? 1 : 0)) || a.name.localeCompare(b.name)), [data, today]);

  return <div className="p-4 md:p-6 space-y-4">
    <div>
      <h1 className="text-xl font-semibold" data-testid="text-page-title">Deep Cleaning</h1>
      <p className="text-sm text-muted-foreground">Deep-cleaning tasks and hot tub drains at each property. Each is due {UPKEEP_DUE_DAYS} days after it was last done. Open a property to log work.</p>
    </div>
    {isLoading ? <Skeleton className="h-40 w-full" /> : !rows.length ? <div className="rounded-md border border-dashed p-10 text-center space-y-2">
      <Sparkles className="h-6 w-6 mx-auto text-muted-foreground" /><p className="text-sm">No active properties yet.</p>
    </div> : <div className="rounded-md border overflow-x-auto"><Table className="min-w-[560px]">
      <TableHeader><TableRow><TableHead>Property</TableHead><TableHead>Deep cleaning</TableHead><TableHead>Last task done</TableHead><TableHead>Hot tub drain</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(r => <TableRow key={r.propertyId} className="cursor-pointer" onClick={() => navigate(`/properties/${r.propertyId}`)} data-testid={`row-upkeep-property-${r.propertyId}`}>
        <TableCell className="font-medium">{r.name}</TableCell>
        <TableCell className="whitespace-nowrap">{r.due ? <span className="flex items-center gap-2"><UpkeepBadge state={r.latest ? "due" : "never"} />{r.due} of {DEEP_CLEAN_TASKS.length} tasks</span> : <span className="flex items-center gap-2"><UpkeepBadge state="ok" />All up to date</span>}</TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">{r.latest ? lastDoneText(r.latest, today) : "Never logged"}</TableCell>
        <TableCell className="whitespace-nowrap">{r.drainState ? <span className="flex items-center gap-2"><UpkeepBadge state={r.drainState} /><span className="text-muted-foreground">{r.drain ? lastDoneText(r.drain, today) : ""}</span></span> : <span className="text-muted-foreground">No hot tub</span>}</TableCell>
      </TableRow>)}</TableBody>
    </Table></div>}
  </div>;
}
