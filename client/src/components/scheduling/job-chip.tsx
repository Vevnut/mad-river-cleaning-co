import { cn } from "@/lib/utils";
import type { Job, Staff } from "@shared/schema";

const CHIP_STYLES: Record<Job["status"], string> = {
  scheduled: "bg-status-scheduled-bg text-status-scheduled border-status-scheduled/30",
  in_progress: "bg-status-in-progress-bg text-status-in-progress border-status-in-progress/30",
  completed: "bg-status-completed-bg text-status-completed border-status-completed/30",
  invoiced: "bg-status-invoiced-bg text-status-invoiced border-status-invoiced/30",
  canceled: "bg-status-canceled-bg text-status-canceled border-status-canceled/30 line-through opacity-70",
};

export function JobChip({
  job,
  staff,
  onClick,
  compact,
}: {
  job: Job;
  staff?: Staff;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors hover-elevate",
        CHIP_STYLES[job.status]
      )}
      data-testid={`chip-job-${job.id}`}
      title={`${job.scheduledTime} \u2022 ${job.jobType.replace("_", " ")}`}
    >
      <div className="flex items-center gap-1">
        {staff && (
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: staff.colorTag }}
            aria-hidden
          />
        )}
        <span className="font-medium truncate">{job.scheduledTime}</span>
      </div>
      {!compact && (
        <>
          <p className="truncate capitalize">{job.jobType.replace("_", " ")}</p>
          {staff && <p className="truncate opacity-80">{staff.name}</p>}
        </>
      )}
    </button>
  );
}
