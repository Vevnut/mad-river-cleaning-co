import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Home, Building2, Clock, User, DollarSign, Plus, X,
  CheckCircle2, Play, Ban, ListChecks, Receipt, Sparkles,
} from "lucide-react";
import type { Job, Property, Customer, Staff, JobTemplate, ServiceChecklist } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/status-badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMoney, formatDate } from "@/lib/format";
import { JobPhotos } from "@/components/jobs/job-photos";
import { JobSubcontractor } from "@/components/jobs/job-subcontractor";

const STATUS_ORDER: Job["status"][] = ["scheduled", "in_progress", "completed", "invoiced"];
const STATUS_LABELS: Record<Job["status"], string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  canceled: "Canceled",
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: job, isLoading } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs/${jobId}`);
      return res.json();
    },
  });
  const { data: property } = useQuery<Property>({
    queryKey: ["/api/properties", job?.propertyId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/properties/${job!.propertyId}`);
      return res.json();
    },
    enabled: !!job,
  });
  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customers", job?.customerId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers/${job!.customerId}`);
      return res.json();
    },
    enabled: !!job,
  });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: templates = [] } = useQuery<JobTemplate[]>({ queryKey: ["/api/job-templates"] });
  const { data: checklist = [] } = useQuery<ServiceChecklist[]>({
    queryKey: ["/api/jobs", jobId, "checklist"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs/${jobId}/checklist`);
      return res.json();
    },
    enabled: !!job,
  });

  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [assignedStaffId, setAssignedStaffId] = useState<string>("none");
  const [supplies, setSupplies] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [newChecklistLabel, setNewChecklistLabel] = useState("");

  useEffect(() => {
    if (job) {
      setScheduledDate(job.scheduledDate);
      setScheduledTime(job.scheduledTime);
      setDurationMinutes(job.durationMinutes);
      setAssignedStaffId(job.assignedStaffId ? String(job.assignedStaffId) : "none");
      setInternalNotes(job.internalNotes ?? "");
      setCustomerNotes(job.customerNotes ?? "");
    }
  }, [job?.id]);

  const updateJob = useMutation({
    mutationFn: async (data: Partial<Job>) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({ title: "Job updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update job", description: err.message, variant: "destructive" }),
  });

  const addChecklistItem = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", "/api/checklist-items", {
        jobId, label, isCompleted: false, sortOrder: checklist.length,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "checklist"] });
      setNewChecklistLabel("");
    },
  });

  const toggleChecklistItem = useMutation({
    mutationFn: async ({ id, isCompleted }: { id: number; isCompleted: boolean }) => {
      const res = await apiRequest("PATCH", `/api/checklist-items/${id}`, { isCompleted });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "checklist"] }),
  });

  const deleteChecklistItem = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/checklist-items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "checklist"] }),
  });

  const generateInvoice = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invoices/generate-from-job/${jobId}`, {});
      return res.json();
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice generated", description: `Created ${invoice.invoiceNumber}.` });
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (err: Error) => toast({ title: "Failed to generate invoice", description: err.message, variant: "destructive" }),
  });

  const completedCount = checklist.filter((c) => c.isCompleted).length;

  const handleSaveSchedule = () => {
    updateJob.mutate({
      scheduledDate,
      scheduledTime,
      durationMinutes,
      assignedStaffId: assignedStaffId === "none" ? null : Number(assignedStaffId),
    });
  };

  const handleSaveNotes = () => {
    updateJob.mutate({
      internalNotes: internalNotes || null,
      customerNotes: customerNotes || null,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Job not found.</p>
        <Link href="/jobs" className="text-sm text-primary hover:underline">Back to Jobs</Link>
      </div>
    );
  }

  const staffById = (id: number | null) => staffList.find((s) => s.id === id);
  const currentStepIndex = STATUS_ORDER.indexOf(job.status);
  const isCanceled = job.status === "canceled";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/jobs">
          <Button size="icon" variant="ghost" data-testid="button-back-jobs">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold min-w-0 basis-full sm:basis-auto sm:flex-1 truncate" data-testid="text-job-title">
          {property?.name ?? `Property #${job.propertyId}`}
        </h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {property && (
          <Link href={`/properties/${property.id}`} className="flex items-center gap-1.5 hover:text-foreground hover:underline" data-testid="link-job-property">
            <Home className="h-3.5 w-3.5" /> {property.addressLine1}, {property.city}
          </Link>
        )}
        {customer && (
          <Link href={`/customers/${customer.id}`} className="flex items-center gap-1.5 hover:text-foreground hover:underline" data-testid="link-job-customer">
            <Building2 className="h-3.5 w-3.5" /> {customer.name}
          </Link>
        )}
      </div>

      {/* Status stepper */}
      <Card>
        <CardContent className="p-4">
          {isCanceled ? (
            <p className="text-sm text-status-canceled font-medium" data-testid="text-canceled-banner">
              This job was canceled.
            </p>
          ) : (
            <div className="flex items-center" data-testid="status-stepper">
              {STATUS_ORDER.map((status, i) => (
                <div key={status} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                        i <= currentStepIndex
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {i < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={`text-[10px] font-medium whitespace-nowrap ${i <= currentStepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  {i < STATUS_ORDER.length - 1 && (
                    <div className={`h-px flex-1 mx-1 ${i < currentStepIndex ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {job.status === "scheduled" && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => updateJob.mutate({ status: "in_progress" })} data-testid="button-start-job">
                <Play className="h-3.5 w-3.5" /> Start Job
              </Button>
            )}
            {job.status === "in_progress" && (
              <Button size="sm" className="gap-1.5" onClick={() => updateJob.mutate({ status: "completed", completedAt: new Date().toISOString() })} data-testid="button-mark-complete">
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
              </Button>
            )}
            {(job.status === "scheduled" || job.status === "in_progress") && (
              <Button size="sm" variant="outline" className="gap-1.5 text-status-overdue" onClick={() => updateJob.mutate({ status: "canceled" })} data-testid="button-cancel-job-detail">
                <Ban className="h-3.5 w-3.5" /> Cancel Job
              </Button>
            )}
            {job.status === "completed" ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => navigate(`/invoices/new?jobId=${jobId}`)}
                disabled={generateInvoice.isPending}
                data-testid="button-generate-invoice"
              >
                <Receipt className="h-3.5 w-3.5" /> Generate Invoice
              </Button>
            ) : job.status === "invoiced" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="outline" disabled className="gap-1.5" data-testid="button-generate-invoice">
                      <Receipt className="h-3.5 w-3.5" /> Generate Invoice
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  This job has already been invoiced.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="outline" disabled className="gap-1.5" data-testid="button-generate-invoice">
                      <Receipt className="h-3.5 w-3.5" /> Generate Invoice
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Mark this job Complete before generating an invoice.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Scheduling details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Scheduling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Date</label>
                <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} data-testid="input-detail-date" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Time</label>
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} data-testid="input-detail-time" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Duration (minutes)</label>
              <Input type="number" step={15} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} data-testid="input-detail-duration" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Assigned Staff</label>
              <Select value={assignedStaffId} onValueChange={setAssignedStaffId}>
                <SelectTrigger data-testid="select-detail-staff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="tabular-nums font-medium">{formatMoney(job.price)}</span>
              <span className="text-xs text-muted-foreground ml-2">{job.rateType === "owner" ? "Owner rate" : job.rateType === "standard" ? "Standard departure rate" : "Custom rate"}</span>
              <span className="text-muted-foreground capitalize">&middot; {job.jobType.replace("_", " ")}</span>
            </div>
            <Button size="sm" onClick={handleSaveSchedule} disabled={updateJob.isPending} data-testid="button-save-schedule">
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" /> Checklist
              </span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums" data-testid="text-checklist-progress">
                {completedCount}/{checklist.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklist.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2" data-testid="empty-checklist">No checklist items yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 group" data-testid={`checklist-item-${item.id}`}>
                    <Checkbox
                      checked={item.isCompleted}
                      onCheckedChange={(checked) => toggleChecklistItem.mutate({ id: item.id, isCompleted: !!checked })}
                      data-testid={`checkbox-checklist-${item.id}`}
                    />
                    <span className={`flex-1 text-sm ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </span>
                    <button
                      onClick={() => deleteChecklistItem.mutate(item.id)}
                      className="text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                      data-testid={`button-remove-checklist-${item.id}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="Add checklist item..."
                value={newChecklistLabel}
                onChange={(e) => setNewChecklistLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newChecklistLabel.trim()) {
                    e.preventDefault();
                    addChecklistItem.mutate(newChecklistLabel.trim());
                  }
                }}
                className="h-9 text-sm"
                data-testid="input-new-checklist-item"
              />
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                disabled={!newChecklistLabel.trim() || addChecklistItem.isPending}
                onClick={() => addChecklistItem.mutate(newChecklistLabel.trim())}
                data-testid="button-add-checklist-item"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplies used */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" /> Supplies Used
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g. 2x toilet paper, dish soap refill, extra towels..."
            value={supplies}
            onChange={(e) => setSupplies(e.target.value)}
            rows={2}
            className="text-sm"
            data-testid="textarea-supplies-used"
          />
        </CardContent>
      </Card>

      {/* Notes: internal vs customer-visible */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Internal Notes</CardTitle>
            <p className="text-xs text-muted-foreground">Staff-only, never shown to the customer.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="text-sm"
              data-testid="textarea-internal-notes"
            />
            <Button size="sm" variant="outline" onClick={handleSaveNotes} disabled={updateJob.isPending} data-testid="button-save-internal-notes">
              Save Notes
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer-Visible Notes</CardTitle>
            <p className="text-xs text-muted-foreground">Shown to the customer on invoices/communications.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              rows={3}
              className="text-sm"
              data-testid="textarea-customer-notes-detail"
            />
            <Button size="sm" variant="outline" onClick={handleSaveNotes} disabled={updateJob.isPending} data-testid="button-save-customer-notes">
              Save Notes
            </Button>
          </CardContent>
        </Card>
      </div>

      <JobSubcontractor jobId={job.id} jobPrice={job.price} />

      {/* Damage and final walkthrough photos (private to the workspace) */}
      <JobPhotos
        jobId={job.id}
        damageNotes={job.damageNotes ?? null}
        onSaveDamageNotes={(damageNotes) => updateJob.mutate({ damageNotes })}
        saving={updateJob.isPending}
      />
    </div>
  );
}
