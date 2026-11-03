import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Postgres (Neon in production) access for the raw-SQL modules.
 *
 * Keeps the shape the code had with better-sqlite3 — `?` or `@name` placeholders,
 * get / all / run — but every call is async. `db.tx(fn)` runs fn in one transaction;
 * any db call made inside it (even in helpers) joins that transaction automatically.
 *
 * Postgres errors are rewritten to the SQLite-style codes the app already handles
 * (SQLITE_CONSTRAINT_UNIQUE / _FOREIGNKEY / _NOTNULL / _CHECK), so error messages,
 * DeleteConflictError and the error handler keep working unchanged.
 */

// int8 (counts, sums of bigint, ids) and numeric come back as strings by default.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)) as any);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)) as any);

export type Row = Record<string, any>;
type Params = any[] | [Record<string, any>];
type Queryable = pg.Pool | pg.PoolClient;

let pool: pg.Pool | null = null;
export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Point it at the Postgres (Neon) database.");
  // Small pool: serverless functions each hold their own; Neon's pooled endpoint fans in.
  // PG_POOL_MAX=1 for the in-process test database, which serves one connection at a time.
  pool = new pg.Pool({ connectionString, max: Number(process.env.PG_POOL_MAX) || (process.env.VERCEL ? 3 : 10), idleTimeoutMillis: 10000 });
  pool.on("error", (err) => console.error("Postgres pool error:", err.message));
  return pool;
}
export async function closePool() { if (pool) { const p = pool; pool = null; await p.end(); } }

const txClient = new AsyncLocalStorage<pg.PoolClient>();
const target = (): Queryable => txClient.getStore() ?? getPool();

const plainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);
// better-sqlite3 took 1/0 for booleans and undefined as null; keep that for the bigint flag columns.
const value = (v: any) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

/** Rewrites `?` (positional) or `@name` (named, reusable) placeholders to Postgres `$n`, skipping quoted text. */
export function toPg(sql: string, params: Params): [string, any[]] {
  const named = params.length === 1 && plainObject(params[0]) ? (params[0] as Record<string, any>) : null;
  const out: any[] = [];
  const index = new Map<string, number>();
  let text = "", i = 0, n = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') { // copy quoted text untouched
      const end = sql.indexOf(c, i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      text += sql.slice(i, stop); i = stop; continue;
    }
    if (!named && c === "?") { out.push(value(params[n++])); text += `$${out.length}`; i++; continue; }
    if (named && c === "@" && /[A-Za-z_]/.test(sql[i + 1] ?? "")) {
      const m = /^@([A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(i))!;
      const name = m[1];
      if (!index.has(name)) { out.push(value(named[name])); index.set(name, out.length); }
      text += `$${index.get(name)}`; i += m[0].length; continue;
    }
    text += c; i++;
  }
  if (!named && n !== params.length) throw new Error(`SQL expects ${n} values but got ${params.length}: ${sql.slice(0, 80)}`);
  return [text, out];
}

/** Gives Postgres constraint errors the SQLite codes and messages the app already understands. */
function translate(err: any): never {
  const cols = /Key \(([^)]+)\)/.exec(err?.detail ?? "")?.[1]?.split(",").map((s: string) => s.trim()) ?? (err?.column ? [err.column] : []);
  const where = (err?.table ? `${err.table}.` : "") + (cols[0] ?? err?.constraint ?? "");
  const map: Record<string, [string, string]> = {
    "23505": ["SQLITE_CONSTRAINT_UNIQUE", `UNIQUE constraint failed: ${cols.map((c: string) => `${err.table}.${c}`).join(", ") || where}`],
    "23503": ["SQLITE_CONSTRAINT_FOREIGNKEY", "FOREIGN KEY constraint failed"],
    "23502": ["SQLITE_CONSTRAINT_NOTNULL", `NOT NULL constraint failed: ${err?.table}.${err?.column}`],
    "23514": ["SQLITE_CONSTRAINT_CHECK", `CHECK constraint failed: ${err?.constraint}`],
  };
  const hit = map[err?.code];
  if (hit) throw Object.assign(new Error(hit[1]), { code: hit[0], pgCode: err.code, constraint: err.constraint, table: err.table, cause: err });
  throw err;
}

async function query(sql: string, params: Params): Promise<pg.QueryResult> {
  const [text, values] = toPg(sql, params);
  try { return await target().query(text, values); } catch (err) { translate(err); }
}

export const db = {
  /** All rows. */
  async all(sql: string, ...params: Params): Promise<Row[]> { return (await query(sql, params)).rows; },
  /** First row, or undefined. */
  async get(sql: string, ...params: Params): Promise<Row | undefined> { return (await query(sql, params)).rows[0]; },
  /** INSERT/UPDATE/DELETE. `changes` is the number of rows affected; add RETURNING to get rows back. */
  async run(sql: string, ...params: Params): Promise<{ changes: number; rows: Row[] }> {
    const r = await query(sql, params);
    return { changes: r.rowCount ?? 0, rows: r.rows };
  },
  /** INSERT that returns the new row's id (the old lastInsertRowid). */
  async insertId(sql: string, ...params: Params): Promise<number> {
    const r = await query(/\breturning\b/i.test(sql) ? sql : `${sql} RETURNING id`, params);
    return Number(r.rows[0]?.id);
  },
  /** Several statements with no values (schema changes). */
  async exec(sql: string): Promise<void> {
    try { await target().query(sql); } catch (err) { translate(err); }
  },
  /** Runs fn in a transaction; commits if it resolves, rolls back if it throws. Nested calls join the outer one. */
  async tx<T>(fn: () => Promise<T>): Promise<T> {
    if (txClient.getStore()) return fn();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await txClient.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
  /** True while running inside db.tx. */
  inTx: () => !!txClient.getStore(),
};
export type Db = typeof db;
