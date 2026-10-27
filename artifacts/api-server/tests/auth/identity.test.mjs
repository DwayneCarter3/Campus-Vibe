import { afterAll, beforeAll, beforeEach, afterEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { openFixture, initializeFixture, insertIdentity } from "./isolated-db.mjs";

let pg;
beforeAll(async () => {
  ({ pg } = await openFixture());
  await initializeFixture(pg);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec("BEGIN"); });
afterEach(async () => { await pg.exec("ROLLBACK"); });

const founderEmail = "dwaynecartergabriel@gmail.com";
const founderMatric = "23110591126";
async function profile(id) {
  return (await pg.query("SELECT * FROM public.users WHERE supabase_user_id=$1", [id])).rows[0];
}
async function rejects(sql, params) {
  await pg.exec("SAVEPOINT rejected_change");
  try {
    await expect(pg.query(sql, params)).rejects.toMatchObject({ code: "23514" });
  } finally {
    await pg.exec("ROLLBACK TO SAVEPOINT rejected_change");
  }
}

test("unconfirmed founder identity cannot claim CEO; confirmation binds it permanently", async () => {
  const id = randomUUID();
  await insertIdentity(pg, { id, email: founderEmail, confirmed: false,
    metadata: { role: "CEO", is_admin: true } });
  expect((await profile(id)).role).toBe("student");
  expect((await pg.query("SELECT * FROM campusx_founder_identity")).rows).toHaveLength(0);
  await pg.query("UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1", [id]);
  expect(await profile(id)).toMatchObject({ role: "CEO", is_admin: true });
  expect((await pg.query("SELECT auth_id FROM campusx_founder_identity")).rows).toEqual([{ auth_id: id }]);
});

test("CEO role, admin flag, binding and trusted metadata survive repeated attempted downgrades", async () => {
  const id = randomUUID();
  await insertIdentity(pg, { id, email: founderEmail });
  for (const role of ["student", "admin", "ceo"]) {
    await pg.query("UPDATE public.users SET role=$1,is_admin=false WHERE supabase_user_id=$2", [role, id]);
    expect(await profile(id)).toMatchObject({ role: "CEO", is_admin: true });
    const metadata = (await pg.query("SELECT raw_app_meta_data FROM auth.users WHERE id=$1", [id])).rows[0].raw_app_meta_data;
    expect(metadata).toMatchObject({ role: "CEO", campusx_user_id: `supabase:${id}` });
  }
});

test("confirmed bound founder retains authority after an email change", async () => {
  const id = randomUUID();
  await insertIdentity(pg, { id, email: founderEmail });
  await pg.query("UPDATE auth.users SET email='changed-owner@example.test' WHERE id=$1", [id]);
  expect(await profile(id)).toMatchObject({ role: "CEO", is_admin: true, email: "changed-owner@example.test" });
  expect((await pg.query("SELECT auth_id FROM campusx_founder_identity")).rows[0].auth_id).toBe(id);
});

test("loss of current confirmation removes CEO authority even for the bound identity", async () => {
  const id = randomUUID();
  await insertIdentity(pg, { id, email: founderEmail });
  await pg.query("UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1", [id]);
  expect(await profile(id)).toMatchObject({ role: "student", is_admin: false });
});

test("editable role and metadata never grant CEO to a student", async () => {
  const id = randomUUID();
  await insertIdentity(pg, { id, email: "student@example.test",
    metadata: { role: "CEO", matric_number: founderMatric, email: founderEmail, is_admin: true } });
  await pg.query("UPDATE public.users SET role='CEO',is_admin=true WHERE supabase_user_id=$1", [id]);
  expect(await profile(id)).toMatchObject({ role: "student", is_admin: false, matric_number: "" });
  expect((await pg.query("SELECT raw_app_meta_data FROM auth.users WHERE id=$1", [id])).rows[0].raw_app_meta_data.role).toBe("student");
});

test("reserved founder matric cannot be used before or after a founder binding", async () => {
  const student = randomUUID();
  await insertIdentity(pg, { id: student, email: "student@example.test" });
  for (const bound of [false, true]) {
    if (bound) await insertIdentity(pg, { id: randomUUID(), email: founderEmail });
    await rejects("UPDATE public.users SET matric_number=$1,role='CEO' WHERE supabase_user_id=$2", [founderMatric, student]);
    expect((await profile(student)).matric_number).toBe("");
  }
});

test("reserved founder email cannot be claimed by another auth identity after binding", async () => {
  const founder = randomUUID(), student = randomUUID();
  await insertIdentity(pg, { id: founder, email: founderEmail });
  await insertIdentity(pg, { id: student, email: "student@example.test" });
  await rejects("UPDATE public.users SET email=$1 WHERE supabase_user_id=$2", [founderEmail, student]);
  await rejects("UPDATE auth.users SET email=$1 WHERE id=$2", [founderEmail, student]);
  expect((await pg.query("SELECT auth_id FROM campusx_founder_identity")).rows[0].auth_id).toBe(founder);
});

test("legacy account and content ownership remain stable when auth identity is reconciled", async () => {
  const id = randomUUID();
  await insertIdentity(pg, { id, email: "legacy@example.test" });
  await pg.query("UPDATE public.users SET clerk_user_id='legacy-account' WHERE supabase_user_id=$1", [id]);
  await pg.query("INSERT INTO public.test_content(author_id,body) VALUES('legacy-account','original post')");
  const before = await profile(id);
  for (let i = 0; i < 3; i++) {
    await pg.query("UPDATE auth.users SET email='legacy-new@example.test',email_confirmed_at=now() WHERE id=$1", [id]);
  }
  expect(await profile(id)).toMatchObject({ id: before.id, registration_rank: before.registration_rank,
    clerk_user_id: "legacy-account", supabase_user_id: id });
  expect((await pg.query("SELECT * FROM public.users WHERE supabase_user_id=$1", [id])).rows).toHaveLength(1);
  expect((await pg.query("SELECT body FROM public.test_content WHERE author_id='legacy-account'")).rows).toEqual([{ body: "original post" }]);
  expect((await pg.query("SELECT raw_app_meta_data FROM auth.users WHERE id=$1", [id])).rows[0].raw_app_meta_data.campusx_user_id).toBe("legacy-account");
});

test("founder binding is not readable or writable by public client roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    const { rows } = await pg.query(`SELECT
      has_table_privilege($1,'public.campusx_founder_identity','SELECT') AS read,
      has_table_privilege($1,'public.campusx_founder_identity','UPDATE') AS write,
      has_function_privilege($1,'public.campusx_enforce_identity()','EXECUTE') AS execute`, [role]);
    expect(rows[0]).toEqual({ read: false, write: false, execute: false });
  }
});
