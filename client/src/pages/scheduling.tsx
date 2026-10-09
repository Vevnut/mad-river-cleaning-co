import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import type { Job, Staff, Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { JobChip } from "@/components/scheduling/job-chip";
import { JobFormDialog } from "@/components/jobs/job-form-dialog";
import { JobDetailPopover } from "@/components/scheduling/job-detail-popover";
import { GoogleCalendarDialog, GoogleEventChip, eventsByDay, type GoogleEvent } from "@/components/scheduling/google-calendar";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";

type ViewMode = "day" | "week" | "month";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // the month grid starts on Monday

export default function SchedulingPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobDate, setNewJobDate] = useState<string | undefined>(undefined);
  const [detailJobId, setDetailJobId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [showGoogle, setShowGoogle] = useState(true);

  const todayISO = isoDate(new Date());

  const { data: allJobs = [], isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["/api/properties"] });

  const filteredJobs = useMemo(() => {
    return allJobs.filter((j) => {
      if (staffFilter !== "all" && String(j.assignedStaffId) !== staffFilter) return false;
      if (jobTypeFilter !== "all" && j.jobType !== jobTypeFilter) return false;
      if (propertyFilter !== "all" && String(j.propertyId) !== propertyFilter) return false;
      return true;
    });
  }, [allJobs, staffFilter, jobTypeFilter, propertyFilter]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of filteredJobs) {
      if (!map.has(j.scheduledDate)) map.set(j.scheduledDate, []);
      map.get(j.scheduledDate)!.push(j);
    }
    Array.from(map.values()).forEach((arr) => arr.sort((a: Job, b: Job) => a.scheduledTime.localeCompare(b.scheduledTime)));
    return map;
  }, [filteredJobs]);

  // Visible date range, for Google Calendar events.
  const [rangeFrom, rangeTo] = useMemo(() => {
    if (view === "day") return [isoDate(anchor), isoDate(anchor)];
    if (view === "week") { const s = startOfWeek(anchor); return [isoDate(s), isoDate(addDays(s, 6))]; }
    const m = startOfMonth(anchor);
    const g = new Date(m.getFullYear(), m.getMonth(), 1 - ((m.getDay() + 6) % 7));
    return [isoDate(g), isoDate(addDays(g, 41))];
  }, [view, anchor]);
  const { data: googleSources = [] } = useQuery<{ id: number }[]>({ queryKey: ["/api/calendar/sources"] });
  const { data: googleEvents = [] } = useQuery<GoogleEvent[]>({
    queryKey: ["/api/calendar/events", rangeFrom, rangeTo],
    queryFn: async () => (await apiRequest("GET", `/api/calendar/events?from=${rangeFrom}&to=${rangeTo}`)).json(),
    enabled: googleSources.length > 0,
    refetchInterval: 15 * 60 * 1000,
  });
  const googleByDate = useMemo(
    () => (showGoogle && googleSources.length ? eventsByDay(googleEvents) : new Map<string, GoogleEvent[]>()),
    [googleEvents, showGoogle, googleSources.length],
  );

  const staffById = (id: number | null) => staffList.find((s) => s.id === id);
  const propertyById = (id: number) => properties.find((p) => p.id === id);

  const openNewJob = (date: string) => {
    setNewJobDate(date);
    setNewJobOpen(true);
  };
  const openDetail = (jobId: number) => {
    setDetailJobId(jobId);
    setDetailOpen(true);
  };

  const navigate = (dir: -1 | 1) => {
    setAnchor((prev) => {
      if (view === "day") return addDays(prev, dir);
      if (view === "week") return addDays(prev, dir * 7);
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const rangeLabel = useMemo(() => {
    if (view === "day") {
      return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    if (view === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} \u2013 ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [view, anchor]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Scheduling</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGoogleOpen(true)} data-testid="button-google-calendar">
            <CalendarDays className="h-3.5 w-3.5" /> Google Calendar
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openNewJob(todayISO)} data-testid="button-new-job">
            <Plus className="h-3.5 w-3.5" /> New Job
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={staffFilter} onValueChange={setStaffFilter}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-filter-staff">
            <SelectValue placeholder="All Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffList.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-filter-job-type">
            <SelectValue placeholder="All Job Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Job Types</SelectItem>
            {["turnover", "deep_clean", "inspection", "one_time", "recurring", "custom"].map((t) => (
              <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[200px] h-9" data-testid="select-filter-property">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {googleSources.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Switch checked={showGoogle} onCheckedChange={setShowGoogle} data-testid="switch-show-google" />
            Google events
          </label>
        )}
      </div>

      {/* View toggle + nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => navigate(-1)} data-testid="button-nav-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAnchor(new Date())} data-testid="button-nav-today">
            Today
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => navigate(1)} data-testid="button-nav-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium tabular-nums pl-1" data-testid="text-range-label">{rangeLabel}</p>
        </div>
        <div className="flex rounded-md border overflow-hidden h-8">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 text-xs font-medium capitalize transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
              }`}
              data-testid={`button-view-${v}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : view === "day" ? (
        <DayView
          date={anchor}
          jobsByDate={jobsByDate}
          googleByDate={googleByDate}
          staffById={staffById}
          propertyById={propertyById}
          onAddJob={openNewJob}
          onOpenJob={openDetail}
        />
      ) : view === "week" ? (
        <WeekView
          weekStart={startOfWeek(anchor)}
          todayISO={todayISO}
          jobsByDate={jobsByDate}
          googleByDate={googleByDate}
          staffById={staffById}
          propertyById={propertyById}
          onAddJob={openNewJob}
          onOpenJob={openDetail}
        />
      ) : (
        <MonthView
          monthStart={startOfMonth(anchor)}
          todayISO={todayISO}
          jobsByDate={jobsByDate}
          googleByDate={googleByDate}
          staffById={staffById}
          onAddJob={openNewJob}
          onOpenJob={openDetail}
        />
      )}

      <JobFormDialog
        open={newJobOpen}
        onOpenChange={setNewJobOpen}
        initialDate={newJobDate}
      />
      <JobDetailPopover jobId={detailJobId} open={detailOpen} onOpenChange={setDetailOpen} />
      <GoogleCalendarDialog open={googleOpen} onOpenChange={setGoogleOpen} />
    </div>
  );
}

// ─── Day view ────────────────────────────────────────────────────────────────
function DayView({
  date, jobsByDate, googleByDate, staffById, propertyById, onAddJob, onOpenJob,
}: {
  date: Date;
  jobsByDate: Map<string, Job[]>;
  googleByDate: Map<string, GoogleEvent[]>;
  staffById: (id: number | null) => Staff | undefined;
  propertyById: (id: number) => Property | undefined;
  onAddJob: (date: string) => void;
  onOpenJob: (id: number) => void;
}) {
  const iso = isoDate(date);
  const jobs = jobsByDate.get(iso) ?? [];
  const google = googleByDate.get(iso) ?? [];
  const googleList = google.length > 0 && (
    <div className="space-y-1.5" data-testid="list-day-google">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Google Calendar</p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {google.map((e) => <GoogleEventChip key={e.id} event={e} day={iso} />)}
      </div>
    </div>
  );

  if (jobs.length === 0) {
    return (
      <div className="space-y-3">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center" data-testid="empty-day-view">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No jobs scheduled for this day.</p>
        <Button size="sm" variant="outline" onClick={() => onAddJob(iso)} data-testid="button-add-job-day-empty">
          Schedule a Job
        </Button>
      </div>
      {googleList}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const property = propertyById(job.propertyId);
        const staff = staffById(job.assignedStaffId);
        return (
          <div
            key={job.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenJob(job.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenJob(job.id); }}
            className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover-elevate cursor-pointer"
            data-testid={`row-day-job-${job.id}`}
          >
            <div className="w-16 shrink-0 text-sm font-medium tabular-nums">{job.scheduledTime}</div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm">{property?.name ?? `Property #${job.propertyId}`}</p>
              <p className="truncate text-xs text-muted-foreground capitalize">
                {job.jobType.replace("_", " ")} &middot; {job.durationMinutes} min &middot; {staff ? staff.name : "Unassigned"}
              </p>
            </div>
            <StatusBadge status={job.status} />
          </div>
        );
      })}
      {googleList}
    </div>
  );
}

// ─── Week view ───────────────────────────────────────────────────────────────
function WeekView({
  weekStart, todayISO, jobsByDate, googleByDate, staffById, propertyById, onAddJob, onOpenJob,
}: {
  weekStart: Date;
  todayISO: string;
  jobsByDate: Map<string, Job[]>;
  googleByDate: Map<string, GoogleEvent[]>;
  staffById: (id: number | null) => Staff | undefined;
  propertyById: (id: number) => Property | undefined;
  onAddJob: (date: string) => void;
  onOpenJob: (id: number) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <div className="grid grid-cols-7 gap-2 min-w-[900px] md:min-w-0">
        {days.map((day, i) => {
          const iso = isoDate(day);
          const isToday = iso === todayISO;
          const dayJobs = jobsByDate.get(iso) ?? [];
          return (
            <div
              key={iso}
              className={`flex flex-col rounded-lg border ${isToday ? "border-primary" : "border-border"} bg-card`}
              data-testid={`col-week-day-${iso}`}
            >
              <div className={`border-b px-2 py-1.5 text-center ${isToday ? "bg-primary/10 border-primary/30" : "border-border"}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{DAY_LABELS[i]}</p>
                <p className={`text-sm font-bold ${isToday ? "text-primary" : ""}`}>{day.getDate()}</p>
              </div>
              <div className="flex-1 space-y-1 p-1.5 min-h-[220px]">
                {(googleByDate.get(iso) ?? []).filter((e) => e.allDay).map((e) => <GoogleEventChip key={`g${e.id}`} event={e} day={iso} />)}
                {mergeByTime(dayJobs, (googleByDate.get(iso) ?? []).filter((e) => !e.allDay)).map((item) =>
                  "jobType" in item
                    ? <JobChip key={item.id} job={item} staff={staffById(item.assignedStaffId)} onClick={() => onOpenJob(item.id)} />
                    : <GoogleEventChip key={`g${item.id}`} event={item} day={iso} />,
                )}
                <button
                  onClick={() => onAddJob(iso)}
                  className="flex w-full items-center justify-center rounded-md border border-dashed border-border/60 py-1.5 text-muted-foreground/50 hover:text-muted-foreground hover:border-border transition-colors"
                  data-testid={`button-add-job-${iso}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Month view ──────────────────────────────────────────────────────────────
function MonthView({
  monthStart, todayISO, jobsByDate, googleByDate, staffById, onAddJob, onOpenJob,
}: {
  monthStart: Date;
  todayISO: string;
  jobsByDate: Map<string, Job[]>;
  googleByDate: Map<string, GoogleEvent[]>;
  staffById: (id: number | null) => Staff | undefined;
  onAddJob: (date: string) => void;
  onOpenJob: (id: number) => void;
}) {
  const gridStart = startOfWeek(monthStart) < monthStart
    ? new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - ((monthStart.getDay() + 6) % 7))
    : monthStart;
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))
  );
  const month = monthStart.getMonth();

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-2 text-center">
        {MONTH_DAY_LABELS.map((label) => (
          <p key={label} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        ))}
      </div>
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="grid grid-cols-7 gap-1.5 min-w-[900px] md:min-w-0">
          {weeks.flat().map((day) => {
            const iso = isoDate(day);
            const isToday = iso === todayISO;
            const inMonth = day.getMonth() === month;
            const dayJobs = jobsByDate.get(iso) ?? [];
            return (
              <div
                key={iso}
                className={`flex min-h-[96px] flex-col rounded-md border p-1 ${
                  isToday ? "border-primary" : "border-border"
                } ${inMonth ? "bg-card" : "bg-muted/30"}`}
                data-testid={`cell-month-day-${iso}`}
              >
                <div className="flex items-center justify-between px-0.5">
                  <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : inMonth ? "" : "text-muted-foreground/50"}`}>
                    {day.getDate()}
                  </span>
                  <button
                    onClick={() => onAddJob(iso)}
                    className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    data-testid={`button-add-job-month-${iso}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayJobs.slice(0, 3).map((job) => (
                    <JobChip key={job.id} job={job} staff={staffById(job.assignedStaffId)} onClick={() => onOpenJob(job.id)} compact />
                  ))}
                  {(googleByDate.get(iso) ?? []).slice(0, Math.max(0, 3 - dayJobs.length) || 1).map((e) => (
                    <GoogleEventChip key={`g${e.id}`} event={e} day={iso} compact />
                  ))}
                  {(() => {
                    const g = googleByDate.get(iso) ?? [];
                    const hidden = Math.max(0, dayJobs.length - 3) + Math.max(0, g.length - (Math.max(0, 3 - dayJobs.length) || 1));
                    return hidden > 0 && <p className="text-[10px] text-muted-foreground px-1">+{hidden} more</p>;
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Jobs and timed Google events in one list, earliest first. Uses New Hampshire wall-clock times. */
function mergeByTime(jobs: Job[], events: GoogleEvent[]): (Job | GoogleEvent)[] {
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return [...jobs.map((j) => ({ t: j.scheduledTime, item: j as Job | GoogleEvent })), ...events.map((e) => ({ t: hhmm(e.start), item: e as Job | GoogleEvent }))]
    .sort((a, b) => a.t.localeCompare(b.t)).map((x) => x.item);
}
