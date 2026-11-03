import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createServer } from "node:net";

const freePort = () => new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const port = (s.address() as any).port; s.close(() => resolve(port)); });
});

/**
 * A fresh in-process Postgres (PGlite) for one test file: migrated and filled with the demo
 * seed, with DATABASE_URL pointing at it. Call before importing anything from server/.
 * No installed database or network needed; nothing real is ever touched.
 */
export async function startTestDatabase() {
  const port = await freePort();
  const pglite = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pglite, port, host: "127.0.0.1" });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/postgres`;
  process.env.PG_POOL_MAX = "1";
  const quiet = console.log;
  console.log = () => {};
  try { await (await import("../script/seed")).seedDemo(); } finally { console.log = quiet; }
  return {
    async stop() {
      await (await import("../server/db")).closePool();
      await server.stop();
      await pglite.close();
    },
  };
}
