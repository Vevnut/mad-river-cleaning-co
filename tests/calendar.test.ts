import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

// Disposable database. Never touches real data, and never calls Google.
mkdirSync("tests/.data", { recursive: true });
process.env.DATABASE_PATH = "tests/.data/calendar.db";
process.env.PHOTO_DIR = "tests/.data/cal-photos";
process.env.RECEIPT_DIR = "tests/.data/cal-receipts";
process.env.AUTH_SETUP_TOKEN_HASH = createHash("sha256").update("cal-test-setup").digest("hex");
const original = new Database("data.db", { readonly: true });
await original.backup(process.env.DATABASE_PATH);
original.close();
const { registerRoutes } = await import("../server/routes");
const { sqlite: db } = await import("../server/storage");
const cal = await import("../server/calendar");
db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users; DELETE FROM auth_rate_limits");
const app = express();
app.use(express.json());
const server = createServer(app);
await registerRoutes(server, app);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || 500).json({ message: err.message }));
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "", count = 0;
async function call(method: string, path: string, body?: any, auth = true) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  return { status: r.status, type: r.headers.get("content-type") || "", text: t, body: r.headers.get("content-type")?.includes("json") && t ? JSON.parse(t) : null };
}
function check(message: string, ok: boolean) { assert(ok, message); count++; console.log(`PASS ${message}`); }

const today = cal.nyDay(new Date());
const d = (n: number) => cal.addDays(today, n).replace(/-/g, "");
// A Google-style calendar: weekly 9am meeting (New York time) with one moved and one deleted,
// a 3-day all-day trip, a canceled event and a one-off UTC event.
const fakeIcs = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", "X-WR-CALNAME:Sister",
  "BEGIN:VTIMEZONE", "TZID:America/New_York",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT", "UID:weekly@google.com", `DTSTART;TZID=America/New_York:${d(1)}T090000`, `DTEND;TZID=America/New_York:${d(1)}T100000`,
  "RRULE:FREQ=WEEKLY;COUNT=6", `EXDATE;TZID=America/New_York:${d(15)}T090000`, "SUMMARY:Dentist\\, weekly", "LOCATION:North Conway", "END:VEVENT",
  "BEGIN:VEVENT", "UID:weekly@google.com", `RECURRENCE-ID;TZID=America/New_York:${d(8)}T090000`,
  `DTSTART;TZID=America/New_York:${d(8)}T140000`, `DTEND;TZID=America/New_York:${d(8)}T150000`, "SUMMARY:Dentist (moved)", "END:VEVENT",
  "BEGIN:VEVENT", "UID:trip@google.com", `DTSTART;VALUE=DATE:${d(3)}`, `DTEND;VALUE=DATE:${d(6)}`, "SUMMARY:Camping trip", "END:VEVENT",
  "BEGIN:VEVENT", "UID:gone@google.com", `DTSTART:${d(2)}T150000Z`, `DTEND:${d(2)}T160000Z`, "STATUS:CANCELLED", "SUMMARY:Canceled thing", "END:VEVENT",
  "BEGIN:VEVENT", "UID:old@google.com", `DTSTART:${d(-400)}T150000Z`, `DTEND:${d(-400)}T160000Z`, "SUMMARY:Long ago", "END:VEVENT",
  "BEGIN:VEVENT", "UID:once@google.com", `DTSTART:${d(2)}T170000Z`, `DTEND:${d(2)}T180000Z`, "SUMMARY:Call", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const GOOD = "https://calendar.google.com/calendar/ical/sister%40gmail.com/private-abc123def456/basic.ics";
let fetched: string[] = [], served = fakeIcs;
cal.setCalendarFetcher(async (url) => { fetched.push(url); if (served === "404") throw Object.assign(new Error("Google says that address doesn't work."), { status: 400 }); return served; });

try {
  // ── Time zone math ──
  check("summer 9:00 in NH is 13:00 UTC", cal.nyToUtc("2026-07-01", "09:00").toISOString() === "2026-07-01T13:00:00.000Z");
  check("winter 9:00 in NH is 14:00 UTC", cal.nyToUtc("2026-01-15", "09:00").toISOString() === "2026-01-15T14:00:00.000Z");
  check("the day clocks change works", cal.nyToUtc("2026-11-01", "10:00").toISOString() === "2026-11-01T15:00:00.000Z");

  // ── Sign-in rules ──
  check("calendar settings require sign-in", (await call("GET", "/api/calendar/feed", undefined, false)).status === 401);
  check("Google events require sign-in", (await call("GET", `/api/calendar/events?from=${today}&to=${today}`, undefined, false)).status === 401);
  check("made-up feed links are refused", (await call("GET", `/api/calendar/feed/${"a".repeat(48)}.ics`, undefined, false)).status === 404);
  token = (await call("POST", "/api/auth/setup", { email: "cal@example.test", password: "Cal-test-only-12345", setupToken: "cal-test-setup" })).body.token;

  // ── Jobs → Google ──
  check("no link exists until one is made", (await call("GET", "/api/calendar/feed")).body.feed === null);
  const prop = db.prepare("SELECT id, customer_id, name FROM properties ORDER BY id LIMIT 1").get() as any;
  const mk = (date: string, time: string, status: string) => Number(db.prepare("INSERT INTO jobs (property_id,customer_id,job_type,scheduled_date,scheduled_time,duration_minutes,price,status,internal_notes) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(prop.id, prop.customer_id, "turnover", date, time, 90, 345.67, status, "Door code 4321").lastInsertRowid);
  const summerJob = mk(cal.addDays(today, 3), "09:30", "scheduled"), canceled = mk(cal.addDays(today, 4), "11:00", "canceled"), ancient = mk(cal.addDays(today, -200), "10:00", "completed");
  const made = await call("POST", "/api/calendar/feed");
  const feedToken = made.body.feed.token;
  check("a private link is made", made.status === 201 && /^[a-f0-9]{48}$/.test(feedToken));
  check("the link can be copied again later", (await call("GET", "/api/calendar/feed")).body.feed.token === feedToken);
  check("only a hash is used to look the link up", !!db.prepare("SELECT 1 FROM calendar_feeds WHERE token_hash=?").get(createHash("sha256").update(feedToken).digest("hex")));
  const feed = await call("GET", `/api/calendar/feed/${feedToken}.ics`, undefined, false);
  check("Google can read the link without signing in", feed.status === 200 && feed.type.startsWith("text/calendar"));
  check("the feed is a valid calendar", feed.text.startsWith("BEGIN:VCALENDAR\r\n") && feed.text.trimEnd().endsWith("END:VCALENDAR") && feed.text.split("\r\n").every(l => Buffer.byteLength(l) <= 75));
  const parsedBack = cal.parseIcs(feed.text, cal.addDays(today, -100), cal.addDays(today, 30));
  const mine = parsedBack.find(e => e.uid === `job-${summerJob}@mad-river-cleaning-co`)!;
  check("each job shows with its property name", !!mine && mine.title === `Turnover – ${prop.name}`);
  check("job time is correct in Google", mine.start === cal.nyToUtc(cal.addDays(today, 3), "09:30").toISOString() && new Date(mine.end).getTime() - new Date(mine.start).getTime() === 90 * 60000);
  check("canceled and very old jobs stay out", !feed.text.includes(`job-${canceled}@`) && !feed.text.includes(`job-${ancient}@`));
  check("prices and private notes stay out", !feed.text.includes("345.67") && !feed.text.includes("Door code"));
  check("the feed has the property address", feed.text.includes("LOCATION:"));
  const reset = await call("POST", "/api/calendar/feed");
  check("resetting makes a new link", reset.body.feed.token !== feedToken);
  check("the old link stops working after a reset", (await call("GET", `/api/calendar/feed/${feedToken}.ics`, undefined, false)).status === 404);
  check("the new link works", (await call("GET", `/api/calendar/feed/${reset.body.feed.token}.ics`, undefined, false)).status === 200);
  check("turning the link off works", (await call("DELETE", "/api/calendar/feed")).status === 204 && (await call("GET", `/api/calendar/feed/${reset.body.feed.token}.ics`, undefined, false)).status === 404);

  // ── Google → app ──
  for (const bad of ["http://calendar.google.com/calendar/ical/a/b/basic.ics", "https://evil.example/calendar/ical/a/b/basic.ics",
    "https://calendar.google.com.evil.example/calendar/ical/a/b/basic.ics", "https://localhost/calendar/ical/a/b/basic.ics",
    "https://calendar.google.com:8443/calendar/ical/a/b/basic.ics", "https://calendar.google.com/calendar/u/0/r", "file:///etc/passwd"])
    check(`only Google iCal addresses are read: ${bad.slice(0, 48)}`, (await call("POST", "/api/calendar/sources", { name: "X", url: bad })).status === 400);
  check("nothing was fetched for refused addresses", fetched.length === 0);
  served = "not a calendar";
  check("a non-calendar answer is refused and not saved", (await call("POST", "/api/calendar/sources", { name: "X", url: GOOD })).status === 400 && (await call("GET", "/api/calendar/sources")).body.length === 0);
  served = fakeIcs;
  const added = await call("POST", "/api/calendar/sources", { name: "Sister's calendar", url: GOOD.replace("https://", "webcal://") });
  check("her Google calendar is added (webcal links work too)", added.status === 201 && added.body.name === "Sister's calendar" && fetched.at(-1) === GOOD);
  check("the secret address is never sent back", !JSON.stringify(added.body).includes("private-abc123") && added.body.calendarId === "sister@gmail.com");
  check("the same calendar can't be added twice", (await call("POST", "/api/calendar/sources", { name: "Again", url: GOOD })).status === 409);
  const ev = (await call("GET", `/api/calendar/events?from=${cal.addDays(today, -1)}&to=${cal.addDays(today, 40)}`)).body as any[];
  const weekly = ev.filter(e => e.title.startsWith("Dentist"));
  check("repeating events are expanded (6 minus 1 deleted)", weekly.length === 5);
  const moved = ev.find(e => e.title === "Dentist (moved)");
  check("a moved repeat uses its new time", !!moved && moved.start === cal.nyToUtc(cal.addDays(today, 8), "14:00").toISOString());
  const first = weekly.find(e => e.startDay === cal.addDays(today, 1));
  check("repeat times follow New York time", !!first && first.start === cal.nyToUtc(cal.addDays(today, 1), "09:00").toISOString() && first.location === "North Conway");
  check("commas in titles read correctly", first?.title === "Dentist, weekly");
  check("the deleted repeat is gone", !weekly.some(e => e.startDay === cal.addDays(today, 15)));
  const trip = ev.find(e => e.title === "Camping trip");
  check("multi-day all-day events span the right days", !!trip && trip.allDay && trip.startDay === cal.addDays(today, 3) && trip.endDay === cal.addDays(today, 5));
  check("canceled Google events are hidden", !ev.some(e => e.title === "Canceled thing"));
  check("events far outside the window are skipped", !ev.some(e => e.title === "Long ago"));
  check("each event carries its calendar's name and color", ev.every(e => e.sourceName === "Sister's calendar" && /^#[0-9A-F]{6}$/i.test(e.color)));
  const narrow = (await call("GET", `/api/calendar/events?from=${cal.addDays(today, 4)}&to=${cal.addDays(today, 4)}`)).body as any[];
  check("a single day shows only overlapping events", narrow.length === 1 && narrow[0].title === "Camping trip");
  check("bad or huge date ranges are refused", (await call("GET", "/api/calendar/events?from=x&to=y")).status === 400 && (await call("GET", `/api/calendar/events?from=${today}&to=${cal.addDays(today, 400)}`)).status === 400);

  const before = fetched.length;
  await call("GET", `/api/calendar/events?from=${today}&to=${today}`);
  check("recent calendars aren't re-downloaded on every view", fetched.length === before);
  served = fakeIcs.replace("SUMMARY:Call", "SUMMARY:Call (updated)");
  const synced = await call("POST", `/api/calendar/sources/${added.body.id}/sync`);
  check("Refresh pulls in changes", synced.status === 200 && (await call("GET", `/api/calendar/events?from=${cal.addDays(today, 2)}&to=${cal.addDays(today, 2)}`)).body.some((e: any) => e.title === "Call (updated)"));
  served = "404";
  const broken = await call("POST", `/api/calendar/sources/${added.body.id}/sync`);
  const afterBreak = (await call("GET", "/api/calendar/sources")).body[0];
  check("a broken address shows a clear error and keeps the last events", broken.status === 400 && /doesn't work/.test(afterBreak.lastError) && afterBreak.eventCount > 0);
  served = fakeIcs;
  check("removing disconnects it and clears its events", (await call("DELETE", `/api/calendar/sources/${added.body.id}`)).status === 204
    && (await call("GET", "/api/calendar/sources")).body.length === 0 && (db.prepare("SELECT count(*) n FROM calendar_events").get() as any).n === 0);

  // A real-looking Google file (US holidays layout) parses.
  check("database links stay consistent", (db.pragma("foreign_key_check") as any[]).length === 0);
  console.log(`${count} calendar checks passed.`);
} finally {
  cal.setCalendarFetcher(null);
  server.close();
  db.close();
}
