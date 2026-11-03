import "dotenv/config";
import { createApp, log } from "./app";
import { serveStatic } from "./static";

// Local development and plain Node hosting. On Vercel, server/vercel.ts is used instead.
(async () => {
  const { app, httpServer } = await createApp();

  // Only set up Vite in development, after the API routes, so its catch-all doesn't shadow them.
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  // reusePort isn't supported on Windows; it only matters on Linux hosts.
  httpServer.listen({ port, host: "0.0.0.0", ...(process.platform === "win32" ? {} : { reusePort: true }) }, () => {
    log(`serving on port ${port}`);
  });
})();
