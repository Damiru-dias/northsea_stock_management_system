import { db, databasePath } from "./database/connection.js";
import { initializeSchema } from "./database/schema.js";
import { applyMigrations } from "./database/migrations.js";
import { factories, sections, seedDatabase } from "./database/seed.js";

initializeSchema(db);
applyMigrations(db);
seedDatabase(db);

export { db, databasePath, factories, sections };
