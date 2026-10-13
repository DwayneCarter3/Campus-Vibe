import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// CampusX has migrated. A missing Supabase connection must fail closed, never
// silently reconnect to the former database after a restart or republish.
const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be configured for CampusX.",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
