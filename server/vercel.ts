import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app";

// Vercel function: one Express app per warm instance, built on the first request.
// Bundled to dist/server.cjs by `npm run build` and loaded by api/index.js.
let ready: ReturnType<typeof createApp> | null = null;

export async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= createApp().catch((err) => { ready = null; throw err; });
  const { app } = await ready;
  return app(req as any, res as any);
}
