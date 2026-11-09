import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import { type CleanerHistory, type CleanerMe, jobTypeLabel } from "@/lib/cleaner";

/** Finished jobs from before My jobs' two-week window, up to a year, and payments received. */
export default function CleanerHistoryPage() {
  const { data: me } = useQuery<CleanerMe>({ queryKey: ["/api/cleaner/me"] });
  const { data, isLoading } = useQuery<CleanerHistory>({ queryKey: ["/api/cleaner/history"], staleTime: 60_000 });
  const jobs = data?.jobs ?? [], payments = data?.payments ?? [];
  const isSub = me?.kind === "subcontractor";

  return <div className="mx-auto max-w-2xl space-y-5 p-4">
    <Link href="/"><Button variant="ghost" size="sm" className="-ml-2 gap-1"><ArrowLeft className="h-4 w-4" /> My jobs</Button></Link>
    <div>
      <h1 className="text-2xl font-semibold">History</h1>
      <p className="text-sm text-muted-foreground">Finished jobs older than two weeks, going back a year. Recent ones are on My jobs.</p>
    </div>

    {me?.pay && <Card data-testid="card-cleaner-history-pay"><CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
      <div><p className="text-xs text-muted-foreground">Earned, all time</p><p className="text-lg font-semibold">{formatMoney(me.pay.earned)}</p></div>
      <div><p className="text-xs text-muted-foreground">Paid to you</p><p className="text-lg font-semibold">{formatMoney(me.pay.paid)}</p></div>
      <div><p className="text-xs text-muted-foreground">Still owed</p><p className="text-lg font-semibold">{formatMoney(me.pay.owed)}</p></div>
    </CardContent></Card>}

    {isLoading ? <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div> : <>
      {isSub && <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payments received{payments.length > 0 && ` · ${payments.length}`}</h2>
        {payments.length ? <Card><CardContent className="divide-y p-0">{payments.map((p, i) => <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span>{formatDate(p.paidDate)}{p.method && <span className="capitalize text-muted-foreground"> · {p.method.replace(/_/g, " ")}</span>}</span>
          <span className="font-semibold tabular-nums">{formatMoney(p.amount)}</span>
        </div>)}</CardContent></Card> : <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
      </section>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Finished jobs{jobs.length > 0 && ` · ${jobs.length}`}</h2>
        {jobs.length ? <Card><CardContent className="divide-y p-0">{jobs.map(j => <div key={j.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-cleaner-history-${j.id}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{j.property.name}</p>
            <p className="text-xs text-muted-foreground">{formatDate(j.scheduledDate)} · {jobTypeLabel(j.jobType)}</p>
          </div>
          <StatusBadge status={j.status} />
          {j.pay != null && <span className="w-20 text-right font-semibold tabular-nums">{formatMoney(j.pay)}</span>}
        </div>)}</CardContent></Card> : <p className="text-sm text-muted-foreground">No finished jobs from before the last two weeks.</p>}
      </section>
    </>}
  </div>;
}
