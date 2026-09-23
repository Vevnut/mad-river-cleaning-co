import "dotenv/config";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { migrate } from "../server/migrations";

const db = new Database(process.env.DATABASE_PATH || "data.db");
if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()) {
  db.close();
  throw new Error("Database already has tables. Refusing to initialize or overwrite existing data.");
}
db.exec(readFileSync(new URL("../schema-baseline.sql", import.meta.url), "utf8"));
db.pragma("foreign_keys=ON");
migrate(db);
db.close();
console.log("Created an empty database and applied additive migrations. No demo records or user accounts added.");
