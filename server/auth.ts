import type { Express } from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { db } from "./db";
import { z } from "zod";

// The workspace's one organization (created by the first migration). Looked up once.
let orgId: Promise<string> | null = null;
export function organizationId(): Promise<string> {
  return (orgId ??= db.get("SELECT id FROM organization WHERE singleton=1").then((r) => {
    if (!r) { orgId = null; throw new Error("No organization row. Run the migrations first."); }
    return String(r.id);
  }));
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const passwordHash = (password: string, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
/** Counts one attempt for `key` in a 15-minute window; false once there have been more than `max`. */
async function limitAttempt(key: string, max: number): Promise<boolean> {
  const time = Date.now();
  return db.tx(async () => {
    await db.run("DELETE FROM auth_rate_limits WHERE resets_at<?", time);
    // One atomic statement, so simultaneous requests can't both slip under the limit.
    const r = await db.get(`INSERT INTO auth_rate_limits VALUES (?,1,?)
      ON CONFLICT (key) DO UPDATE SET count = auth_rate_limits.count + 1 RETURNING count`, key, time + 900000);
    return Number(r!.count) <= max;
  });
}
// Per visitor IP (needs `trust proxy` in server/index.ts), plus a looser per-account
// limit so rotating or spoofed IPs can't guess one password without bound.
const IP_ATTEMPTS = 20, ACCOUNT_ATTEMPTS = 50;
const SESSION_MS = 12 * 3600000, REMEMBERED_SESSION_MS = 30 * 24 * 3600000;
// "Keep me signed in" lives in an HttpOnly cookie, so page scripts can never read the saved token.
// It is only ever used by GET /api/auth/resume (same-site only); every other request needs the Bearer header.
const CREW_COOKIE = "mrcc_crew";
const crewCookie = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge });
const readCookie = (header: string | undefined, name: string) => {
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); // tokens are plain hex
  }
  return "";
};
// Cleaner logins only work while their staff or subcontractor record is active.
const LINKED_ACTIVE = `(EXISTS (SELECT 1 FROM staff st WHERE st.id=u.staff_id AND st.active=1)
  OR EXISTS (SELECT 1 FROM subcontractors sc WHERE sc.id=u.subcontractor_id AND sc.active=1))`;

export const credentials = z.object({ email: z.string().email().transform(s => s.toLowerCase()), password: z.string().min(12).max(128) });
/** Owner accounts have full access; cleaner accounts are linked to one staff member or subcontractor. */
export async function createAccount(email: string, password: string, cleaner?: { staffId?: number | null; subcontractorId?: number | null }) {
  const id = randomUUID();
  await db.run(`INSERT INTO auth_users (id,organization_id,email,password_hash,active,role,staff_id,subcontractor_id)
    VALUES (?,?,?,?,1,?,?,?)`, id, await organizationId(), email, passwordHash(password),
    cleaner ? "cleaner" : "owner", cleaner?.staffId ?? null, cleaner?.subcontractorId ?? null);
  return id;
}
/** New password for an account; signs it out everywhere. */
export async function setPassword(userId: string, password: string) {
  await db.run("UPDATE auth_users SET password_hash=? WHERE id=?", passwordHash(password), userId);
  await endSessions(userId);
}
export const endSessions = (userId: string) => db.run("DELETE FROM auth_sessions WHERE user_id=?", userId);

/** Re-checks a signed-in user's password before a sensitive action (rate limited per user). */
export async function confirmPassword(userId: string, password: unknown, purpose: string): Promise<"ok" | "wrong" | "limited"> {
  if (!(await limitAttempt(hash(`${purpose}:${userId}`), 10))) return "limited";
  const user = await db.get("SELECT password_hash FROM auth_users WHERE id=? AND active=1", userId);
  if (!user || typeof password !== "string" || password.length > 128) return "wrong";
  const [salt, digest] = String(user.password_hash).split(":");
  const ok = timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(passwordHash(password, salt).split(":")[1], "hex"));
  if (ok) await db.run("DELETE FROM auth_rate_limits WHERE key=?", hash(`${purpose}:${userId}`));
  return ok ? "ok" : "wrong";
}

export function registerAuth(app: Express) {
  app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.get("/api/auth/status", async (_req, res) => {
    // The business name and phone are already printed on every invoice; the sign-in
    // page shows them so a cleaner who forgot their password knows who to call.
    const s = await db.get("SELECT business_name, business_phone FROM app_settings ORDER BY id LIMIT 1");
    res.json({
      setupRequired: !(await db.get("SELECT 1 FROM auth_users LIMIT 1")),
      setupAvailable: Boolean(process.env.AUTH_SETUP_TOKEN_HASH || process.env.AUTH_SETUP_TOKEN),
      businessName: s?.business_name || "Mad River Cleaning Co.", businessPhone: s?.business_phone || "",
    });
  });
  // Picks up a cleaner's "Keep me signed in" session from the HttpOnly cookie after the app reopens.
  app.get("/api/auth/resume", async (req, res) => {
    const token = readCookie(req.headers.cookie, CREW_COOKIE);
    const live = /^[a-f0-9]{64}$/.test(token) && await db.get(`SELECT 1 FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.role='cleaner' AND u.active=1 AND u.organization_id=? AND ${LINKED_ACTIVE}`,
      hash(token), Date.now(), await organizationId());
    if (!live) { res.clearCookie(CREW_COOKIE, { ...crewCookie(0), maxAge: undefined }); return res.status(204).send(); }
    res.json({ token });
  });
  app.post("/api/auth/:action", async (req, res) => {
    const key = hash(req.ip || "unknown");
    if (!(await limitAttempt(key, IP_ATTEMPTS))) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email and a password of 12–128 characters." });
    const { email, password } = parsed.data;
    const accountKey = hash(`account:${email}`);
    if (!(await limitAttempt(accountKey, ACCOUNT_ATTEMPTS))) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    const org = await organizationId();
    if (req.params.action === "setup") {
      const expected = process.env.AUTH_SETUP_TOKEN_HASH || (process.env.AUTH_SETUP_TOKEN ? hash(process.env.AUTH_SETUP_TOKEN) : "");
      const provided = hash(String(req.body.setupToken || ""));
      if (!/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex")))
        return res.status(403).json({ message: "A valid server setup token is required." });
      if (await db.get("SELECT 1 FROM auth_users LIMIT 1"))
        return res.status(409).json({ message: "Setup is already complete. Sign in instead." });
      await createAccount(email, password);
    } else if (req.params.action !== "login") return res.sendStatus(404);
    // A cleaner whose staff or subcontractor record is turned off can't sign in.
    const user = await db.get(`SELECT * FROM auth_users u WHERE u.email=? AND u.active=1 AND u.organization_id=?
      AND (u.role='owner' OR ${LINKED_ACTIVE})`, email, org);
    const stored = user?.password_hash || passwordHash("invalid-password");
    const [salt, digest] = stored.split(":");
    const matches = timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(passwordHash(password, salt).split(":")[1], "hex"));
    if (!user || !matches) return res.status(401).json({ message: "Email or password is incorrect." });
    const token = randomBytes(32).toString("hex");
    // "Keep me signed in on this phone" is for cleaner logins only; owner sessions stay short.
    const remembered = user.role === "cleaner" && req.body.remember === true;
    const expiresAt = Date.now() + (remembered ? REMEMBERED_SESSION_MS : SESSION_MS);
    await db.run("DELETE FROM auth_sessions WHERE expires_at<?", Date.now());
    await db.run("INSERT INTO auth_sessions VALUES (?,?,?)", hash(token), user.id, expiresAt);
    await db.run("DELETE FROM auth_rate_limits WHERE key IN (?,?)", key, accountKey);
    if (remembered) res.cookie(CREW_COOKIE, token, crewCookie(REMEMBERED_SESSION_MS));
    else res.clearCookie(CREW_COOKIE, { ...crewCookie(0), maxAge: undefined });
    res.json({ token, email, organizationId: org, role: user.role, remembered, expiresAt });
  });
  // Dedicated organization database: every private route belongs to its immutable
  // organization. Membership is checked at the perimeter for ALL legacy and new APIs.
  // Public invoice capabilities and the signed webhook are mounted BEFORE this gate.
}

export function protect(app: Express) {
  app.use("/api", async (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const user = await db.get(`SELECT u.id,u.email,u.organization_id,u.role,u.staff_id,u.subcontractor_id FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND u.organization_id=?
      AND (u.role='owner' OR ${LINKED_ACTIVE})`, hash(token), Date.now(), await organizationId());
    if (!user) return res.status(401).json({ message: "Sign in to your business workspace." });
    res.locals.user = user;
    // Cleaner accounts only ever reach their own jobs (server/cleaner.ts) and sign-out.
    // Everything else — customers, prices, invoices, expenses, settings — is owner-only.
    if (user.role !== "owner" && !(req.path.startsWith("/cleaner/") || req.path === "/logout" || req.path === "/session"))
      return res.status(403).json({ message: "This part of the app is for the office. Open My jobs instead." });
    next();
  });
  // Who a saved session belongs to, so a cleaner who kept themselves signed in skips the sign-in page.
  app.get("/api/session", (_req, res) => res.json({ email: res.locals.user.email, role: res.locals.user.role }));
  app.post("/api/logout", async (req, res) => {
    await db.run("DELETE FROM auth_sessions WHERE token_hash=?", hash(req.headers.authorization!.replace(/^Bearer /, "")));
    res.clearCookie(CREW_COOKIE, { ...crewCookie(0), maxAge: undefined });
    res.sendStatus(204);
  });
  app.post("/api/team", async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    await createAccount(email, password);
    res.status(201).json({ email });
  });
}

/** Sign out every cleaner login linked to a staff member or subcontractor (used when they're turned off). */
export async function endLinkedSessions(link: { staffId?: number; subcontractorId?: number }) {
  await db.run(`DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE role='cleaner'
    AND ((@staff::bigint IS NOT NULL AND staff_id=@staff) OR (@sub::bigint IS NOT NULL AND subcontractor_id=@sub)))`,
    { staff: link.staffId ?? null, sub: link.subcontractorId ?? null });
}
