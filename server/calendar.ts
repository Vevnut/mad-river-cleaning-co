import type { Express, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import ICAL from "ical.js";
import { sqlite } from "./storage";

/**
 * Google Calendar, both directions, without a Google Cloud project:
 *
 *  1. Jobs → Google: a private iCal link (`/api/calendar/feed/<token>.ics`) that
 *     Google Calendar subscribes to with "From URL". Mounted BEFORE the sign-in
 *     gate; the long random token is the only key. Resetting the link revokes it.
 *  2. Google → app: the "Secret address in iCal format" of one or more Google
 *     calendars. The server reads it (only calendar.google.com, no redirects,
 *     size and time limited), expands repeating events and caches them in
 *     `calendar_events` for the Scheduling page. Read-only: nothing is written
 *     back to Google.
 */
export const BUSINESS_TZ = "America/New_York";
export const FEED_PAST_DAYS = 90;
export const IMPORT_PAST_DAYS = 60;
export const IMPORT_FUTURE_DAYS = 400;
export const STALE_MS = 15 * 60 * 1000;
const MAX_ICS_BYTES = 8 * 1024 * 1024;
const MAX_OCCURRENCES = 5000;

function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const now = () => new Date().toISOString();
const actor = (res: Response) => res.locals.user?.email || "Workspace user";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ─── Dates in the business time zone ─────────────────────────────────────────
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const nyDay = (d: Date) => dayFmt.format(d);
const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function tzOffsetMs(at: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(at)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at;
}
/** Wall-clock date + time in New Hampshire → the real instant (handles daylight saving). */
export function nyToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let t = wall - tzOffsetMs(wall);
  t = wall - tzOffsetMs(t);
  return new Date(t);
}
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

// ─── iCal writing ────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = []; let cur = "", len = 0, limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (len + n > limit) { out.push(cur); cur = ""; len = 0; limit = 74; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const TYPE_LABEL: Record<string, string> = {
  turnover: "Turnover", deep_clean: "Deep clean", inspection: "Inspection", one_time: "One-time clean", custom: "Custom job", recurring: "Recurring clean",
};
const STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", invoiced: "Invoiced" };

/** The jobs feed. Leaves out prices, notes, door codes and canceled jobs. */
export function buildJobsFeed(today = nyDay(new Date())): string {
  const rows = sqlite.prepare(`SELECT j.id, j.job_type, j.scheduled_date, j.scheduled_time, j.duration_minutes, j.status,
      p.name property_name, p.address_line1, p.address_line2, p.city, p.state, p.zip,
      s.name staff_name, sc.name sub_name
    FROM jobs j LEFT JOIN properties p ON p.id=j.property_id LEFT JOIN staff s ON s.id=j.assigned_staff_id
    LEFT JOIN job_subcontractors a ON a.job_id=j.id LEFT JOIN subcontractors sc ON sc.id=a.subcontractor_id
    WHERE j.status!='canceled' AND j.scheduled_date>=? ORDER BY j.scheduled_date, j.scheduled_time`).all(addDays(today, -FEED_PAST_DAYS)) as any[];
  const dtstamp = stamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mad River Cleaning Co.//Jobs//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Mad River Cleaning Jobs", `X-WR-TIMEZONE:${BUSINESS_TZ}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const j of rows) {
    const title = `${TYPE_LABEL[j.job_type] ?? "Job"} – ${j.property_name ?? `Property #${j.id}`}`;
    const address = [j.address_line1, j.address_line2, j.city, [j.state, j.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const who = [j.staff_name, j.sub_name && `${j.sub_name} (subcontractor)`].filter(Boolean).join(", ") || "Unassigned";
    const desc = [`Status: ${STATUS_LABEL[j.status] ?? j.status}`, `Assigned: ${who}`, `Duration: ${j.duration_minutes} min`, `Job #${j.id} in Mad River Cleaning Co.`].join("\n");
    lines.push("BEGIN:VEVENT", `UID:job-${j.id}@mad-river-cleaning-co`, `DTSTAMP:${dtstamp}`);
    if (/^\d{2}:\d{2}$/.test(j.scheduled_time || "")) {
      const start = nyToUtc(j.scheduled_date, j.scheduled_time);
      const end = new Date(start.getTime() + Math.max(15, Number(j.duration_minutes) || 60) * 60000);
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${j.scheduled_date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(j.scheduled_date, 1).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`);
    if (address) lines.push(`LOCATION:${esc(address)}`);
    lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ─── iCal reading (Google → app) ─────────────────────────────────────────────
/** Only Google Calendar iCal addresses are fetched, so the server can't be pointed anywhere else. */
export function normalizeGoogleIcalUrl(input: string): string {
  let raw = input.trim();
  if (/^webcals?:\/\//i.test(raw)) raw = raw.replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try { u = new URL(raw); } catch { fail(400, "That doesn't look like a link. Paste the full address from Google Calendar."); }
  if (u.protocol !== "https:" || u.hostname !== "calendar.google.com" || u.port || u.username || u.password)
    fail(400, "Use the Google Calendar address that starts with https://calendar.google.com/calendar/ical/");
  if (!/^\/calendar\/ical\/[^/]+\/[^/]+\/[^/]+\.ics$/.test(u.pathname))
    fail(400, "That's not an iCal address. In Google Calendar settings, copy “Secret address in iCal format”.");
  u.hash = "";
  return u.toString();
}
/** Something safe to show: the calendar's email-style id, never the secret part. */
export function calendarLabelFromUrl(url: string) {
  const id = decodeURIComponent(new URL(url).pathname.split("/")[3] || "");
  const visibility = new URL(url).pathname.split("/")[4] || "";
  return { calendarId: id, isPublicAddress: visibility === "public" };
}

export type ParsedEvent = { uid: string; title: string; location: string | null; allDay: boolean; start: string; end: string; startDay: string; endDay: string };

export function parseIcs(text: string, from: string, to: string): ParsedEvent[] {
  let root: any;
  try { root = new ICAL.Component(ICAL.parse(text)); } catch { fail(400, "Google sent something that isn't a calendar. Check the address and try again."); }
  if (root.name !== "vcalendar") fail(400, "Google sent something that isn't a calendar.");
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try { ICAL.TimezoneService.register(tz); } catch { /* ignore broken zones */ }
  }
  const vevents = root.getAllSubcomponents("vevent");
  const exceptions = new Map<string, any[]>();
  const masters: any[] = [];
  for (const v of vevents) {
    if (v.hasProperty("recurrence-id")) {
      const uid = String(v.getFirstPropertyValue("uid") || "");
      exceptions.set(uid, [...(exceptions.get(uid) || []), v]);
    } else masters.push(v);
  }
  const windowStart = ICAL.Time.fromDateString(from), windowEnd = ICAL.Time.fromDateString(addDays(to, 1));
  const out: ParsedEvent[] = [];
  const push = (uid: string, comp: any, start: any, end: any) => {
    if (String(comp.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") return;
    const title = String(comp.getFirstPropertyValue("summary") || "Busy").slice(0, 300);
    const location = comp.getFirstPropertyValue("location") ? String(comp.getFirstPropertyValue("location")).slice(0, 300) : null;
    if (start.isDate) {
      const s = start.toString().slice(0, 10);
      let e = end ? end.toString().slice(0, 10) : addDays(s, 1);
      if (e <= s) e = addDays(s, 1);
      const endDay = addDays(e, -1);
      if (endDay < from || s > to) return;
      out.push({ uid, title, location, allDay: true, start: s, end: e, startDay: s, endDay });
    } else {
      const sd = start.toJSDate() as Date;
      let ed = end ? end.toJSDate() as Date : new Date(sd.getTime() + 3600000);
      if (ed <= sd) ed = new Date(sd.getTime() + 60000);
      const startDay = nyDay(sd), endDay = nyDay(new Date(ed.getTime() - 1));
      if (endDay < from || startDay > to) return;
      out.push({ uid, title, location, allDay: false, start: sd.toISOString(), end: ed.toISOString(), startDay, endDay });
    }
  };
  for (const v of masters) {
    const uid = String(v.getFirstPropertyValue("uid") || "") || `noid-${out.length}`;
    let ev: any;
    try { ev = new ICAL.Event(v, { strictExceptions: false, exceptions: exceptions.get(uid) || [] }); } catch { continue; }
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) { push(uid, v, ev.startDate, ev.endDate); continue; }
    const it = ev.iterator();
    let next: any, guard = 0;
    while ((next = it.next()) && guard++ < 20000 && out.length < MAX_OCCURRENCES) {
      if (next.compare(windowEnd) >= 0) break;
      const occ = ev.getOccurrenceDetails(next);
      if (occ.endDate && occ.endDate.compare(windowStart) < 0) continue;
      push(`${uid}#${next.toString()}`, occ.item.component, occ.startDate, occ.endDate);
    }
  }
  // Exceptions whose master is missing still show up.
  const masterIds = new Set(masters.map(v => String(v.getFirstPropertyValue("uid") || "")));
  for (const [uid, list] of Array.from(exceptions)) if (!masterIds.has(uid)) for (const v of list) {
    const ev = new ICAL.Event(v); if (ev.startDate) push(`${uid}#${ev.startDate.toString()}`, v, ev.startDate, ev.endDate);
  }
  return out.slice(0, MAX_OCCURRENCES);
}

type Fetcher = (url: string) => Promise<string>;
export const defaultFetcher: Fetcher = async (url) => {
  let res: globalThis.Response;
  try { res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { Accept: "text/calendar" } }); }
  catch { fail(502, "Couldn't reach Google Calendar. Try again in a minute."); }
  if (res.status === 404 || res.status === 403 || res.status === 401)
    fail(400, "Google says that address doesn't work. It may have been reset — copy the secret iCal address again.");
  if (!res.ok) fail(502, `Google Calendar answered with an error (${res.status}). Try again later.`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_ICS_BYTES) fail(400, "That calendar is too large to import.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ICS_BYTES) fail(400, "That calendar is too large to import.");
  return buf.toString("utf8");
};
let fetcher: Fetcher = defaultFetcher;
/** Tests swap in a fake so they never call Google. */
export function setCalendarFetcher(f: Fetcher | null) { fetcher = f || defaultFetcher; }

const running = new Map<number, Promise<void>>();
function storeEvents(sourceId: number, events: ParsedEvent[]) {
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM calendar_events WHERE source_id=?").run(sourceId);
    const ins = sqlite.prepare("INSERT INTO calendar_events (source_id, uid, title, location, all_day, start_at, end_at, start_day, end_day) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const e of events) ins.run(sourceId, e.uid, e.title, e.location, e.allDay ? 1 : 0, e.start, e.end, e.startDay, e.endDay);
    sqlite.prepare("UPDATE calendar_sources SET last_synced_at=?, last_error=NULL, event_count=? WHERE id=?").run(now(), events.length, sourceId);
  })();
}
export function syncSource(sourceId: number): Promise<void> {
  const existing = running.get(sourceId);
  if (existing) return existing;
  const job = (async () => {
    const src = sqlite.prepare("SELECT * FROM calendar_sources WHERE id=?").get(sourceId) as any;
    if (!src) return;
    const today = nyDay(new Date());
    try {
      const events = parseIcs(await fetcher(src.url), addDays(today, -IMPORT_PAST_DAYS), addDays(today, IMPORT_FUTURE_DAYS));
      storeEvents(sourceId, events);
    } catch (e: any) {
      sqlite.prepare("UPDATE calendar_sources SET last_error=?, last_attempt_at=? WHERE id=?").run(String(e.message || "Sync failed").slice(0, 300), now(), sourceId);
      throw e;
    } finally {
      sqlite.prepare("UPDATE calendar_sources SET last_attempt_at=? WHERE id=?").run(now(), sourceId);
    }
  })().finally(() => running.delete(sourceId));
  running.set(sourceId, job);
  return job;
}
async function syncStale() {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const stale = sqlite.prepare("SELECT id FROM calendar_sources WHERE active=1 AND (last_attempt_at IS NULL OR last_attempt_at<?)").all(cutoff) as any[];
  await Promise.allSettled(stale.map(s => syncSource(s.id)));
}

const source = (r: any) => {
  const { calendarId, isPublicAddress } = calendarLabelFromUrl(r.url);
  return { id: r.id, name: r.name, color: r.color, calendarId, isPublicAddress, lastSyncedAt: r.last_synced_at, lastError: r.last_error, eventCount: r.event_count, createdAt: r.created_at };
};
const COLORS = ["#4285F4", "#0B8043", "#8E24AA", "#F4511E", "#F6BF26", "#039BE5"];
const sourceSchema = z.object({
  name: z.string().trim().min(1, "Give this calendar a name").max(80),
  url: z.string().trim().min(1, "Paste the secret iCal address").max(2000),
});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Public jobs feed. Must be registered BEFORE `protect()` — the token is the key. */
export function registerPublicCalendar(app: Express) {
  app.get("/api/calendar/feed/:file", (req, res) => {
    const token = String(req.params.file || "").replace(/\.ics$/i, "");
    if (!/^[a-f0-9]{48}$/.test(token)) return res.sendStatus(404);
    const feed = sqlite.prepare("SELECT id FROM calendar_feeds WHERE token_hash=? AND revoked_at IS NULL").get(sha(token)) as any;
    if (!feed) return res.sendStatus(404);
    sqlite.prepare("UPDATE calendar_feeds SET last_fetched_at=? WHERE id=?").run(now(), feed.id);
    res.set({ "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="mad-river-jobs.ics"',
      "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" });
    res.send(buildJobsFeed());
  });
}

export function registerCalendar(app: Express) {
  const activeFeed = () => sqlite.prepare("SELECT * FROM calendar_feeds WHERE revoked_at IS NULL ORDER BY id DESC LIMIT 1").get() as any;
  const feedOut = (r: any) => r ? { token: r.token, createdAt: r.created_at, createdBy: r.created_by, lastFetchedAt: r.last_fetched_at } : null;

  app.get("/api/calendar/feed", (_req, res) => res.json({ feed: feedOut(activeFeed()) }));
  // Create a link, or reset it: any older link stops working immediately.
  app.post("/api/calendar/feed", (_req, res) => {
    const token = randomBytes(24).toString("hex");
    sqlite.transaction(() => {
      sqlite.prepare("UPDATE calendar_feeds SET revoked_at=? WHERE revoked_at IS NULL").run(now());
      sqlite.prepare("INSERT INTO calendar_feeds (token, token_hash, created_at, created_by) VALUES (?,?,?,?)").run(token, sha(token), now(), actor(res));
    })();
    res.status(201).json({ feed: feedOut(activeFeed()) });
  });
  app.delete("/api/calendar/feed", (_req, res) => {
    sqlite.prepare("UPDATE calendar_feeds SET revoked_at=? WHERE revoked_at IS NULL").run(now());
    res.sendStatus(204);
  });

  app.get("/api/calendar/sources", (_req, res) => {
    res.json((sqlite.prepare("SELECT * FROM calendar_sources ORDER BY id").all() as any[]).map(source));
  });
  app.post("/api/calendar/sources", async (req, res) => {
    const parsed = sourceSchema.safeParse(req.body);
    if (!parsed.success) fail(400, parsed.error.issues[0]?.message || "Check the details and try again.");
    const url = normalizeGoogleIcalUrl(parsed.data.url);
    if (sqlite.prepare("SELECT 1 FROM calendar_sources WHERE url=?").get(url)) fail(409, "That calendar is already added.");
    // Read it once before saving, so a bad address never gets stored.
    const today = nyDay(new Date());
    const events = parseIcs(await fetcher(url), addDays(today, -IMPORT_PAST_DAYS), addDays(today, IMPORT_FUTURE_DAYS));
    const count = (sqlite.prepare("SELECT count(*) n FROM calendar_sources").get() as any).n;
    const info = sqlite.prepare("INSERT INTO calendar_sources (name, url, color, active, created_at, created_by) VALUES (?,?,?,1,?,?)")
      .run(parsed.data.name, url, COLORS[count % COLORS.length], now(), actor(res));
    const id = Number(info.lastInsertRowid);
    storeEvents(id, events);
    sqlite.prepare("UPDATE calendar_sources SET last_attempt_at=? WHERE id=?").run(now(), id);
    res.status(201).json(source(sqlite.prepare("SELECT * FROM calendar_sources WHERE id=?").get(id)));
  });
  app.post("/api/calendar/sources/:id/sync", async (req, res) => {
    const id = Number(req.params.id);
    if (!sqlite.prepare("SELECT 1 FROM calendar_sources WHERE id=?").get(id)) fail(404, "Calendar not found");
    await syncSource(id);
    res.json(source(sqlite.prepare("SELECT * FROM calendar_sources WHERE id=?").get(id)));
  });
  // Disconnects the calendar from this app only. Nothing in Google is touched.
  app.delete("/api/calendar/sources/:id", (req, res) => {
    const id = Number(req.params.id);
    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM calendar_events WHERE source_id=?").run(id);
      if (!sqlite.prepare("DELETE FROM calendar_sources WHERE id=?").run(id).changes) fail(404, "Calendar not found");
    })();
    res.sendStatus(204);
  });

  app.get("/api/calendar/events", async (req, res) => {
    const from = day.safeParse(req.query.from), to = day.safeParse(req.query.to);
    if (!from.success || !to.success || from.data > to.data) fail(400, "Pick a valid date range.");
    if (addDays(from.data, 120) < to.data) fail(400, "Pick a shorter date range.");
    await Promise.race([syncStale(), new Promise(r => setTimeout(r, 8000))]);
    const rows = sqlite.prepare(`SELECT e.*, s.name source_name, s.color FROM calendar_events e JOIN calendar_sources s ON s.id=e.source_id
      WHERE s.active=1 AND e.end_day>=? AND e.start_day<=? ORDER BY e.all_day DESC, e.start_at`).all(from.data, to.data) as any[];
    res.json(rows.map(r => ({ id: r.id, sourceId: r.source_id, sourceName: r.source_name, color: r.color, title: r.title, location: r.location,
      allDay: !!r.all_day, start: r.start_at, end: r.end_at, startDay: r.start_day, endDay: r.end_day })));
  });
}
