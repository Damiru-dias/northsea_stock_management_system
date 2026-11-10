import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(here, "..", "data");
fs.mkdirSync(dataDirectory, { recursive: true });

export const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(dataDirectory, "stock-management.db");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.transaction = (callback) => (...args) => {
  db.exec("BEGIN");
  try {
    const result = callback(...args);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
