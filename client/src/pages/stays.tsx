import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, BedDouble } from "lucide-react";
import type { Stay, Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StayFormDialog, PLATFORMS, PLATFORM_LABELS } from "@/components/stays/stay-form-dialog";

type ViewMode = "week" | "month";
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_STYLES: Record<Platform, string> = {
  airbnb: "bg-chart-4/15 text-chart-4 border-chart-4/40",
  vrbo: "bg-chart-1/15 text-chart-1 border-chart-1/40",
  booking_com: "bg-chart-2/15 text-chart-2 border-chart-2/40",
  direct: "bg-chart-5/15 text-chart-5 border-chart-5/40",
  other: "bg-chart-3/15 text-chart-3 border-chart-3/40",
};
const PLATFORM_DOT: Record<Platform, string> = {
  airbnb: "bg-chart-4",
  vrbo: "bg-chart-1",
  booking_com: "bg-chart-2",
  direct: "bg-chart-5",
  other: "bg-chart-3",
};

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
function diffDaysISO(aISO: string, bISO: string) {
  const a = new Date(aISO + "T00:00:00").getTime();
  const b = new Date(bISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}
function formatDateRange(checkIn: string, checkOut: string) {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(checkIn)} \u2013 ${fmt(checkOut)}`;
}

const WEEK_COL_PX = 132;
const MONTH_COL_PX = 44;
const LABEL_COL_PX = 188;

interface Bar {
  stay: Stay;
  startCol: number; // 0-based, inclusive
  endCol: number; // 0-based, exclusive (nights model: checkout day itself is free)
  lane: number;
}

// Greedy interval-lane assignment so overlapping stays on the same property
// stack into extra rows instead of colliding.
function layoutBars(propertyStays: Stay[], daysISO: string[]): { bars: Bar[]; laneCount: number } {
  const windowStart = daysISO[0];
  const windowLen = daysISO.length;
  const candidates = propertyStays
    .map((stay) => {
      const rawStart = diffDaysISO(windowStart, stay.checkInDate);
      const rawEnd = diffDaysISO(windowStart, stay.checkOutDate); // exclusive
      const startCol = Math.max(0, rawStart);
      const endCol = Math.min(windowLen, rawEnd);
      return { stay, startCol, endCol };
    })
    .filter((c) => c.endCol > c.startCol)
    .sort((a, b) => a.startCol - b.startCol);

  const laneEnds: number[] = [];
  const bars: Bar[] = [];
  for (const c of candidates) {
    let lane = laneEnds.findIndex((end) => end <= c.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = c.endCol;
    bars.push({ ...c, lane });
  }
  return { bars, laneCount: Math.max(1, laneEnds.length) };
}

export default function StaysPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaults, setFormDefaults] = useState<{ date?: string; propertyId?: number }>({});
  const [editingStay, setEditingStay] = useState<Stay | null>(null);

  const todayISO = isoDate(new Date());

  const { data: allProperties = [], isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  const { data: allStays = [], isLoading: staysLoading } = useQuery<Stay[]>({
    queryKey: ["/api/stays"],
  });

  const properties = useMemo(() => {
    let list = allProperties.filter((p) => p.active);
    if (propertyFilter !== "all") list = list.filter((p) => String(p.id) === propertyFilter);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [allProperties, propertyFilter]);

  const filteredStays = useMemo(() => {
    return allStays.filter((s) => {
      if (s.status === "canceled") return false;
      if (platformFilter !== "all" && s.platform !== platformFilter) return false;
      return true;
    });
  }, [allStays, platformFilter]);

  const days = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const monthStart = startOfMonth(anchor);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));
  }, [view, anchor]);

  const daysISO = useMemo(() => days.map(isoDate), [days]);
  const colPx = view === "week" ? WEEK_COL_PX : MONTH_COL_PX;

  const staysByProperty = useMemo(() => {
    const map = new Map<number, Stay[]>();
    for (const s of filteredStays) {
      if (!map.has(s.propertyId)) map.set(s.propertyId, []);
      map.get(s.propertyId)!.push(s);
    }
    return map;
  }, [filteredStays]);

  const navigate = (dir: -1 | 1) => {
    setAnchor((prev) => (view === "week" ? addDays(prev, dir * 7) : (() => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    })()));
  };

  const rangeLabel = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} \u2013 ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [view, anchor]);

  const openNewStay = (propertyId?: number, date?: string) => {
    setEditingStay(null);
    setFormDefaults({ propertyId, date: date ?? todayISO });
    setFormOpen(true);
  };
  const openEditStay = (stay: Stay) => {
    setEditingStay(stay);
    setFormDefaults({});
    setFormOpen(true);
  };

  const isLoading = propertiesLoading || staysLoading;
  const gridWidth = daysISO.length * colPx;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Stays</h1>
          <p className="text-sm text-muted-foreground">Guest bookings across every rental, at a glance.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => openNewStay()} data-testid="button-new-stay">
          <Plus className="h-3.5 w-3.5" /> New Stay
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[200px] h-9" data-testid="select-filter-stay-property">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {allProperties.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-filter-stay-platform">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Legend */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {PLATFORMS.map((p) => (
            <div key={p} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${PLATFORM_DOT[p]}`} aria-hidden />
              <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[p]}</span>
            </div>
          ))}
        </div>
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
          {(["week", "month"] as ViewMode[]).map((v) => (
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
      ) : properties.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center" data-testid="empty-stays-view">
          <BedDouble className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No active properties to show.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div style={{ minWidth: LABEL_COL_PX + gridWidth }}>
            {/* Header row: day labels */}
            <div className="flex border-b bg-muted/40">
              <div
                className="shrink-0 flex items-center px-3 py-2 sticky left-0 z-10 bg-muted/40 border-r"
                style={{ width: LABEL_COL_PX }}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Property</span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${daysISO.length}, ${colPx}px)`, width: gridWidth }}>
                {days.map((d, i) => {
                  const iso = daysISO[i];
                  const isToday = iso === todayISO;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={iso}
                      className={`flex flex-col items-center justify-center py-2 border-r border-border/60 ${isToday ? "bg-primary/10" : isWeekend ? "bg-muted/30" : ""}`}
                      data-testid={`col-stays-day-${iso}`}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                      <span className={`text-xs font-semibold ${isToday ? "text-primary" : ""}`}>
                        {view === "week" ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Property rows */}
            {properties.map((property) => {
              const propertyStays = staysByProperty.get(property.id) ?? [];
              const { bars, laneCount } = layoutBars(propertyStays, daysISO);
              const rowHeight = laneCount * 34 + 12;

              return (
                <div key={property.id} className="flex border-b last:border-b-0 group" data-testid={`row-stays-property-${property.id}`}>
                  <div
                    className="shrink-0 flex items-center justify-between gap-1.5 px-3 py-2 sticky left-0 z-10 bg-card border-r"
                    style={{ width: LABEL_COL_PX, minHeight: rowHeight }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" data-testid={`text-stays-property-name-${property.id}`}>{property.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{property.city}, {property.state}</p>
                    </div>
                    <button
                      onClick={() => openNewStay(property.id)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100"
                      data-testid={`button-add-stay-${property.id}`}
                      title="Add a stay"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="relative" style={{ width: gridWidth, minHeight: rowHeight }}>
                    {/* Background day columns */}
                    <div
                      className="absolute inset-0 grid"
                      style={{ gridTemplateColumns: `repeat(${daysISO.length}, ${colPx}px)` }}
                      aria-hidden
                    >
                      {days.map((d, i) => {
                        const iso = daysISO[i];
                        const isToday = iso === todayISO;
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div
                            key={iso}
                            className={`border-r border-border/50 ${isToday ? "bg-primary/5" : isWeekend ? "bg-muted/15" : ""}`}
                          />
                        );
                      })}
                    </div>

                    {/* Booking bars */}
                    <div
                      className="relative grid gap-y-1 px-0 py-1.5"
                      style={{
                        gridTemplateColumns: `repeat(${daysISO.length}, ${colPx}px)`,
                        gridTemplateRows: `repeat(${laneCount}, 28px)`,
                      }}
                    >
                      {bars.map(({ stay, startCol, endCol, lane }) => {
                        const platform = stay.platform as Platform;
                        const nights = diffDaysISO(stay.checkInDate, stay.checkOutDate);
                        return (
                          <button
                            key={stay.id}
                            onClick={() => openEditStay(stay)}
                            className={`flex items-center gap-1.5 truncate rounded-md border px-2 text-left text-[11px] font-medium leading-none hover-elevate ${PLATFORM_STYLES[platform]} ${stay.status === "tentative" ? "border-dashed opacity-80" : ""}`}
                            style={{
                              gridColumn: `${startCol + 1} / ${endCol + 1}`,
                              gridRow: lane + 1,
                            }}
                            data-testid={`bar-stay-${stay.id}`}
                            title={`${stay.guestName} \u2022 ${formatDateRange(stay.checkInDate, stay.checkOutDate)} \u2022 ${nights} night${nights === 1 ? "" : "s"} \u2022 ${PLATFORM_LABELS[platform]}`}
                          >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PLATFORM_DOT[platform]}`} aria-hidden />
                            <span className="truncate">{stay.guestName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <StayFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialDate={formDefaults.date}
        initialPropertyId={formDefaults.propertyId}
        editStay={editingStay}
      />
    </div>
  );
}
