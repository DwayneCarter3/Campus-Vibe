// Simulated GoTrue boundary. No network access, keys, or real Supabase users.
// Provider sessions live in the isolated DB, outside the API process lifetime.
import { randomUUID } from "node:crypto";
import { pg } from "./worker-db.mjs";
import { insertIdentity } from "./isolated-db.mjs";

export function createClient() {
  let established;
  const failure = (code, status = 401) => ({ data: { user: null, session: null }, error: { code, status } });
  async function user(id) {
    const { rows } = await pg.query("SELECT * FROM auth.users WHERE id=$1 AND deleted_at IS NULL", [id]);
    const row = rows[0];
    return row && { id: row.id, email: row.email, email_confirmed_at: row.email_confirmed_at,
      app_metadata: row.raw_app_meta_data, user_metadata: row.raw_user_meta_data, identities: [{ id: row.id }] };
  }
  async function issue(id) {
    const identity = await user(id);
    const payload = { sub: id, role: "authenticated", app_metadata: identity.app_metadata };
    const access_token = `test.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${randomUUID()}`;
    const refresh_token = randomUUID();
    await pg.query("INSERT INTO auth.test_sessions(access_token,refresh_token,auth_id) VALUES($1,$2,$3)",
      [access_token, refresh_token, id]);
    return { data: { user: identity, session: { access_token, refresh_token,
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null };
  }
  const auth = {
    async getUser(token) {
      if (token === "provider-outage") return failure("unavailable", 503);
      const { rows } = await pg.query("SELECT auth_id FROM auth.test_sessions WHERE access_token=$1 AND NOT revoked", [token]);
      return rows[0] ? { data: { user: await user(rows[0].auth_id) }, error: null } : failure("bad_jwt");
    },
    async signInWithPassword({ email, password }) {
      const { rows } = await pg.query(`SELECT a.* FROM auth.users a JOIN auth.test_passwords p ON p.auth_id=a.id
        WHERE lower(btrim(a.email))=$1 AND p.password=$2 AND a.deleted_at IS NULL`, [email, password]);
      if (!rows[0]) return failure("invalid_credentials");
      if (!rows[0].email_confirmed_at) return failure("email_not_confirmed");
      return issue(rows[0].id);
    },
    async signUp({ email, password, options }) {
      // Include GoTrue race/obfuscated duplicate cases separately from DB preflight.
      if (email === "race@example.test") return failure("user_already_exists", 400);
      if (email === "hidden@example.test") return { data: { user: { identities: [] } }, error: null };
      const id = randomUUID();
      await insertIdentity(pg, { id, email, password, metadata: options.data, confirmed: false });
      return { data: { user: await user(id) }, error: null };
    },
    async refreshSession({ refresh_token }) {
      const { rows } = await pg.query("SELECT auth_id FROM auth.test_sessions WHERE refresh_token=$1 AND NOT revoked", [refresh_token]);
      if (!rows[0]) return failure("refresh_token_not_found");
      await pg.query("UPDATE auth.test_sessions SET revoked=true WHERE refresh_token=$1", [refresh_token]);
      return issue(rows[0].auth_id);
    },
    async setSession({ access_token }) {
      const result = await auth.getUser(access_token);
      established = access_token;
      return result;
    },
    async updateUser({ password }) {
      const result = await auth.getUser(established);
      if (result.error) return result;
      await pg.query("UPDATE auth.test_passwords SET password=$1 WHERE auth_id=$2", [password, result.data.user.id]);
      return result;
    },
    async signOut() { return auth.admin.signOut(established); },
    async resetPasswordForEmail() { return { error: null }; },
    admin: {
      async signOut(token) {
        await pg.query(`UPDATE auth.test_sessions SET revoked=true WHERE auth_id IN
          (SELECT auth_id FROM auth.test_sessions WHERE access_token=$1)`, [token]);
        return { error: null };
      },
    },
  };
  return { auth };
}
