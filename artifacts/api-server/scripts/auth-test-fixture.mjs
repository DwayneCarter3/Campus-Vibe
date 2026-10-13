// Explicit, disposable authentication fixture; never run by app startup/publish.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../lib/db/package.json",import.meta.url));
const { Pool } = require("pg");
const pool = new Pool({connectionString:process.env.SUPABASE_DATABASE_URL});
const auth = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const path="/tmp/campusx-auth-test.json";
try {
  if(process.argv[2]==="cleanup") {
    const fixture=JSON.parse(await readFile(path,"utf8"));
    const stableId=`supabase:${fixture.authId}`;
    await pool.query("DELETE FROM public.messages WHERE conversation_id IN (SELECT id FROM public.conversations WHERE participant1_id=$1 OR participant2_id=$1)",[stableId]);
    await pool.query("DELETE FROM public.conversations WHERE participant1_id=$1 OR participant2_id=$1",[stableId]);
    const scope=Object.keys(JSON.parse(await readFile(process.argv[3],"utf8"))).filter(t=>t!=="users"&&t!=="messages"&&t!=="conversations");
    const children=await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) AND udt_name IN('text','varchar') AND column_name LIKE '%\\_id' ESCAPE '\\'",[scope]);
    for(const row of children.rows) {
      if(!/^[a-z_][a-z0-9_]*$/.test(row.table_name)||!/^[a-z_][a-z0-9_]*$/.test(row.column_name)) throw Error("Unexpected cleanup identifier.");
      await pool.query(`DELETE FROM public."${row.table_name}" WHERE "${row.column_name}"=$1`,[stableId]);
    }
    await pool.query("DELETE FROM public.users WHERE supabase_user_id=$1 AND email=$2",[fixture.authId,fixture.email]);
    const deleted=await auth.auth.admin.deleteUser(fixture.authId);
    if(deleted.error) throw Error("Fixture cleanup rejected.");
    await unlink(path);
    console.log("Disposable authentication account removed.");
  } else {
    const email=`campusx-auth-${randomUUID()}@example.com`;
    const password=randomBytes(24).toString("base64url");
    const created=await auth.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{fullName:"CampusX Auth Test"}});
    if(created.error) throw Error("Could not create test identity.");
    const account=created.data.user;
    const base=process.env.APP_URL;
    const recovery=await auth.auth.admin.generateLink({type:"recovery",email,options:{redirectTo:`${base}/reset-password`}});
    if(recovery.error) throw Error("Recovery link generation failed.");
    const dev=process.env.REPLIT_DEV_DOMAIN && `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const devRecovery=await auth.auth.admin.generateLink({type:"recovery",email,options:{redirectTo:`${dev}/reset-password`}});
    await writeFile(path,JSON.stringify({email,password,authId:account.id,
      recoveryLink:devRecovery.data?.properties?.action_link ?? null}),{mode:0o600});
    console.log("Disposable account created; credentials kept only in temporary test fixture.");
    console.log("Production recovery redirect accepted:",recovery.data.properties.redirect_to===`${base}/reset-password`);
    console.log("Preview recovery redirect accepted:",devRecovery.data?.properties?.redirect_to===`${dev}/reset-password`);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const owner=await client.query("UPDATE public.users SET role='student',is_admin=false WHERE upper(role)='CEO' RETURNING role,is_admin");
      console.log("Database prevents CEO downgrade:",owner.rows.length===1&&owner.rows[0].role==="CEO"&&owner.rows[0].is_admin===true);
      await client.query("SAVEPOINT escalation");
      let prevented=false;
      try {await client.query("UPDATE public.users SET matric_number='23110591126',role='CEO' WHERE supabase_user_id=$1",[account.id]);}
      catch(e){prevented=e.code==="23514";await client.query("ROLLBACK TO SAVEPOINT escalation");}
      console.log("Database rejects founder matric impersonation:",prevented);
      const metadata=await client.query("SELECT count(*)::int AS n FROM auth.users a JOIN public.users u ON u.supabase_user_id=a.id WHERE u.role='CEO' AND a.raw_app_meta_data->>'role'='CEO'");
      console.log("CEO token metadata matches database:",metadata.rows[0].n===1);
      await client.query("ROLLBACK");
    } finally {client.release();}
  }
} finally {await pool.end();}
