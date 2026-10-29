import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, ChevronRight, Clock, ListChecks, MapPin, Navigation, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { InstallHint } from "@/components/install-hint";
import { formatMoney } from "@/lib/format";
import { type CleanerJobSummary, type CleanerMe, LIVE, formatDay, formatTime, jobTypeLabel, mapsUrl } from "@/lib/cleaner";

const open = (j: CleanerJobSummary) => j.status === "scheduled" || j.status === "in_progress";

function Progress({ job }: { job: CleanerJobSummary }) {
  if (!job.checklist.total) return null;
  const done = job.checklist.done === job.checklist.total;
  return (
    <span className="inline-flex items-center gap-1">
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
      {job.checklist.done}/{job.checklist.total} done
    </span>
  );
}

/** The one job to do next, big enough to read in a hurry, with directions one tap away. */
function NextUp({ job, today }: { job: CleanerJobSummary; today: string }) {
  return (
    <Card className="border-primary/40 shadow-sm" data-testid={`card-next-job-${job.id}`}>
      <CardContent className="space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Next up · {job.scheduledDate === today ? "Today" : formatDay(job.scheduledDate)}
        </p>
        <div>
          <p className="flex items-center gap-1.5 text-2xl font-semibold"><Clock className="h-5 w-5 text-muted-foreground" />{formatTime(job.scheduledTime)}</p>
          <p className="mt-1 text-lg font-semibold">{job.property.name}</p>
          <p className="text-sm text-muted-foreground">{job.property.addressLine1}, {job.property.city}</p>
          <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{jobTypeLabel(job.jobType)}</span><Progress job={job} />
            {job.pay != null && <span className="font-medium text-foreground">{formatMoney(job.pay)}</span>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="h-11 gap-1.5">
            <a href={mapsUrl(job.property)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Directions</a>
          </Button>
          <Button asChild className="h-11"><Link href={`/job/${job.id}`}>Open job</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function JobCard({ job }: { job: CleanerJobSummary }) {
  return (
    <Link href={`/job/${job.id}`}>
      <Card className="hover-elevate cursor-pointer active:scale-[0.99]" data-testid={`card-cleaner-job-${job.id}`}>
        <CardContent className="flex min-h-[4.5rem] items-center gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{formatDay(job.scheduledDate)}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(job.scheduledTime)}</span>
              <StatusBadge status={job.status} />
            </div>
            <p className="truncate text-base font-semibold">{job.property.name}</p>
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />{job.property.addressLine1}, {job.property.city}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{jobTypeLabel(job.jobType)}</span><Progress job={job} />
              {job.pay != null && <span className="font-medium text-foreground">{formatMoney(job.pay)}</span>}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

function Group({ title, jobs, empty }: { title: string; jobs: CleanerJobSummary[]; empty?: string }) {
  if (!jobs.length && !empty) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}{jobs.length > 0 && ` · ${jobs.length}`}</h2>
      {jobs.length ? jobs.map(j => <JobCard key={j.id} job={j} />) : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

export default function CleanerJobsPage() {
  const { data: me } = useQuery<CleanerMe>({ queryKey: ["/api/cleaner/me"], ...LIVE });
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<{ today: string; jobs: CleanerJobSummary[] }>({ queryKey: ["/api/cleaner/jobs"], ...LIVE });
  const jobs = data?.jobs ?? [], today = data?.today ?? "";
  const next = jobs.find(j => j.scheduledDate >= today && open(j));
  const todays = jobs.filter(j => j.scheduledDate === today && j.id !== next?.id);
  const later = jobs.filter(j => j.scheduledDate > today && j.id !== next?.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{me ? `Hi, ${me.name.split(" ")[0]}` : "My jobs"}</h1>
          {today && <p className="text-sm text-muted-foreground">{formatDay(today)}</p>}
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={() => refetch()} disabled={isFetching} data-testid="button-cleaner-refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Refresh"}
        </Button>
      </div>

      <InstallHint />

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <>
          {next ? <NextUp job={next} today={today} /> : (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">You're all caught up. New jobs show here as soon as the office assigns them.</CardContent></Card>
          )}
          <Group title="Also today" jobs={todays} />
          <Group title="Coming up" jobs={later} empty={next ? undefined : "Nothing else scheduled yet."} />
          <Group title="Earlier" jobs={jobs.filter(j => j.scheduledDate < today).reverse()} />
        </>
      )}

      {me?.pay && (
        <Card data-testid="card-cleaner-pay">
          <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
            <div><p className="text-xs text-muted-foreground">Owed to you</p><p className="text-lg font-semibold">{formatMoney(me.pay.owed)}</p></div>
            <div><p className="text-xs text-muted-foreground">Paid this year</p><p className="text-lg font-semibold">{formatMoney(me.pay.paidThisYear)}</p></div>
            <div><p className="text-xs text-muted-foreground">Upcoming jobs</p><p className="text-lg font-semibold">{me.pay.upcomingJobs}</p></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
