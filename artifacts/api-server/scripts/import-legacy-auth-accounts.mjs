// Explicit migration only: include legacy accounts that never finished onboarding.
import { clerkClient } from "@clerk/express";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
const require=createRequire(new URL("../../../lib/db/package.json",import.meta.url));
const {Pool}=require("pg");
const pool=new Pool({connectionString:process.env.SUPABASE_DATABASE_URL});
const auth=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
try {
  let imported=0,offset=0;
  for (;;) {
    const page=await clerkClient.users.getUserList({limit:100,offset});
    for(const legacy of page.data) {
      const primary=legacy.emailAddresses.find(e=>e.id===legacy.primaryEmailAddressId);
      if(!primary) throw Error("Legacy account has no primary email; manual reconciliation required.");
      const email=primary.emailAddress.trim().toLowerCase();
      const existing=await pool.query("SELECT u.clerk_user_id FROM auth.users a LEFT JOIN public.users u ON u.supabase_user_id=a.id WHERE lower(a.email)=$1 AND a.deleted_at IS NULL",[email]);
      if(existing.rows.length) {
        if(existing.rows[0].clerk_user_id!==legacy.id) throw Error("Existing email identity mismatch; refusing to merge unrelated accounts.");
        continue;
      }
      const fullName=[legacy.firstName,legacy.lastName].filter(Boolean).join(" ")||legacy.username||"CampusX Student";
      const created=await auth.auth.admin.createUser({
        email,password:randomBytes(48).toString("base64url"),
        email_confirm:primary.verification?.status==="verified",
        user_metadata:{fullName},app_metadata:{legacy_clerk_user_id:legacy.id,legacy_created_at:legacy.createdAt},
      });
      if(created.error) throw Error(`Legacy account import rejected: ${created.error.code??"provider error"}`);
      const updated=await pool.query("UPDATE public.users SET clerk_user_id=$1,full_name=$2,avatar_url=$3 WHERE supabase_user_id=$4 RETURNING id",[legacy.id,fullName,legacy.imageUrl,created.data.user.id]);
      if(updated.rowCount!==1) throw Error("Legacy account profile trigger failed.");
      imported++;
    }
    offset+=page.data.length;
    if(offset>=page.totalCount) break;
  }
  console.log("Additional legacy accounts preserved:",imported,"No source accounts deleted or passwords copied.");
}finally{await pool.end();}
