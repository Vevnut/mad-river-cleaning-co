import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Undo2, Waves } from "lucide-react";
import { DEEP_CLEAN_TASKS, HOT_TUB_DRAIN, UPKEEP_DUE_DAYS, daysBetween, taskLabel, upkeepState, type UpkeepState } from "@shared/upkeep";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { businessDate, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { FoldBody, FoldToggle, useFolded } from "@/components/fold";

type Entry = { id: number; task: string; doneOn: string; note: string; createdBy: string };
type Upkeep = { propertyId: number; hasHotTub: boolean; lastDone: Record<string, string>; history: Entry[] };

const STATE_STYLE: Record<UpkeepState, { label: string; className: string }> = {
  never: { label: "Not logged", className: "bg-muted text-muted-foreground border-transparent" },
  due: { label: "Due", className: "bg-status-overdue-bg text-status-overdue border-transparent" },
  soon: { label: "Due soon", className: "bg-status-partial-bg text-status-partial border-transparent" },
  ok: { label: "Done", className: "bg-status-completed-bg text-status-completed border-transparent" },
};
export function UpkeepBadge({ state }: { state: UpkeepState }) {
  const s = STATE_STYLE[state];
  return <Badge variant="outline" className={`whitespace-nowrap ${s.className}`}>{s.label}</Badge>;
}
export function lastDoneText(last: string | undefined, today: string) {
  if (!last) return "Never logged";
  const days = daysBetween(last, today);
  return `${formatDate(last)} · ${days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}`;
}
/** Invalidate everything that shows upkeep. */
export const refreshUpkeep = () => queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).includes("upkeep") });

export function UpkeepCard({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const folded = useFolded();
  const today = businessDate();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [doneOn, setDoneOn] = useState(today);
  const [drainedOn, setDrainedOn] = useState(today);
  const [showHistory, setShowHistory] = useState(false);
  const { data, isLoading } = useQuery<Upkeep>({ queryKey: [`/api/properties/${propertyId}/upkeep`] });
  const last = data?.lastDone ?? {};
  const states = useMemo(() => Object.fromEntries(DEEP_CLEAN_TASKS.map(t => [t.key, upkeepState(last[t.key], today)])), [last, today]);
  const dueKeys = DEEP_CLEAN_TASKS.filter(t => states[t.key] === "due" || states[t.key] === "never").map(t => t.key);
  const areas = Array.from(new Set(DEEP_CLEAN_TASKS.map(t => t.area)));

  const fail = (title: string) => (e: Error) => toast({ title, description: e.message, variant: "destructive" });
  const log = useMutation({
    mutationFn: async (body: { tasks: string[]; doneOn: string }) => apiRequest("POST", `/api/properties/${propertyId}/upkeep`, body),
    onSuccess: (_r, body) => {
      refreshUpkeep();
      if (body.tasks.includes(HOT_TUB_DRAIN.key)) toast({ title: "Hot tub drain logged", description: formatDate(body.doneOn) });
      else { toast({ title: `${body.tasks.length} task${body.tasks.length === 1 ? "" : "s"} marked done`, description: formatDate(body.doneOn) }); setPicked(new Set()); }
    },
    onError: fail("Couldn't save"),
  });
  const undo = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/upkeep-log/${id}`),
    onSuccess: () => refreshUpkeep(),
    onError: fail("Couldn't remove that entry"),
  });
  const hotTub = useMutation({
    mutationFn: async (hasHotTub: boolean) => apiRequest("PUT", `/api/properties/${propertyId}/hot-tub`, { hasHotTub }),
    onSuccess: () => refreshUpkeep(),
    onError: fail("Couldn't change the hot tub setting"),
  });

  const toggle = (key: string) => setPicked(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const futureDate = (d: string) => d > today;

  if (isLoading || !data) return <Card><CardContent className="pt-6"><Skeleton className="h-40 w-full" /></CardContent></Card>;
  const drainLast = last[HOT_TUB_DRAIN.key];

  return <Card data-testid="card-upkeep">
    <CardHeader className="pb-3">
      <CardTitle className="text-base flex items-center gap-2"><FoldToggle /><Sparkles className="h-4 w-4 text-muted-foreground" />Deep cleaning & hot tub
        {folded && <span className="text-sm font-normal text-muted-foreground">· {dueKeys.length} of {DEEP_CLEAN_TASKS.length} due{data.hasHotTub ? ` · hot tub ${upkeepState(drainLast, today) === "due" || !drainLast ? "drain due" : "ok"}` : ""}</span>}</CardTitle>
      {!folded && <p className="text-sm text-muted-foreground">Each task is due {UPKEEP_DUE_DAYS} days after it was last done.</p>}
    </CardHeader>
    <FoldBody><CardContent className="space-y-5 text-sm">
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium flex items-center gap-2"><Waves className="h-4 w-4 text-muted-foreground" />Hot tub</p>
          <label className="flex items-center gap-2 text-muted-foreground">This property has a hot tub
            <Switch checked={data.hasHotTub} disabled={hotTub.isPending} onCheckedChange={v => hotTub.mutate(v)} aria-label="This property has a hot tub" data-testid="switch-hot-tub" /></label>
        </div>
        {data.hasHotTub && <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground">Last full drain & refill</p>
            <p className="font-semibold flex flex-wrap items-center gap-2" data-testid="text-last-drain">{lastDoneText(drainLast, today)} <UpkeepBadge state={upkeepState(drainLast, today)} /></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-40" value={drainedOn} max={today} onChange={e => setDrainedOn(e.target.value)} aria-label="Date drained" />
            <Button size="sm" disabled={log.isPending || !drainedOn || futureDate(drainedOn)} onClick={() => log.mutate({ tasks: [HOT_TUB_DRAIN.key], doneOn: drainedOn })} data-testid="button-log-drain">Log drain & refill</Button>
          </div>
        </div>}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Deep cleaning tasks <span className="text-muted-foreground font-normal">· {dueKeys.length} of {DEEP_CLEAN_TASKS.length} due</span></p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicked(new Set(dueKeys))} disabled={!dueKeys.length}>Tick due</Button>
            <Button size="sm" variant="outline" onClick={() => setPicked(new Set(DEEP_CLEAN_TASKS.map(t => t.key)))}>Tick all</Button>
            {picked.size > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>}
          </div>
        </div>
        {areas.map(area => <div key={area} className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{area}</p>
          {DEEP_CLEAN_TASKS.filter(t => t.area === area).map(t => <label key={t.key} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover-elevate cursor-pointer" data-testid={`row-upkeep-${t.key}`}>
            <Checkbox checked={picked.has(t.key)} onCheckedChange={() => toggle(t.key)} aria-label={t.label} />
            <span className="min-w-0 flex-1">{t.label}<span className="block text-xs text-muted-foreground">{lastDoneText(last[t.key], today)}</span></span>
            <UpkeepBadge state={states[t.key]} />
          </label>)}
        </div>)}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-card pt-3">
          <span className="text-muted-foreground">Done on</span>
          <Input type="date" className="w-40" value={doneOn} max={today} onChange={e => setDoneOn(e.target.value)} aria-label="Date done" />
          <Button disabled={!picked.size || log.isPending || !doneOn || futureDate(doneOn)} onClick={() => log.mutate({ tasks: Array.from(picked), doneOn })} data-testid="button-log-tasks">
            Mark {picked.size || ""} done
          </Button>
        </div>
      </div>

      <div>
        <Button variant="ghost" size="sm" className="px-0" onClick={() => setShowHistory(v => !v)}>{showHistory ? "Hide history" : `Show history (${data.history.length})`}</Button>
        {showHistory && (data.history.length ? <ul className="mt-2 divide-y rounded-md border">
          {data.history.map(h => <li key={h.id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-28 shrink-0 tabular-nums">{formatDate(h.doneOn)}</span>
            <span className="min-w-0 flex-1">{taskLabel(h.task)}<span className="block text-xs text-muted-foreground truncate">{h.createdBy}</span></span>
            <Button size="icon" variant="ghost" aria-label={`Remove ${taskLabel(h.task)} on ${formatDate(h.doneOn)}`} disabled={undo.isPending} onClick={() => undo.mutate(h.id)}><Undo2 className="h-4 w-4" /></Button>
          </li>)}
        </ul> : <p className="mt-2 text-muted-foreground">Nothing logged yet.</p>)}
      </div>
    </CardContent></FoldBody>
  </Card>;
}
