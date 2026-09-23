import { randomBytes, createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Local bootstrap helper only. Refuses to overwrite server configuration.
if (existsSync(".env")) throw new Error("Server configuration already exists; refusing to replace it.");
const token = randomBytes(32).toString("hex");
writeFileSync(".env", `DATABASE_PATH=data.db\nAUTH_SETUP_TOKEN_HASH=${createHash("sha256").update(token).digest("hex")}\n`, { mode: 0o600, flag: "wx" });
const guide = `# Mad River Cleaning Co. Private First-Time Setup

Keep this file private. It contains the one-time setup code for the updated preview, not a password or a payment-provider key.

## Open the secured preview

1. Open [Mad River Cleaning Co. preview](https://www.perplexity.ai/computer/a/mad-river-cleaning-co-DrBH7zpHQS2co7zFGiHt.Q).
2. On the first-time setup screen, enter your email address and choose a password of at least 12 characters.
3. Enter this setup code:

\`\`\`text
${token}
\`\`\`

4. Create the account. The setup code stops working as soon as the first account exists.
5. For your sister, use Settings → Payments & Access → Add trusted workspace account. Share her password privately.

Every workspace account has full access to this business. A client invoice link exposes only that invoice, not the workspace. Refreshing the app signs you out, so retain your chosen password in a password manager.

This secures the updated preview only. The previously published live app has not been republished and does not yet have these access controls. Do not use the old live app for sensitive information while it remains unauthenticated.

Email sending and online payment are disabled until server credentials are configured. Do not send this setup file to clients or include it in the public app.
`;
const destination = resolve("../Mad-River-Private-Setup.md");
writeFileSync(destination, guide, { mode: 0o600, flag: "wx" });
console.log("Created private server configuration and first-time access guide outside the app. No secret printed.");
