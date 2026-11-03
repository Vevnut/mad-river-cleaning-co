import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { registerRoutes } from "./routes";
import { errorHandler } from "./errors";
import { ensureMigrated } from "./migrations";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * The whole API as one Express app. Used by server/index.ts (local dev and plain Node hosting)
 * and server/vercel.ts (the Vercel function). Static pages are served separately by each.
 */
export async function createApp(): Promise<{ app: Express; httpServer: Server }> {
  const app = express();
  const httpServer = createServer(app);

  // The host serves the app through a reverse proxy. Without this, req.ip is the proxy's
  // address for every visitor, so all sign-ins share one rate-limit bucket.
  const trustProxy = process.env.TRUST_PROXY || "1";
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  // Stripe webhooks need the exact raw bytes to check their signature.
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      // Never log response bodies, passwords, invoice-link tokens, or session tokens.
      const shown = path.includes("/public/") ? "/api/public/[redacted]" : path.startsWith("/api/calendar/feed/") ? "/api/calendar/feed/[redacted]" : path;
      log(`${req.method} ${shown} ${res.statusCode} in ${Date.now() - start}ms`);
    });
    next();
  });

  // Bring the database up to date before the first request is handled (once per server instance).
  app.use("/api", async (_req, _res, next) => { await ensureMigrated(); next(); });

  await registerRoutes(httpServer, app);
  app.use(errorHandler);
  return { app, httpServer };
}
