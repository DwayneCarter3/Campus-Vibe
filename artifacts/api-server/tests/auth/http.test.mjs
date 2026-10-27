import { afterAll, beforeAll, expect, test } from "vitest";
import { fork } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { openFixture, initializeFixture, insertIdentity } from "./isolated-db.mjs";

let dir, child, base;
const student = "legacy@example.test", founder = "dwaynecartergabriel@gmail.com";
const password = "SafeTestPassword9";
const jar = new Map();

async function stop() {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.send("stop");
    await exited;
  }
}
async function start() {
  // Whitelist environment: inherited live Supabase credentials never reach worker.
  child = fork(resolve(dir, "worker.mjs"), [], { env: {
    PATH: process.env.PATH, NODE_ENV: "production",
    CAMPUSX_AUTH_TEST_DIR: resolve(dir, "db"),
    SUPABASE_URL: "https://isolated.invalid", SUPABASE_ANON_KEY: "test-only",
    SUPABASE_SERVICE_ROLE_KEY: "test-only", APP_URL: "https://isolated.invalid",
  }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const ready = await Promise.race([
    once(child, "message").then(([message]) => message),
    once(child, "exit").then(([code]) => { throw Error(`Isolated API exited before ready (${code})`); }),
  ]);
  base = `http://127.0.0.1:${ready.port}`;
}
async function request(path, { body, cookies = jar, headers = {}, origin } = {}) {
  const res = await fetch(`${base}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body !== undefined && { "content-type": "application/json" }),
      ...(cookies?.size && { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") }),
      ...(origin && { origin }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookies = res.headers.getSetCookie();
  if (cookies) for (const value of setCookies) {
    const [pair] = value.split(";");
    const [name, ...parts] = pair.split("=");
    if (/Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(value)) cookies.delete(name);
    else cookies.set(name, parts.join("="));
  }
  return { status: res.status, data: await res.json(), setCookies, headers: res.headers };
}
const login = (email, cookies = new Map()) => request("auth/login", { body: { email, password }, cookies });

beforeAll(async () => {
  await mkdir("generated-artifacts", { recursive: true });
  dir = await mkdtemp(resolve("generated-artifacts/auth-"));
  // External runtime packages resolve through the API's existing dependencies.
  await symlink(resolve("artifacts/api-server/node_modules"), resolve(dir, "node_modules"), "dir");
  const { pg } = await openFixture(resolve(dir, "db"));
  try {
    await initializeFixture(pg);
    for (const [email, confirmed] of [[student, true], [founder, true], ["unconfirmed@example.test", false]]) {
      await insertIdentity(pg, { id: randomUUID(), email, confirmed, password,
        metadata: { role: "CEO", is_admin: true } });
    }
    await pg.query("UPDATE public.users SET clerk_user_id='legacy-account' WHERE email=$1", [student]);
    await pg.query("INSERT INTO public.test_content(author_id,body) VALUES('legacy-account','original post')");
    await pg.query(`UPDATE public.users SET role='admin',is_admin=true WHERE email='unconfirmed@example.test'`);
    await pg.query(`INSERT INTO auth.test_sessions(access_token,refresh_token,auth_id)
      SELECT 'unconfirmed-test','unconfirmed-refresh',id FROM auth.users WHERE email='unconfirmed@example.test'`);
    const missing = randomUUID();
    await insertIdentity(pg, { id: missing, email: "missing-profile@example.test", password });
    await pg.query("DELETE FROM public.users WHERE supabase_user_id=$1", [missing]);
  } finally { await pg.close(); }
  await build({
    entryPoints: [resolve("artifacts/api-server/tests/auth/worker.mjs")],
    outfile: resolve(dir, "worker.mjs"), bundle: true, platform: "node", format: "esm",
    packages: "external",
    alias: {
      "drizzle-zod": resolve("lib/db/node_modules/drizzle-zod/index.mjs"),
      "@workspace/db": resolve("artifacts/api-server/tests/auth/worker-db.mjs"),
      "@supabase/supabase-js": resolve("artifacts/api-server/tests/auth/provider.mjs"),
    },
  });
  await start();
});
afterAll(async () => {
  await stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});

test.each([student, `  ${student.toUpperCase()}  `, "race@example.test", "hidden@example.test"])(
  "duplicate signup %s returns the exact 400 contract", async email => {
    const response = await request("auth/signup", { body: { email, password, fullName: "Test" }, cookies: null });
    expect(response.status).toBe(400);
    expect(response.data).toEqual({ error: "Account already exists. Please log in." });
    expect(response.setCookies).toEqual([]);
  });

test.each(["", "1234567", "x".repeat(129)])("signup rejects invalid password length", async value => {
  const response = await request("auth/signup", { body: { email: "new@example.test", password: value, fullName: "Test" }, cookies: null });
  expect(response.status).toBe(400);
  expect(response.data.error).toBe("Enter a valid email, name and password of at least 8 characters.");
});
test("signup minimum password succeeds but does not establish a session before confirmation", async () => {
  const response = await request("auth/signup", { body: { email: "new@example.test", password: "12345678", fullName: "Test" }, cookies: null });
  expect(response.status).toBe(201);
  expect(response.data.confirmationRequired).toBe(true);
  expect(response.setCookies).toEqual([]);
});
test("wrong password and unconfirmed identity never get login cookies", async () => {
  for (const [email, value, error] of [
    [student, "wrong", "Invalid email or password."],
    ["unconfirmed@example.test", password, "Please confirm your email before logging in."],
  ]) {
    const response = await request("auth/login", { body: { email, password: value }, cookies: null });
    expect(response.status).toBe(401);
    expect(response.data.error).toBe(error);
    expect(response.setCookies).toEqual([]);
  }
});
test("an unconfirmed identity with an admin row still cannot use protected routes or refresh", async () => {
  for (const path of ["auth/me", "test/ceo", "test/admin"]) {
    expect((await request(path, { cookies: null, headers: { authorization: "Bearer unconfirmed-test" } })).status).toBe(401);
  }
  const response = await request("auth/refresh", { body: { refresh_token: "unconfirmed-refresh" }, cookies: null });
  expect(response.status).toBe(503);
  expect(response.setCookies).toEqual([]);
});
test("a missing migrated profile fails closed rather than creating a replacement account", async () => {
  const response = await login("missing-profile@example.test");
  expect(response.status).toBe(503);
  expect(response.setCookies).toEqual([]);
});
test.each(["", "x".repeat(129)])("login rejects invalid password input", async value => {
  expect((await request("auth/login", { body: { email: student, password: value }, cookies: null })).status).toBe(400);
});
test.each(["", "1234567", "x".repeat(129)])("password update rejects invalid lengths", async value => {
  const response = await request("auth/update-password", { body: { password: value, access_token: "invalid" }, cookies: null });
  expect(response.status).toBe(400);
  expect(response.data.error).toBe("A valid recovery session and password of at least 8 characters are required.");
});
test("password update accepts a valid recovery session and requires a separate login", async () => {
  const cookies = new Map();
  const signup = await request("auth/signup", { body: { email: "password-update@example.test", password, fullName: "Test" }, cookies: null });
  expect(signup.status).toBe(201);
  // The student's verified session exercises the same update-password contract.
  const session = (await login(student, cookies)).data.session;
  const nextPassword = "x".repeat(128);
  const response = await request("auth/update-password", {
    cookies, body: { password: nextPassword, access_token: session.access_token, refresh_token: session.refresh_token },
  });
  expect(response.status).toBe(200);
  expect(cookies.size).toBe(0);
  expect((await request("auth/login", { body: { email: student, password }, cookies: null })).status).toBe(401);
  expect((await request("auth/login", { body: { email: student, password: nextPassword }, cookies: null })).status).toBe(200);
  // Restore only this disposable test student's password for the session checks.
  const restored = await request("auth/login", { body: { email: student, password: nextPassword }, cookies });
  expect((await request("auth/update-password", { cookies,
    body: { password, ...restored.data.session } })).status).toBe(200);
});
test("login sets persistent HTTP-only scoped cookies and preserves legacy identity", async () => {
  const response = await login(` ${student.toUpperCase()} `, jar);
  expect(response.status).toBe(200);
  expect(response.data.user).toMatchObject({ id: "legacy-account", role: "student" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.setCookies).toHaveLength(2);
  for (const value of response.setCookies) {
    expect(value).toContain("HttpOnly");
    expect(value).toContain("Secure");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Path=/api");
    expect(value).toContain("Expires=");
    expect(value).toContain(value.startsWith("campusx_refresh=") ? "Max-Age=2592000" : "Max-Age=3600");
  }
  expect((await request("auth/me")).data.user.id).toBe("legacy-account");
  expect((await request("test/content")).data).toEqual([{ body: "original post" }]);
  expect((await request("test/ceo")).status).toBe(403);
  expect((await request("test/admin")).status).toBe(403);
});
test("trusted CEO role is reconciled into refreshed token metadata, not the JWT transport role", async () => {
  const cookies = new Map();
  const response = await login(founder, cookies);
  expect(response.status).toBe(200);
  expect(response.data.user.role).toBe("CEO");
  const payload = JSON.parse(Buffer.from(response.data.session.access_token.split(".")[1], "base64url"));
  expect(payload.role).toBe("authenticated");
  expect(payload.app_metadata).toMatchObject({ role: "CEO", campusx_user_id: response.data.user.id });
  expect((await request("test/ceo", { cookies })).status).toBe(200);
  expect((await request("test/admin", { cookies })).status).toBe(200);
});
test("cookie sessions and refresh survive a real API process and isolated database restart", async () => {
  const cookies = new Map();
  const owner = await login(founder, cookies);
  const previousRefresh = jar.get("campusx_refresh");
  await stop();
  await start(); // New Node process, module cache, DB connection and auth client.
  expect((await request("auth/me")).data.user.id).toBe("legacy-account");
  expect((await request("test/content")).data).toEqual([{ body: "original post" }]);
  expect((await request("test/ceo", { cookies })).status).toBe(200);
  jar.delete("campusx_access"); // Browser's expired access cookie is absent.
  const response = await request("auth/refresh", { body: {} });
  expect(response.status).toBe(200);
  expect(response.data.user.id).toBe("legacy-account");
  expect(jar.get("campusx_refresh")).not.toBe(previousRefresh);
  cookies.delete("campusx_access");
  expect((await request("auth/refresh", { body: {}, cookies })).data.user).toMatchObject({ id: owner.data.user.id, role: "CEO" });
});
test("invalid token denies access; provider outage fails closed without pretending logout", async () => {
  expect((await request("auth/me", { cookies: null, headers: { authorization: "Bearer invalid" } })).status).toBe(401);
  expect((await request("test/ceo", { cookies: null, headers: { authorization: "Bearer provider-outage" } })).status).toBe(503);
  expect((await request("auth/refresh", { body: { refresh_token: "invalid" }, cookies: null })).status).toBe(401);
});
test("cross-origin auth mutation is rejected", async () => {
  expect((await request("auth/logout", { body: {}, origin: "https://attacker.invalid" })).status).toBe(403);
  expect((await request("auth/me")).status).toBe(200);
});
test("logout clears cookies and revokes the provider refresh session", async () => {
  const refreshToken = jar.get("campusx_refresh");
  const response = await request("auth/logout", { body: {} });
  expect(response.status).toBe(200);
  expect(response.data).toEqual({ ok: true });
  expect(response.setCookies).toHaveLength(2);
  for (const value of response.setCookies) {
    expect(value).toContain("Path=/api");
    expect(value).toContain("Expires=Thu, 01 Jan 1970");
  }
  expect(jar.size).toBe(0);
  expect((await request("auth/me")).status).toBe(401);
  expect((await request("auth/refresh", { body: { refresh_token: refreshToken }, cookies: null })).status).toBe(401);
});
