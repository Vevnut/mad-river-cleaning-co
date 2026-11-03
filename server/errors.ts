import type { Request, Response, NextFunction } from "express";

// Friendly text for UNIQUE failures, keyed by the "table.column" SQLite names in the error.
const DUPLICATES: [string, string][] = [
  ["invoices.invoice_number", "This invoice number is already used. Choose a different number."],
  ["auth_users.email", "An account with this email already exists."],
  ["auth_users.staff_id", "This person already has a cleaner login."],
  ["auth_users.subcontractor_id", "This person already has a cleaner login."],
  ["property_services.", "This property already has that service."],
];

/** Last-resort API error handler. Shows people a clear message; full details go to the server log only. */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Errors thrown on purpose (fail(), http-errors) carry a status and a message meant for people.
  // Anything without one is an unexpected crash, and its raw text stays out of the response.
  let status = err.status || err.statusCode || 500;
  // Server-side (5xx) errors always get the generic text, even if they carry a status.
  let message = (err.status || err.statusCode) && status < 500 ? err.message : "Something went wrong. Please try again.";
  // Postgres errors arrive either through server/db.ts (already given SQLite-style codes) or from
  // Drizzle, which wraps the driver error. Give both the codes the messages below expect.
  const pg = err.cause && /^\d{5}$/.test(String(err.cause.code)) ? err.cause : /^\d{5}$/.test(String(err.code)) ? err : null;
  const PG_CODES: Record<string, string> = { "23505": "SQLITE_CONSTRAINT_UNIQUE", "23503": "SQLITE_CONSTRAINT_FOREIGNKEY", "23502": "SQLITE_CONSTRAINT_NOTNULL", "23514": "SQLITE_CONSTRAINT_CHECK" };
  if (pg && PG_CODES[pg.code]) {
    const cols = /Key \(([^)]+)\)/.exec(pg.detail ?? "")?.[1]?.split(",").map((c: string) => `${pg.table}.${c.trim()}`).join(", ");
    err = Object.assign(new Error(cols ? `UNIQUE constraint failed: ${cols}` : pg.message), { code: PG_CODES[pg.code] });
  }
  const code = String(err.code || "");
  if (err.name === "ZodError") {
    status = 400;
    message = err.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ");
  } else if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
    status = 409;
    message = DUPLICATES.find(([column]) => String(err.message).includes(column))?.[1] ?? "This already exists.";
  } else if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
    // Safety net for raw foreign-key violations that weren't turned into a clearer error upstream.
    status = 409;
    message = req.method === "DELETE" || req.path.endsWith("/delete")
      ? "This item is still linked to other records, so it can't be deleted. Remove or reassign those first."
      : "A linked record (such as the customer, property or job) no longer exists. Refresh and try again.";
  } else if (code.startsWith("SQLITE_CONSTRAINT")) {
    status = 400;
    message = "Some information is missing or not allowed. Check the form and try again.";
  }

  console.error(status >= 500 ? "Internal Server Error:" : `Request error (${status}):`, err);

  if (res.headersSent) return next(err);
  return res.status(status).json({ message });
}
