// Explicit external-database migration. Never called by build/start/publish hooks.
// Usage: node scripts/migrate-supabase.mjs /tmp/pg-dump-schema.sql /tmp/production-data.json
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { clerkClient } from "@clerk/express";
const require = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = require("pg");
const [schemaPath, dataPath, sequencePath] = process.argv.slice(2);
if (!schemaPath || !dataPath || !sequencePath) throw new Error("Explicit source schema, production rows, and sequence-state snapshots required.");
const data = JSON.parse(await readFile(dataPath,"utf8"));
// Use pg_dump schema-only output, not Drizzle's lossy CHECK-expression export.
// Keep the pre-existing Supabase public schema and unrelated tables intact.
const schema = (await readFile(schemaPath,"utf8"))
  .replace(/^CREATE SCHEMA public;$/gm,"")
  .replace(/^\\.*$/gm,"");
const pool = new Pool({connectionString:process.env.SUPABASE_DATABASE_URL,connectionTimeoutMillis:15000});
const supabase = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false},
});
const quote = s => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("Unexpected identifier");
  return `"${s}"`;
};
try {
  const client = await pool.connect();
  try {
    const target = await client.query("SELECT to_regclass('public.users') AS users");
    if (target.rows[0].users) throw new Error("Destination already has users; refusing to overwrite existing data.");
    await client.query("BEGIN");
    await client.query(schema);
    const foreignKeys = await client.query(`SELECT child.relname AS child,parent.relname AS parent
      FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
      JOIN pg_class parent ON parent.oid=c.confrelid WHERE c.contype='f'`);
    const remaining = new Set(Object.keys(data));
    const ordered=[];
    while(remaining.size) {
      const table=[...remaining].find(t=>!foreignKeys.rows.some(f=>f.child===t&&f.parent!==t&&remaining.has(f.parent)));
      if(!table) throw new Error("Cyclic table dependencies require a reviewed import order.");
      ordered.push(table);remaining.delete(table);
    }
    for(const table of ordered) {
      const rows=data[table];
      for(const row of rows) {
        const fields=Object.keys(row);
        await client.query(`INSERT INTO public.${quote(table)} (${fields.map(quote).join(",")}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(",")})`,
          fields.map(f=>row[f] && typeof row[f]==="object" ? JSON.stringify(row[f]) : row[f]));
      }
    }
    await client.query("ALTER TABLE public.users ADD COLUMN supabase_user_id uuid UNIQUE REFERENCES auth.users(id); ALTER TABLE public.users ADD COLUMN onboarded boolean NOT NULL DEFAULT true");
    // Preserve original serial ranks and IDs, then advance every serial sequence.
    const serials=await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval(%'");
    for(const {table_name:t,column_name:c} of serials.rows) {
      if(!Object.hasOwn(data,t)) continue;
      await client.query(`SELECT setval(pg_get_serial_sequence($1,$2),COALESCE((SELECT max(${quote(c)}) FROM public.${quote(t)}),1),(SELECT count(*)>0 FROM public.${quote(t)}))`,[`public.${t}`,c]);
    }
    for(const t of Object.keys(data)) {
      await client.query(`ALTER TABLE public.${quote(t)} ENABLE ROW LEVEL SECURITY`);
      await client.query(`REVOKE ALL ON public.${quote(t)} FROM anon, authenticated`);
    }
    await client.query("COMMIT");
    console.log("Copied production snapshot; source database left unchanged.");
    for(const profile of data.users) {
      if(profile.clerk_user_id.startsWith("system:") || !profile.email) continue;
      const oldIdentity = await clerkClient.users.getUser(profile.clerk_user_id);
      const primary=oldIdentity.emailAddresses.find(x=>x.id===oldIdentity.primaryEmailAddressId);
      if(primary?.verification?.status !== "verified" || primary.emailAddress.trim().toLowerCase() !== profile.email.trim().toLowerCase()) {
        throw new Error("Legacy identity requires manual verified reconciliation; refusing to confirm an unverified stored email.");
      }
      const created=await supabase.auth.admin.createUser({
        email:profile.email,password:randomBytes(48).toString("base64url"),email_confirm:true,
        user_metadata:{fullName:profile.full_name},
        app_metadata:{campusx_user_id:profile.clerk_user_id},
      });
      if(created.error) throw new Error("Supabase account migration rejected; review provider status without logging credentials.");
      await client.query("UPDATE public.users SET supabase_user_id=$1 WHERE id=$2",[created.data.user.id,profile.id]);
    }
    await client.query(await readFile(new URL("../supabase/identity.sql",import.meta.url),"utf8"));
    const restored = spawnSync(process.execPath, [
      new URL("./restore-supabase-sequences.mjs", import.meta.url).pathname, sequencePath,
    ], { stdio: "inherit" });
    if (restored.status !== 0) throw new Error("Sequence history restoration failed; do not switch the published app.");
    const accounts=spawnSync(process.execPath,[
      new URL("./import-legacy-auth-accounts.mjs",import.meta.url).pathname,
    ],{stdio:"inherit"});
    if(accounts.status!==0) throw new Error("Legacy authentication audit failed; do not publish yet.");
    for(const [table,rows] of Object.entries(data)) {
      const result=await client.query(`SELECT count(*)::int AS n FROM public.${quote(table)}`);
      if(table==="users" ? result.rows[0].n < rows.length : result.rows[0].n !== rows.length) throw new Error(`Row-count mismatch: ${table}`);
    }
    console.log("Migration verified: counts preserved, founder trigger installed, app tables protected by RLS.");
  } catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
  finally{client.release();}
} finally{await pool.end();}
