// Vercel function for every /api/* request (see vercel.json). The Express app is
// bundled to dist/server.mjs by `npm run build`; its npm packages stay in node_modules.
import { handler } from "../dist/server.mjs";

export default handler;
