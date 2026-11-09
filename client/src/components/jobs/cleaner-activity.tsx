import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, MessageSquareWarning, Undo2 } from "lucide-react";
import { taskLabel } from "@shared/upkeep";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { clockTime, elapsed } from "@/lib/cleaner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Issue = { id: number; jobId: number; body: string; createdAt: string; createdByName: string; resolvedAt: string | null; resolvedBy: string | null; propertyName?: string; scheduledDate?: string };
type Activity = { startedAt: string | null; completedAt: string | null; issues: Issue[]; upkeep: { task: string; doneOn: string; createdBy: string }[] };
const when = (iso: string) => `${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}, ${clockTime(iso)}`;
const refresh = () => queryClient.invalidateQueries({ predicate: q => /job-issues|cleaner-activity|upkeep/.test(String(q.queryKey[0])) });

function useResolve() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, resolved }: { id: number; resolved: boolean }) => apiRequest("PATCH", `/api/job-issues/${id}`, { resolved }),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });
}

/** On the office job page: when the cleaner started and finished, their messages, and deep-cleaning ticked. */
export function CleanerActivity({ jobId }: { jobId: number }) {
  const { data } = useQuery<Activity>({ queryKey: [`/api/jobs/${jobId}/cleaner-activity`], staleTime: 30_000, refetchOnWindowFocus: true });
  const resolve = useResolve();
  if (!data || (!data.startedAt && !data.issues.length && !data.upkeep.length)) return null;
  const open = data.issues.filter(i => !i.resolvedAt).length;
  return <Card className={open ? "border-status-partial/50" : undefined} data-testid="card-cleaner-activity">
    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MessageSquareWarning className="h-4 w-4 text-muted-foreground" />From the cleaner{open ? ` · ${open} open` : ""}</CardTitle></CardHeader>
    <CardContent className="space-y-3 text-sm">
      {data.startedAt && <p>Started {when(data.startedAt)}{data.completedAt && ` · finished ${clockTime(data.completedAt)} · ${elapsed(data.startedAt, data.completedAt)} on site`}</p>}
      {data.issues.map(i => <div key={i.id} className={`rounded-md border p-3 ${i.resolvedAt ? "opacity-70" : ""}`}>
        <p className="whitespace-pre-wrap">{i.body}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{i.createdByName} · {when(i.createdAt)}{i.resolvedAt && ` · handled by ${i.resolvedBy}`}</span>
          {i.resolvedAt
            ? <Button size="sm" variant="ghost" className="h-8 gap-1" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: i.id, resolved: false })}><Undo2 className="h-3.5 w-3.5" />Reopen</Button>
            : <Button size="sm" variant="outline" className="h-8 gap-1" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: i.id, resolved: true })}><CheckCircle2 className="h-3.5 w-3.5" />Mark handled</Button>}
        </div>
      </div>)}
      {data.upkeep.length > 0 && <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deep cleaning ticked on this job</p>
        <ul className="mt-1 list-disc pl-5">{data.upkeep.map((u, n) => <li key={n}>{taskLabel(u.task)} <span className="text-muted-foreground">· {formatDate(u.doneOn)}</span></li>)}</ul>
      </div>}
    </CardContent>
  </Card>;
}

/** On the dashboard: open messages from cleaners. Hidden when there are none. */
export function CleanerMessagesCard() {
  const { data = [] } = useQuery<Issue[]>({ queryKey: ["/api/job-issues"], staleTime: 60_000, refetchOnWindowFocus: true, refetchInterval: 5 * 60_000 });
  const resolve = useResolve();
  if (!data.length) return null;
  return <Card className="border-status-partial/50" data-testid="card-cleaner-messages">
    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MessageSquareWarning className="h-4 w-4 text-status-partial" />Messages from cleaners · {data.length}</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-sm">
      {data.slice(0, 8).map(i => <div key={i.id} className="flex flex-wrap items-start gap-3 rounded-md border p-3">
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${i.jobId}`} className="font-medium hover:underline">{i.propertyName}{i.scheduledDate && ` · ${formatDate(i.scheduledDate)}`}</Link>
          <p className="whitespace-pre-wrap line-clamp-3">{i.body}</p>
          <p className="text-xs text-muted-foreground">{i.createdByName} · {when(i.createdAt)}</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: i.id, resolved: true })}><CheckCircle2 className="h-3.5 w-3.5" />Handled</Button>
      </div>)}
      {data.length > 8 && <p className="text-xs text-muted-foreground">And {data.length - 8} more. Open each job to see them.</p>}
    </CardContent>
  </Card>;
}
