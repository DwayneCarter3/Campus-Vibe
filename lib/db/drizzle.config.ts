import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error("SUPABASE_DATABASE_URL is required for CampusX.");
}
if (process.argv.includes("push")) {
  throw new Error("Direct schema pushes are disabled: use reviewed SQL migrations to preserve Supabase Auth, RLS, and founder identity enforcement.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.SUPABASE_DATABASE_URL,
  },
});
