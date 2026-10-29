import { useMutation, useQuery } from "@tanstack/react-query";
import { useJobCrew } from "@/lib/job-crew";
import { Link } from "wouter";
import { Play, CheckCircle2, Ban, ExternalLink, Clock, User, Home } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import type { Job, Property, Staff } from "@shared/schema";
import { formatMoney, formatDate } from "@/lib/format";

export function JobDetailPopover({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const { data: job } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs/${jobId}`);
      return res.json();
    },
    enabled: open && !!jobId,
  });
  const { data: property } = useQuery<Property>({
    queryKey: ["/api/properties", job?.propertyId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/properties/${job!.propertyId}`);
      return res.json();
    },
    enabled: !!job,
  });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"], enabled: open });
  const assignedStaff = staffList.find((s) => s.id === job?.assignedStaffId);
  const { crewName } = useJobCrew();

  const statusMutation = useMutation({
    mutationFn: async (status: Job["status"]) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}`, {
        status,
        completedAt: status === "completed" ? new Date().toISOString() : job?.completedAt ?? null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job status updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update job", description: err.message, variant: "destructive" }),
  });

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-job-detail-popover">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {property?.name ?? `Property #${job.propertyId}`}
            <StatusBadge status={job.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatDate(job.scheduledDate)} at {job.scheduledTime} &middot; {job.durationMinutes} min
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {job ? crewName(job) : "Unassigned"}
          </div>
          {property && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Home className="h-3.5 w-3.5" />
              {property.addressLine1}, {property.city}
            </div>
          )}
          <p className="capitalize text-muted-foreground">Type: {job.jobType.replace("_", " ")}</p>
          <p className="tabular-nums font-medium">{formatMoney(job.price)}</p>
          {job.internalNotes && (
            <p className="rounded-md bg-muted p-2 text-xs" data-testid="text-popover-internal-notes">
              <span className="font-medium">Internal: </span>{job.internalNotes}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <div className="flex gap-2">
            {job.status === "scheduled" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => statusMutation.mutate("in_progress")}
                disabled={statusMutation.isPending}
                data-testid="button-quick-start-job"
              >
                <Play className="h-3.5 w-3.5" /> Start
              </Button>
            )}
            {job.status === "in_progress" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => statusMutation.mutate("completed")}
                disabled={statusMutation.isPending}
                data-testid="button-quick-complete-job"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
              </Button>
            )}
            {(job.status === "scheduled" || job.status === "in_progress") && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-status-overdue"
                onClick={() => statusMutation.mutate("canceled")}
                disabled={statusMutation.isPending}
                data-testid="button-quick-cancel-job"
              >
                <Ban className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
          <Link href={`/jobs/${job.id}`}>
            <Button size="sm" className="gap-1.5" data-testid="link-open-job-detail">
              Open Job <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
