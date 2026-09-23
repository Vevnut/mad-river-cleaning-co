import type { Express } from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { sqlite } from "./storage";
import { z } from "zod";

export const organizationId = (sqlite.prepare("SELECT id FROM organization WHERE singleton=1").get() as any).id;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const passwordHash = (password: string, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const credentials = z.object({ email: z.string().email().transform(s => s.toLowerCase()), password: z.string().min(12).max(128) });
const attempts = new Map<string, { count: number; reset: number }>();

export function registerAuth(app: Express) {
  app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.get("/api/auth/status", (_req, res) => res.json({
    setupRequired: !(sqlite.prepare("SELECT 1 FROM auth_users LIMIT 1").get()),
    setupAvailable: Boolean(process.env.AUTH_SETUP_TOKEN),
  }));
  app.post("/api/auth/:action", (req, res) => {
    const key = req.ip || "unknown";
    const entry = attempts.get(key) || { count: 0, reset: Date.now() + 900000 };
    if (Date.now() > entry.reset) { entry.count = 0; entry.reset = Date.now() + 900000; }
    if (++entry.count > 20) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    attempts.set(key, entry);
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email and a password of 12–128 characters." });
    const { email, password } = parsed.data;
    if (req.params.action === "setup") {
      const expected = process.env.AUTH_SETUP_TOKEN;
      if (!expected || hash(String(req.body.setupToken || "")) !== hash(expected))
        return res.status(403).json({ message: "A valid server setup token is required." });
      if (sqlite.prepare("SELECT 1 FROM auth_users LIMIT 1").get())
        return res.status(409).json({ message: "Setup is already complete. Sign in instead." });
      sqlite.prepare("INSERT INTO auth_users VALUES (?,?,?,?,1)").run(randomUUID(), organizationId, email, passwordHash(password));
    } else if (req.params.action !== "login") return res.sendStatus(404);
    const user = sqlite.prepare("SELECT * FROM auth_users WHERE email=? AND active=1 AND organization_id=?").get(email, organizationId) as any;
    const stored = user?.password_hash || passwordHash("invalid-password");
    const [salt, digest] = stored.split(":");
    const matches = timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(passwordHash(password, salt).split(":")[1], "hex"));
    if (!user || !matches) return res.status(401).json({ message: "Email or password is incorrect." });
    const token = randomBytes(32).toString("hex");
    sqlite.prepare("DELETE FROM auth_sessions WHERE expires_at<?").run(Date.now());
    sqlite.prepare("INSERT INTO auth_sessions VALUES (?,?,?)").run(hash(token), user.id, Date.now() + 12 * 3600000);
    attempts.delete(key);
    res.json({ token, email, organizationId });
  });
  // Dedicated organization database: every private route belongs to its immutable
  // organization. Membership is checked at the perimeter for ALL legacy and new APIs.
  // Public invoice capabilities and the signed webhook are mounted BEFORE this gate.
}

export function protect(app: Express) {
  app.use("/api", (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const user = sqlite.prepare(`SELECT u.id,u.email,u.organization_id FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND u.organization_id=?`).get(hash(token), Date.now(), organizationId) as any;
    if (!user) return res.status(401).json({ message: "Sign in to your business workspace." });
    res.locals.user = user;
    next();
  });
  app.post("/api/logout", (req, res) => {
    sqlite.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hash(req.headers.authorization!.replace(/^Bearer /, "")));
    res.sendStatus(204);
  });
  app.post("/api/team", (req, res) => {
    const { email, password } = credentials.parse(req.body);
    sqlite.prepare("INSERT INTO auth_users VALUES (?,?,?,?,1)").run(randomUUID(), organizationId, email, passwordHash(password));
    res.status(201).json({ email });
  });
}
