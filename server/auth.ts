import type { Express } from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { sqlite } from "./storage";
import { z } from "zod";

export const organizationId = (sqlite.prepare("SELECT id FROM organization WHERE singleton=1").get() as any).id;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const passwordHash = (password: string, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const limitAttempt = sqlite.transaction((key: string, max: number) => {
  const time = Date.now();
  sqlite.prepare("DELETE FROM auth_rate_limits WHERE resets_at<?").run(time);
  sqlite.prepare(`INSERT INTO auth_rate_limits VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1`).run(key, time + 900000);
  return (sqlite.prepare("SELECT count FROM auth_rate_limits WHERE key=?").get(key) as any).count <= max;
});
// Per visitor IP (needs `trust proxy` in server/index.ts), plus a looser per-account
// limit so rotating or spoofed IPs can't guess one password without bound.
const IP_ATTEMPTS = 20, ACCOUNT_ATTEMPTS = 50;

export const credentials = z.object({ email: z.string().email().transform(s => s.toLowerCase()), password: z.string().min(12).max(128) });
/** Owner accounts have full access; cleaner accounts are linked to one staff member or subcontractor. */
export function createAccount(email: string, password: string, cleaner?: { staffId?: number | null; subcontractorId?: number | null }) {
  const id = randomUUID();
  sqlite.prepare(`INSERT INTO auth_users (id,organization_id,email,password_hash,active,role,staff_id,subcontractor_id)
    VALUES (?,?,?,?,1,?,?,?)`).run(id, organizationId, email, passwordHash(password),
    cleaner ? "cleaner" : "owner", cleaner?.staffId ?? null, cleaner?.subcontractorId ?? null);
  return id;
}
/** New password for an account; signs it out everywhere. */
export function setPassword(userId: string, password: string) {
  sqlite.prepare("UPDATE auth_users SET password_hash=? WHERE id=?").run(passwordHash(password), userId);
  endSessions(userId);
}
export const endSessions = (userId: string) => sqlite.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(userId);

export function registerAuth(app: Express) {
  app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.get("/api/auth/status", (_req, res) => res.json({
    setupRequired: !(sqlite.prepare("SELECT 1 FROM auth_users LIMIT 1").get()),
    setupAvailable: Boolean(process.env.AUTH_SETUP_TOKEN_HASH || process.env.AUTH_SETUP_TOKEN),
  }));
  app.post("/api/auth/:action", (req, res) => {
    const key = hash(req.ip || "unknown");
    if (!limitAttempt(key, IP_ATTEMPTS)) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email and a password of 12–128 characters." });
    const { email, password } = parsed.data;
    const accountKey = hash(`account:${email}`);
    if (!limitAttempt(accountKey, ACCOUNT_ATTEMPTS)) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    if (req.params.action === "setup") {
      const expected = process.env.AUTH_SETUP_TOKEN_HASH || (process.env.AUTH_SETUP_TOKEN ? hash(process.env.AUTH_SETUP_TOKEN) : "");
      const provided = hash(String(req.body.setupToken || ""));
      if (!/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex")))
        return res.status(403).json({ message: "A valid server setup token is required." });
      if (sqlite.prepare("SELECT 1 FROM auth_users LIMIT 1").get())
        return res.status(409).json({ message: "Setup is already complete. Sign in instead." });
      createAccount(email, password);
    } else if (req.params.action !== "login") return res.sendStatus(404);
    // A cleaner whose staff or subcontractor record is turned off can't sign in.
    const user = sqlite.prepare(`SELECT * FROM auth_users u WHERE u.email=? AND u.active=1 AND u.organization_id=?
      AND (u.role='owner' OR EXISTS (SELECT 1 FROM staff st WHERE st.id=u.staff_id AND st.active=1)
        OR EXISTS (SELECT 1 FROM subcontractors sc WHERE sc.id=u.subcontractor_id AND sc.active=1))`).get(email, organizationId) as any;
    const stored = user?.password_hash || passwordHash("invalid-password");
    const [salt, digest] = stored.split(":");
    const matches = timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(passwordHash(password, salt).split(":")[1], "hex"));
    if (!user || !matches) return res.status(401).json({ message: "Email or password is incorrect." });
    const token = randomBytes(32).toString("hex");
    sqlite.prepare("DELETE FROM auth_sessions WHERE expires_at<?").run(Date.now());
    sqlite.prepare("INSERT INTO auth_sessions VALUES (?,?,?)").run(hash(token), user.id, Date.now() + 12 * 3600000);
    sqlite.prepare("DELETE FROM auth_rate_limits WHERE key IN (?,?)").run(key, accountKey);
    res.json({ token, email, organizationId, role: user.role });
  });
  // Dedicated organization database: every private route belongs to its immutable
  // organization. Membership is checked at the perimeter for ALL legacy and new APIs.
  // Public invoice capabilities and the signed webhook are mounted BEFORE this gate.
}

export function protect(app: Express) {
  app.use("/api", (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const user = sqlite.prepare(`SELECT u.id,u.email,u.organization_id,u.role,u.staff_id,u.subcontractor_id FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND u.organization_id=?
      AND (u.role='owner' OR EXISTS (SELECT 1 FROM staff st WHERE st.id=u.staff_id AND st.active=1)
        OR EXISTS (SELECT 1 FROM subcontractors sc WHERE sc.id=u.subcontractor_id AND sc.active=1))`).get(hash(token), Date.now(), organizationId) as any;
    if (!user) return res.status(401).json({ message: "Sign in to your business workspace." });
    res.locals.user = user;
    // Cleaner accounts only ever reach their own jobs (server/cleaner.ts) and sign-out.
    // Everything else — customers, prices, invoices, expenses, settings — is owner-only.
    if (user.role !== "owner" && !(req.path.startsWith("/cleaner/") || req.path === "/logout"))
      return res.status(403).json({ message: "This part of the app is for the office. Open My jobs instead." });
    next();
  });
  app.post("/api/logout", (req, res) => {
    sqlite.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hash(req.headers.authorization!.replace(/^Bearer /, "")));
    res.sendStatus(204);
  });
  app.post("/api/team", (req, res) => {
    const { email, password } = credentials.parse(req.body);
    createAccount(email, password);
    res.status(201).json({ email });
  });
}

/** Sign out every cleaner login linked to a staff member or subcontractor (used when they're turned off). */
export function endLinkedSessions(link: { staffId?: number; subcontractorId?: number }) {
  sqlite.prepare(`DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE role='cleaner'
    AND ((? IS NOT NULL AND staff_id=?) OR (? IS NOT NULL AND subcontractor_id=?)))`)
    .run(link.staffId ?? null, link.staffId ?? null, link.subcontractorId ?? null, link.subcontractorId ?? null);
}
