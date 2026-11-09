import { useState } from "react";
import { AlertTriangle, CheckCircle2, MessageSquareWarning, Minus, Package, Plus, Sparkles, Waves } from "lucide-react";
import { DEEP_CLEAN_TASKS, HOT_TUB_DRAIN, daysBetween, upkeepState } from "@shared/upkeep";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { type CleanerJob, clockTime } from "@/lib/cleaner";

// Extra sections of a cleaner's job page. Each takes the job and a `send` that posts a change
// and stores the updated job, resolving true when it saved, so the page keeps one source of truth.
export type Send = (path: string, body: unknown, message?: string) => Promise<boolean>;

function Section({ icon, title, children, testId }: { icon: React.ReactNode; title: string; children: React.ReactNode; testId?: string }) {
  return <Card data-testid={testId}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-sm">{children}</CardContent></Card>;
}
const ago = (last: string | undefined, today: string) => {
  if (!last) return "Never logged";
  const d = daysBetween(last, today);
  return `Last done ${d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`}`;
};

/** Deep-cleaning tasks and the hot tub drain, ticked on this job. Shows what's due unless it's a deep-clean job. */
export function DeepCleanSection({ job, today, send, busy }: { job: CleanerJob; today: string; send: Send; busy: boolean }) {
  const [showAll, setShowAll] = useState(job.jobType === "deep_clean");
  const u = job.upkeep;
  const isDue = (key: string) => ["due", "never"].includes(upkeepState(u.lastDone[key], today));
  const tasks = DEEP_CLEAN_TASKS.filter(t => showAll || isDue(t.key) || u.thisJob[t.key]);
  const ticked = DEEP_CLEAN_TASKS.filter(t => u.thisJob[t.key]).length;
  const row = (key: string, label: string) => {
    const on = !!u.thisJob[key], locked = on && !u.thisJob[key].mine;
    return <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1" data-testid={`cleaner-upkeep-${key}`}>
      <Checkbox checked={on} disabled={!job.canEdit || busy || locked} onCheckedChange={v => { void send(`/api/cleaner/jobs/${job.id}/upkeep`, { task: key, done: v === true }); }} />
      <span className="min-w-0 flex-1"><span className={on ? "text-muted-foreground line-through" : ""}>{label}</span>
        <span className="block text-xs text-muted-foreground">{on ? (locked ? "Logged by the office" : "Done on this job") : ago(u.lastDone[key], today)}</span></span>
      {!on && isDue(key) && <span className="rounded bg-status-overdue-bg px-1.5 py-0.5 text-xs font-medium text-status-overdue">Due</span>}
    </label>;
  };
  return <>
    {u.hasHotTub && <Section icon={<Waves className="h-4 w-4 text-primary" />} title="Hot tub" testId="cleaner-hot-tub">
      <p className="text-muted-foreground">Tick this only when you did a full drain & refill. Regular chemicals and filter don't count.</p>
      {row(HOT_TUB_DRAIN.key, HOT_TUB_DRAIN.label)}
    </Section>}
    <Section icon={<Sparkles className="h-4 w-4 text-primary" />} title={`Deep cleaning${ticked ? ` · ${ticked} done` : ""}`} testId="cleaner-deep-clean">
      {!tasks.length ? <p className="text-muted-foreground">Nothing is due at this house. Tap "Show all tasks" if you did any extra.</p> : tasks.map(t => row(t.key, t.label))}
      <Button variant="ghost" size="sm" className="px-1" onClick={() => setShowAll(v => !v)}>{showAll ? "Show only what's due" : "Show all tasks"}</Button>
    </Section>
  </>;
}

/** Supplies kept at this house: count with − / +, or flag something as running low. */
export function HouseSuppliesSection({ job, send, busy }: { job: CleanerJob; send: Send; busy: boolean }) {
  if (!job.supplies.length) return null;
  return <Section icon={<Package className="h-4 w-4 text-primary" />} title="Supplies at this house" testId="cleaner-supplies">
    <p className="text-muted-foreground">Fix the counts if they're off, and flag anything running low so the office can restock it.</p>
    <ul className="divide-y">
      {job.supplies.map(s => <li key={s.id} className="space-y-1.5 py-2" data-testid={`cleaner-supply-${s.id}`}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 font-medium">{s.name}{s.low && <span className="ml-2 rounded bg-status-overdue-bg px-1.5 py-0.5 text-xs font-medium text-status-overdue">Low</span>}</span>
          <Button size="icon" variant="outline" className="h-10 w-10" aria-label={`One less ${s.name}`} disabled={busy || s.quantity <= 0} onClick={() => { void send(`/api/cleaner/jobs/${job.id}/supplies/${s.id}/adjust`, { delta: -1 }); }}><Minus className="h-4 w-4" /></Button>
          <span className="min-w-[3.5rem] text-center tabular-nums">{Math.round(s.quantity * 100) / 100}{s.unit ? ` ${s.unit}` : ""}</span>
          <Button size="icon" variant="outline" className="h-10 w-10" aria-label={`One more ${s.name}`} disabled={busy} onClick={() => { void send(`/api/cleaner/jobs/${job.id}/supplies/${s.id}/adjust`, { delta: 1 }); }}><Plus className="h-4 w-4" /></Button>
        </div>
        {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
        {s.flaggedAt
          ? <p className="flex items-center gap-2 text-xs text-status-overdue"><AlertTriangle className="h-3.5 w-3.5" />Flagged as running low{s.flaggedByMe && <Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-xs underline" disabled={busy} onClick={() => { void send(`/api/cleaner/jobs/${job.id}/supplies/${s.id}/flag`, { low: false }); }}>Undo</Button>}</p>
          : <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={() => { void send(`/api/cleaner/jobs/${job.id}/supplies/${s.id}/flag`, { low: true }, `${s.name} flagged for the office`); }}>Running low</Button>}
      </li>)}
    </ul>
  </Section>;
}

/** Messages to the office about problems at the house. */
export function IssuesSection({ job, send, busy }: { job: CleanerJob; send: Send; busy: boolean }) {
  const [text, setText] = useState("");
  return <Section icon={<MessageSquareWarning className="h-4 w-4 text-primary" />} title="Message the office" testId="cleaner-issues">
    {job.issues.map(i => <div key={i.id} className="rounded-md border p-2">
      <p className="whitespace-pre-wrap">{i.body}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })} · {clockTime(i.createdAt)}{!i.mine && " · from another cleaner"}
        {i.resolved && <span className="ml-1 inline-flex items-center gap-1 text-status-completed"><CheckCircle2 className="h-3 w-3" />Handled</span>}</p>
    </div>)}
    <Textarea rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Something broken, missing linens, a guest mess… The office sees this right away." aria-label="Message the office" />
    <Button className="h-11 w-full" disabled={busy || !text.trim()} onClick={async () => { if (await send(`/api/cleaner/jobs/${job.id}/issues`, { body: text }, "Sent to the office")) setText(""); }} data-testid="button-cleaner-send-issue">Send to office</Button>
    <p className="text-xs text-muted-foreground">For damage, add photos under Damage too. For anything urgent, call the office.</p>
  </Section>;
}
