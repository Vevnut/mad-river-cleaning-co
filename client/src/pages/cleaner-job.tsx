import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, BedDouble, CalendarClock, CheckCircle2, Clock, KeyRound, MapPin, Navigation, Package, Phone, StickyNote } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { JobPhotos } from "@/components/jobs/job-photos";
import { formatMoney } from "@/lib/format";
import { type CleanerJob, type CleanerMe, LIVE, addressLine, bathsLine, bedsLine, dial, formatDay, formatTime, jobTypeLabel, mapsUrl } from "@/lib/cleaner";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );
}
const Text = ({ children }: { children: string }) => <p className="whitespace-pre-wrap">{children}</p>;

export default function CleanerJobPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const key = ["/api/cleaner/jobs", id];
  const { data: job, isLoading, error } = useQuery<CleanerJob>({ queryKey: key, ...LIVE });
  const { data: me } = useQuery<CleanerMe>({ queryKey: ["/api/cleaner/me"] });
  const officePhone = me?.office.phone;

  // Every change returns the updated job; the list and pay totals refresh behind it.
  const send = async (method: string, path: string, body?: unknown) => (await apiRequest(method, path, body)).json() as Promise<CleanerJob>;
  const saved = (message?: string) => (updated: CleanerJob) => {
    queryClient.setQueryData(key, updated);
    queryClient.invalidateQueries({ queryKey: ["/api/cleaner/jobs"], exact: true });
    queryClient.invalidateQueries({ queryKey: ["/api/cleaner/me"] });
    if (message) toast({ title: message });
  };
  const failed = (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
  const notes = useMutation({ mutationFn: (damageNotes: string) => send("PATCH", `/api/cleaner/jobs/${id}`, { damageNotes }), onSuccess: saved("Damage notes saved"), onError: failed });
  const complete = useMutation({ mutationFn: () => send("POST", `/api/cleaner/jobs/${id}/complete`), onSuccess: saved("Job marked complete"), onError: failed });
  const tick = useMutation({
    mutationFn: ({ itemId, isCompleted }: { itemId: number; isCompleted: boolean }) => send("PATCH", `/api/cleaner/jobs/${id}/checklist/${itemId}`, { isCompleted }),
    onSuccess: saved(), onError: failed,
  });

  const back = (
    <Link href="/"><Button variant="ghost" size="sm" className="-ml-2 gap-1"><ArrowLeft className="h-4 w-4" /> My jobs</Button></Link>
  );
  if (isLoading) return <div className="mx-auto max-w-2xl space-y-3 p-4">{back}<Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (error || !job) return <div className="mx-auto max-w-2xl space-y-3 p-4">{back}<p className="text-sm text-muted-foreground">This job isn't on your list. It may have been reassigned or canceled.</p></div>;

  const p = job.property, beds = bedsLine(p.beds);
  const canComplete = job.canEdit && (job.status === "scheduled" || job.status === "in_progress");
  const { lastCheckOut, nextCheckIn } = job.stays;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {back}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{p.name}</h1><StatusBadge status={job.status} /></div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{formatDay(job.scheduledDate)}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(job.scheduledTime)} · about {Math.round(job.durationMinutes / 6) / 10} hr</span>
          <span>{jobTypeLabel(job.jobType)}</span>
        </p>
        <p className="text-sm text-muted-foreground">For {job.customerName}{job.pay != null && <> · <span className="font-medium text-foreground">You earn {formatMoney(job.pay)}</span></>}</p>
      </div>

      <Section icon={<MapPin className="h-4 w-4 text-primary" />} title="Address">
        <p>{addressLine(p)}</p>
        <div className={`grid gap-2 pt-1 ${officePhone ? "grid-cols-2" : "grid-cols-1"}`}>
          <Button asChild variant="outline" className="h-11 gap-1.5" data-testid="link-cleaner-directions">
            <a href={mapsUrl(p)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Directions</a>
          </Button>
          {officePhone && (
            <Button asChild variant="outline" className="h-11 gap-1.5">
              <a href={`tel:${dial(officePhone)}`}><Phone className="h-4 w-4" /> Call office</a>
            </Button>
          )}
        </div>
      </Section>

      <Section icon={<KeyRound className="h-4 w-4 text-primary" />} title="Getting in">
        <Text>{p.entryInstructions || "No entry instructions yet. Ask the office."}</Text>
        {p.accessNotes && <Text>{p.accessNotes}</Text>}
      </Section>

      {(lastCheckOut || nextCheckIn) && (
        <Section icon={<CalendarClock className="h-4 w-4 text-primary" />} title="Guests">
          {lastCheckOut && <p>Last guests check out <strong>{formatDay(lastCheckOut.checkOutDate)}</strong> by {formatTime(p.checkOutTime)}.</p>}
          {nextCheckIn && <p>Next guests check in <strong>{formatDay(nextCheckIn.checkInDate)}</strong> from {formatTime(p.checkInTime)}{nextCheckIn.guestCount ? ` · ${nextCheckIn.guestCount} guests` : ""}.</p>}
        </Section>
      )}

      <Section icon={<BedDouble className="h-4 w-4 text-primary" />} title="The property">
        <p>{p.bedrooms} bedroom · {bathsLine(p)} · sleeps {p.maxOccupancy}</p>
        {beds && <p className="text-muted-foreground">Beds: {beds}</p>}
      </Section>

      {p.supplyNotes && <Section icon={<Package className="h-4 w-4 text-primary" />} title="Supplies"><Text>{p.supplyNotes}</Text></Section>}
      {job.notes && <Section icon={<StickyNote className="h-4 w-4 text-primary" />} title="Notes for this job"><Text>{job.notes}</Text></Section>}

      {job.checklistItems.length > 0 && (
        <Section icon={<CheckCircle2 className="h-4 w-4 text-primary" />} title={`Checklist · ${job.checklist.done}/${job.checklist.total}`}>
          {job.checklistItems.map(item => (
            <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1" data-testid={`checklist-item-${item.id}`}>
              <Checkbox
                checked={item.isCompleted} disabled={!job.canEdit || tick.isPending}
                onCheckedChange={v => tick.mutate({ itemId: item.id, isCompleted: v === true })}
              />
              <span className={item.isCompleted ? "text-muted-foreground line-through" : ""}>{item.label}</span>
            </label>
          ))}
        </Section>
      )}

      <JobPhotos
        jobId={job.id} apiBase="/api/cleaner" readOnly={!job.canEdit} canDelete={photo => !!photo.mine}
        damageNotes={job.damageNotes} onSaveDamageNotes={damageNotes => notes.mutate(damageNotes)} saving={notes.isPending}
      />

      {!job.canEdit && <p className="text-center text-sm text-muted-foreground">This job has been invoiced, so it can't be changed. Contact the office if something's wrong.</p>}
      {canComplete && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <Button className="w-full" size="lg" onClick={() => setConfirming(true)} disabled={complete.isPending} data-testid="button-cleaner-complete">
              Mark job complete
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this job complete?</AlertDialogTitle>
            <AlertDialogDescription>
              {job.checklist.done < job.checklist.total ? `${job.checklist.total - job.checklist.done} checklist item(s) aren't ticked yet. ` : ""}
              The office will see it's done. Only the office can undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => complete.mutate()} data-testid="button-confirm-cleaner-complete">Mark complete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
