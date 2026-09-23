import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CalendarClock, Loader2, CheckCircle2, FileText, CircleDollarSign,
  CircleAlert, AlertTriangle, Ban,
} from "lucide-react";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "invoiced" | "canceled";
export type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "partial" | "overdue" | "canceled";
export type AnyStatus = JobStatus | InvoiceStatus;

const STATUS_CONFIG: Record<
  AnyStatus,
  { label: string; icon: typeof CalendarClock; text: string; bg: string }
> = {
  scheduled: { label: "Scheduled", icon: CalendarClock, text: "text-status-scheduled", bg: "bg-status-scheduled-bg" },
  in_progress: { label: "In Progress", icon: Loader2, text: "text-status-in-progress", bg: "bg-status-in-progress-bg" },
  completed: { label: "Completed", icon: CheckCircle2, text: "text-status-completed", bg: "bg-status-completed-bg" },
  invoiced: { label: "Invoiced", icon: FileText, text: "text-status-invoiced", bg: "bg-status-invoiced-bg" },
  draft: { label: "Draft", icon: FileText, text: "text-muted-foreground", bg: "bg-muted" },
  sent: { label: "Sent", icon: FileText, text: "text-status-scheduled", bg: "bg-status-scheduled-bg" },
  viewed: { label: "Viewed", icon: FileText, text: "text-status-scheduled", bg: "bg-status-scheduled-bg" },
  paid: { label: "Paid", icon: CircleDollarSign, text: "text-status-paid", bg: "bg-status-paid-bg" },
  partial: { label: "Partially paid", icon: AlertTriangle, text: "text-status-partial", bg: "bg-status-partial-bg" },
  overdue: { label: "Overdue", icon: CircleAlert, text: "text-status-overdue", bg: "bg-status-overdue-bg" },
  canceled: { label: "Canceled", icon: Ban, text: "text-status-canceled", bg: "bg-status-canceled-bg" },
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  const Icon = config.icon;
  const isCanceled = status === "canceled";
  return (
    <Badge
      variant="outline"
      data-testid={`status-${status}`}
      className={cn(
        "gap-1 border-transparent font-medium",
        config.bg,
        config.text,
        isCanceled && "line-through",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
