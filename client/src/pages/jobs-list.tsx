import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Search, ClipboardList } from "lucide-react";
import type { Job, Property, Staff } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { JobFormDialog } from "@/components/jobs/job-form-dialog";
import { formatMoney, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const JOB_STATUSES = ["scheduled", "in_progress", "completed", "invoiced", "canceled"] as const;
const JOB_TYPES = ["turnover", "deep_clean", "inspection", "one_time", "recurring", "custom"] as const;

export default function JobsListPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: jobs = [], isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });

  const propertyById = (id: number) => properties.find((p) => p.id === id);
  const staffById = (id: number | null) => staffList.find((s) => s.id === id);

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((j) => {
        if (statusFilter !== "all" && j.status !== statusFilter) return false;
        if (jobTypeFilter !== "all" && j.jobType !== jobTypeFilter) return false;
        if (propertyFilter !== "all" && String(j.propertyId) !== propertyFilter) return false;
        if (dateFrom && j.scheduledDate < dateFrom) return false;
        if (dateTo && j.scheduledDate > dateTo) return false;
        if (search.trim()) {
          const property = propertyById(j.propertyId);
          const staff = staffById(j.assignedStaffId);
          const haystack = `${property?.name ?? ""} ${property?.city ?? ""} ${staff?.name ?? ""} ${j.jobType}`.toLowerCase();
          if (!haystack.includes(search.trim().toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => (a.scheduledDate + a.scheduledTime).localeCompare(b.scheduledDate + b.scheduledTime))
      .reverse();
  }, [jobs, statusFilter, jobTypeFilter, propertyFilter, dateFrom, dateTo, search, properties, staffList]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest("DELETE", `/api/jobs/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job deleted" });
    } catch (err) {
      toast({ title: "Couldn't delete job", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Jobs</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setNewJobOpen(true)} data-testid="button-new-job-list">
          <Plus className="h-3.5 w-3.5" /> New Job
        </Button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by property, city, staff..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-jobs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9" data-testid="select-filter-status">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {JOB_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
            <SelectTrigger className="w-[150px] h-9" data-testid="select-filter-type-list">
              <SelectValue placeholder="All Job Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Job Types</SelectItem>
              {JOB_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-[180px] h-9" data-testid="select-filter-property-list">
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px] h-9"
            data-testid="input-date-from"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px] h-9"
            data-testid="input-date-to"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center" data-testid="empty-jobs-list">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No jobs match your filters.</p>
          <Button size="sm" variant="outline" onClick={() => setNewJobOpen(true)} data-testid="button-empty-new-job">
            Schedule a Job
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Staff</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => {
                const property = propertyById(job.propertyId);
                const staff = staffById(job.assignedStaffId);
                return (
                  <ContextMenu key={job.id}>
                    <ContextMenuTrigger asChild>
                      <TableRow data-testid={`row-job-${job.id}`}>
                        <TableCell className="whitespace-nowrap">
                          <Link href={`/jobs/${job.id}`} className="hover:underline">
                            <span className="tabular-nums">{formatDate(job.scheduledDate)}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{job.scheduledTime}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/jobs/${job.id}`} className="hover:underline">
                            <p className="font-medium truncate max-w-[200px]">{property?.name ?? `Property #${job.propertyId}`}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{property?.city ?? ""}</p>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell capitalize">{job.jobType.replace("_", " ")}</TableCell>
                        <TableCell>
                          <StatusBadge status={job.status} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{staff ? staff.name : "Unassigned"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(job.price)}</TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent data-testid={`contextmenu-job-${job.id}`}>
                      <ContextMenuItem
                        data-testid={`contextmenuitem-open-${job.id}`}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                      >
                        Open Job
                      </ContextMenuItem>
                      <ContextMenuItem
                        data-testid={`contextmenuitem-edit-${job.id}`}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                      >
                        Edit
                      </ContextMenuItem>
                      <ContextMenuItem
                        data-testid={`contextmenuitem-delete-${job.id}`}
                        className="text-destructive"
                        onClick={() => setDeleteTarget(job)}
                      >
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <JobFormDialog open={newJobOpen} onOpenChange={setNewJobOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this job and its checklist. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-job">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete-job">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
