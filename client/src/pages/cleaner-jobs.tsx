import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, ChevronRight, Clock, ListChecks, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/lib/format";
import { type CleanerJobSummary, type CleanerMe, formatDay, formatTime, jobTypeLabel } from "@/lib/cleaner";

function JobCard({ job }: { job: CleanerJobSummary }) {
  const done = job.status === "completed" || job.status === "invoiced";
  return (
    <Link href={`/job/${job.id}`}>
      <Card className="hover-elevate cursor-pointer" data-testid={`card-cleaner-job-${job.id}`}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{formatDay(job.scheduledDate)}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(job.scheduledTime)}</span>
              <StatusBadge status={job.status} />
            </div>
            <p className="truncate font-semibold">{job.property.name}</p>
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />{job.property.addressLine1}, {job.property.city}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{jobTypeLabel(job.jobType)}</span>
              {job.checklist.total > 0 && (
                <span className="inline-flex items-center gap-1">
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
                  {job.checklist.done}/{job.checklist.total} done
                </span>
              )}
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {jobs.length ? jobs.map(j => <JobCard key={j.id} job={j} />) : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

export default function CleanerJobsPage() {
  const { data: me } = useQuery<CleanerMe>({ queryKey: ["/api/cleaner/me"] });
  const { data, isLoading } = useQuery<{ today: string; jobs: CleanerJobSummary[] }>({ queryKey: ["/api/cleaner/jobs"] });
  const jobs = data?.jobs ?? [], today = data?.today ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">{me ? `Hi, ${me.name.split(" ")[0]}` : "My jobs"}</h1>
        <p className="text-sm text-muted-foreground">Your cleans for the next two months and the last two weeks.</p>
      </div>

      {me?.pay && (
        <Card data-testid="card-cleaner-pay">
          <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
            <div><p className="text-xs text-muted-foreground">Owed to you</p><p className="text-lg font-semibold">{formatMoney(me.pay.owed)}</p></div>
            <div><p className="text-xs text-muted-foreground">Paid this year</p><p className="text-lg font-semibold">{formatMoney(me.pay.paidThisYear)}</p></div>
            <div><p className="text-xs text-muted-foreground">Upcoming jobs</p><p className="text-lg font-semibold">{me.pay.upcomingJobs}</p></div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <>
          <Group title="Today" jobs={jobs.filter(j => j.scheduledDate === today)} empty="No cleans today." />
          <Group title="Upcoming" jobs={jobs.filter(j => j.scheduledDate > today)} empty="Nothing scheduled yet." />
          <Group title="Earlier" jobs={jobs.filter(j => j.scheduledDate < today).reverse()} />
        </>
      )}
    </div>
  );
}
