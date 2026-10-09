import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, ExternalLink, RefreshCw, Trash2, Link2, CalendarPlus, AlertTriangle, MapPin } from "lucide-react";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type GoogleEvent = {
  id: number; sourceId: number; sourceName: string; color: string; title: string; location: string | null;
  allDay: boolean; start: string; end: string; startDay: string; endDay: string;
};
type Feed = { token: string; createdAt: string; createdBy: string; lastFetchedAt: string | null } | null;
type Source = { id: number; name: string; color: string; calendarId: string; isPublicAddress: boolean; lastSyncedAt: string | null; lastError: string | null; eventCount: number };

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export function refreshGoogle() {
  queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
  queryClient.invalidateQueries({ queryKey: ["/api/calendar/sources"] });
}

function feedUrl(token: string) {
  return new URL(apiUrl(`/api/calendar/feed/${token}.ics`), window.location.href).href;
}

function CopyField({ value, testId }: { value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const el = document.getElementById(testId) as HTMLInputElement | null;
      el?.select(); document.execCommand?.("copy");
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="flex gap-2 min-w-0">
      <Input id={testId} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs h-9 min-w-0 flex-1" data-testid={testId} />
      <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 shrink-0" onClick={copy} data-testid={`${testId}-copy`}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5 text-sm text-muted-foreground">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{i + 1}</span>
          <span className="pt-px">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function GoogleCalendarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const { data: feedData } = useQuery<{ feed: Feed }>({ queryKey: ["/api/calendar/feed"], enabled: open });
  const { data: sources = [] } = useQuery<Source[]>({ queryKey: ["/api/calendar/sources"], enabled: open });
  const feed = feedData?.feed ?? null;
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<null | { kind: "reset" } | { kind: "off" } | { kind: "remove"; source: Source }>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e: any) { toast({ title: "Something went wrong", description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  }
  const makeFeed = () => run("feed", async () => {
    await apiRequest("POST", "/api/calendar/feed");
    await queryClient.invalidateQueries({ queryKey: ["/api/calendar/feed"] });
  });
  const feedOff = () => run("feed", async () => {
    await apiRequest("DELETE", "/api/calendar/feed");
    await queryClient.invalidateQueries({ queryKey: ["/api/calendar/feed"] });
    toast({ title: "Jobs link turned off", description: "Google Calendar will stop getting updates." });
  });
  async function addSource(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy("add");
    try {
      const res = await apiRequest("POST", "/api/calendar/sources", { name: name.trim() || "Google Calendar", url });
      const s: Source = await res.json();
      setName(""); setUrl(""); refreshGoogle();
      toast({ title: "Google Calendar added", description: `${s.eventCount} events from “${s.name}” now show on Scheduling.` });
    } catch (err: any) { setError(err.message); }
    finally { setBusy(""); }
  }
  const sync = (s: Source) => run(`sync-${s.id}`, async () => {
    try { await apiRequest("POST", `/api/calendar/sources/${s.id}/sync`); toast({ title: "Up to date", description: `Refreshed “${s.name}”.` }); }
    finally { refreshGoogle(); }
  });
  const remove = (s: Source) => run(`rm-${s.id}`, async () => {
    await apiRequest("DELETE", `/api/calendar/sources/${s.id}`); refreshGoogle();
    toast({ title: "Calendar removed", description: "Nothing in Google was changed." });
  });

  const link = feed ? feedUrl(feed.token) : "";
  const subscribe = feed ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(link.replace(/^https?:\/\//, "webcal://"))}` : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0" data-testid="dialog-google-calendar">
          <DialogHeader>
            <DialogTitle>Google Calendar</DialogTitle>
            <DialogDescription>Show jobs in Google Calendar, and show Google Calendar events here.</DialogDescription>
          </DialogHeader>

          <section className="space-y-3 rounded-lg border p-4" data-testid="section-feed">
            <div className="flex items-start gap-2">
              <CalendarPlus className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Jobs in Google Calendar</h3>
                <p className="text-xs text-muted-foreground">Every scheduled job, with the property, address, time and who's assigned. Prices and notes stay private.</p>
              </div>
            </div>
            {!feed ? (
              <Button size="sm" onClick={makeFeed} disabled={busy === "feed"} data-testid="button-create-feed">
                <Link2 className="h-3.5 w-3.5 mr-1.5" /> Create calendar link
              </Button>
            ) : (
              <div className="space-y-3">
                <CopyField value={link} testId="input-feed-url" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" asChild data-testid="button-open-google-subscribe">
                    <a href={subscribe} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Add to Google Calendar</a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "reset" })} disabled={busy === "feed"} data-testid="button-reset-feed">Reset link</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "off" })} disabled={busy === "feed"} data-testid="button-feed-off">Turn off</Button>
                </div>
                <Steps items={[
                  <>Click <b className="text-foreground">Add to Google Calendar</b>, then <b className="text-foreground">Add</b>. Or, on a computer, open Google Calendar, click <b className="text-foreground">+</b> next to “Other calendars”, choose <b className="text-foreground">From URL</b>, and paste the link.</>,
                  <>“Mad River Cleaning Jobs” shows up on her phone too, once it syncs.</>,
                  <>Google checks the link on its own schedule, usually every few hours. New jobs won't appear in Google right away.</>,
                ]} />
                <p className="text-xs text-muted-foreground">
                  Anyone with this link can see the job schedule, so only share it with people who should. Resetting it stops the old link.
                  {feed.lastFetchedAt ? ` Google last checked ${when(feed.lastFetchedAt)}.` : " Google hasn't checked it yet."}
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-4" data-testid="section-sources">
            <div className="flex items-start gap-2">
              <svg viewBox="0 0 16 16" className="h-4 w-4 mt-0.5 text-primary" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>
              <div>
                <h3 className="text-sm font-semibold">Google Calendar events here</h3>
                <p className="text-xs text-muted-foreground">Her Google events show on the Scheduling page next to jobs, so it's easy to spot conflicts. View only: nothing is changed in Google.</p>
              </div>
            </div>

            {sources.length > 0 && (
              <ul className="divide-y rounded-md border" data-testid="list-sources">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 p-2.5" data-testid={`row-source-${s.id}`}>
                    <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.calendarId} · {s.eventCount} events · updated {when(s.lastSyncedAt)}</p>
                      {s.lastError && <p className="text-xs text-destructive flex items-center gap-1 mt-0.5"><AlertTriangle className="h-3 w-3" /> {s.lastError}</p>}
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Refresh now" onClick={() => sync(s)} disabled={busy === `sync-${s.id}`} data-testid={`button-sync-${s.id}`}>
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === `sync-${s.id}` ? "animate-spin" : ""}`} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Remove" onClick={() => setConfirm({ kind: "remove", source: s })} data-testid={`button-remove-${s.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <Steps items={[
              <>On a computer, open Google Calendar. Click the gear, then <b className="text-foreground">Settings</b>.</>,
              <>On the left, under “Settings for my calendars”, click her calendar, then <b className="text-foreground">Integrate calendar</b>.</>,
              <>Copy <b className="text-foreground">Secret address in iCal format</b> and paste it below.</>,
            ]} />
            <form onSubmit={addSource} className="space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-[1fr_2fr]">
                <div>
                  <Label htmlFor="cal-name" className="text-xs">Name</Label>
                  <Input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Personal" maxLength={80} className="h-9" data-testid="input-source-name" />
                </div>
                <div>
                  <Label htmlFor="cal-url" className="text-xs">Secret iCal address</Label>
                  <Input id="cal-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autoComplete="off" spellCheck={false} className="h-9 font-mono text-xs" data-testid="input-source-url" />
                </div>
              </div>
              {error && <p className="text-xs text-destructive" data-testid="text-source-error">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Refreshes every 15 minutes while you use the app.</p>
                <Button type="submit" size="sm" disabled={!url.trim() || busy === "add"} data-testid="button-add-source">
                  {busy === "add" ? "Checking…" : "Add calendar"}
                </Button>
              </div>
            </form>
          </section>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "reset" ? "Reset the jobs link?" : confirm?.kind === "off" ? "Turn off the jobs link?" : `Remove “${confirm?.kind === "remove" ? confirm.source.name : ""}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "reset" && "The current link stops working right away. Anyone using it, including her Google Calendar, will need the new link."}
              {confirm?.kind === "off" && "Google Calendar stops getting job updates. Jobs already copied there may stay until Google refreshes."}
              {confirm?.kind === "remove" && "Its events stop showing on Scheduling. Her Google Calendar isn't changed, and you can add it again any time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-calendar" onClick={() => {
              const c = confirm; setConfirm(null);
              if (c?.kind === "reset") makeFeed(); else if (c?.kind === "off") feedOff(); else if (c?.kind === "remove") remove(c.source);
            }}>
              {confirm?.kind === "reset" ? "Reset link" : confirm?.kind === "off" ? "Turn off" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A read-only Google event on the Scheduling grid. */
export function GoogleEventChip({ event, day, compact }: { event: GoogleEvent; day: string; compact?: boolean }) {
  const label = event.allDay ? "All day" : event.startDay === day ? timeOf(event.start) : "Cont.";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="w-full text-left rounded-md border border-dashed bg-muted/40 px-1.5 py-1 text-[11px] leading-tight text-muted-foreground hover:bg-muted transition-colors"
          style={{ borderLeft: `3px solid ${event.color}` }}
          data-testid={`chip-google-${event.id}`}
          title={`${event.title} (Google Calendar)`}
        >
          {compact ? (
            <span className="block truncate"><span className="font-medium">{event.allDay ? "" : `${label} `}</span>{event.title}</span>
          ) : (
            <>
              <span className="block font-medium">{label}</span>
              <span className="block truncate">{event.title}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1.5 text-sm" data-testid={`popover-google-${event.id}`}>
        <p className="font-semibold leading-snug">{event.title}</p>
        <p className="text-xs text-muted-foreground">
          {event.allDay
            ? (event.startDay === event.endDay ? "All day" : `All day, ${fmtDay(event.startDay)} – ${fmtDay(event.endDay)}`)
            : `${new Date(event.start).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${timeOf(event.start)} – ${timeOf(event.end)}`}
        </p>
        {event.location && <p className="text-xs text-muted-foreground flex gap-1"><MapPin className="h-3 w-3 mt-0.5 shrink-0" />{event.location}</p>}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: event.color }} aria-hidden /> {event.sourceName} · Google Calendar
        </p>
      </PopoverContent>
    </Popover>
  );
}
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Groups events onto every day they cover (multi-day trips show on each day). */
export function eventsByDay(events: GoogleEvent[]) {
  const map = new Map<string, GoogleEvent[]>();
  for (const e of events) {
    let d = e.startDay;
    for (let i = 0; i < 62 && d <= e.endDay; i++) {
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
      const n = new Date(`${d}T12:00:00Z`); n.setUTCDate(n.getUTCDate() + 1); d = n.toISOString().slice(0, 10);
    }
  }
  return map;
}
