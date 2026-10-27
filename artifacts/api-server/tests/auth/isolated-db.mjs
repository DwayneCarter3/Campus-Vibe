import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";
import { usersTable } from "../../../../lib/db/src/schema/users";

export { usersTable };

export async function openFixture(path) {
  const pg = new PGlite(path);
  await pg.waitReady;
  const db = drizzle(pg);
  return { pg, db };
}

export async function initializeFixture(pg) {
  const dialect = new PgDialect();
  const quote = name => `"${name.replaceAll('"', '""')}"`;
  const columns = getTableConfig(usersTable).columns.map(column => {
    let ddl = `${quote(column.name)} ${column.getSQLType()}`;
    if (column.primary) ddl += " PRIMARY KEY";
    if (column.notNull) ddl += " NOT NULL";
    if (column.isUnique) ddl += " UNIQUE";
    if (column.default !== undefined) {
      const value = column.default;
      ddl += ` DEFAULT ${value?.getSQL ? dialect.sqlToQuery(value).sql
        : typeof value === "string" ? `'${value.replaceAll("'", "''")}'` : String(value)}`;
    }
    return ddl;
  });
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}',
      deleted_at timestamptz
    );
    CREATE TABLE public.users (${columns.join(",")});
    CREATE TABLE public.test_content (
      id serial PRIMARY KEY, author_id text REFERENCES public.users(clerk_user_id), body text
    );
    CREATE TABLE auth.test_passwords (auth_id uuid PRIMARY KEY, password text NOT NULL);
    CREATE TABLE auth.test_sessions (
      access_token text PRIMARY KEY, refresh_token text UNIQUE,
      auth_id uuid REFERENCES auth.users(id), revoked boolean DEFAULT false
    );
  `);
  // Execute the unmodified migration and real PL/pgSQL triggers in PostgreSQL.
  await pg.exec(await readFile(new URL("../../supabase/identity.sql", import.meta.url), "utf8"));
}

export async function insertIdentity(pg, { id, email, confirmed = true, password = "SafeTestPassword9", metadata = {} }) {
  await pg.query(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    VALUES ($1,$2,$3,$4)`, [id, email, confirmed ? new Date().toISOString() : null, JSON.stringify(metadata)]);
  await pg.query("INSERT INTO auth.test_passwords VALUES ($1,$2)", [id, password]);
}
