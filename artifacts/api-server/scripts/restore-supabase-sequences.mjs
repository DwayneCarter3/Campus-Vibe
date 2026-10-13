// Explicit external migration operation; source counters include deleted rows.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require=createRequire(new URL("../../../lib/db/package.json",import.meta.url));
const {Pool}=require("pg");
const pool=new Pool({connectionString:process.env.SUPABASE_DATABASE_URL});
const quote=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s)) throw Error("Unexpected sequence identifier");return `"${s}"`;};
try {
  const counters=JSON.parse(await readFile(process.argv[2],"utf8"));
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const marker=await client.query("SELECT to_regclass('auth.users') IS NOT NULL AND to_regclass('public.campusx_founder_identity') IS NOT NULL AS valid");
    if(!marker.rows[0].valid) throw Error("Destination is not the migrated external Supabase database.");
    for(const counter of counters) {
      quote(counter.name);
      const cols=await client.query("SELECT DISTINCT t.relname AS table_name,a.attname AS column_name FROM pg_depend d JOIN pg_attrdef f ON d.classid='pg_attrdef'::regclass AND f.oid=d.objid JOIN pg_class t ON t.oid=f.adrelid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=f.adnum WHERE d.refclassid='pg_class'::regclass AND d.refobjid=$1::regclass",[ `public.${counter.name}` ]);
      if(cols.rows.length!==1) throw Error(`Source sequence has no unique default-column dependency: ${counter.name}`);
      const {table_name,column_name}=cols.rows[0];
      const existing=await client.query(`SELECT coalesce(max(${quote(column_name)}),0)::text AS maximum FROM public.${quote(table_name)}`);
      const value=BigInt(counter.last_value)>BigInt(existing.rows[0].maximum)?counter.last_value:existing.rows[0].maximum;
      await client.query("SELECT setval($1::regclass,$2::bigint,$3)",[`public.${counter.name}`,value,counter.is_called||BigInt(existing.rows[0].maximum)>0n]);
    }
    await client.query("COMMIT");
    console.log("Source sequence history preserved without overwriting newer destination row IDs.");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}finally{await pool.end();}
