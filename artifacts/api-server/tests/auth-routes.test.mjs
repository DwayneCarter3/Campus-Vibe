import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import express from "express";

// Exercise the real router, replacing only external authentication/database
// dependencies. No accounts, recovery emails, or database records are created.
const result = await build({
  entryPoints: [fileURLToPath(new URL("../src/routes/auth.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  plugins: [{
    name: "isolated-auth-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /^(@workspace\/db|.*\/lib\/supabase-auth|.*\/middlewares\/auth)$/ },
        ({ path }) => ({ path, namespace: "auth-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "auth-fixture" }, ({ path }) => ({
        contents: path === "@workspace/db"
          ? `export const db = {execute: async () => {throw Error("Unexpected database write/read in fixture")}};`
          : path.endsWith("/middlewares/auth")
          ? `export function requireAuth(_req,res){res.status(401).json({error:"Unauthorized"});}`
          : `export const normalizeEmail = s => s.trim().toLowerCase();
             export const publicAuth = () => ({auth: globalThis.__campusAuthFixture.auth});
             export const adminAuth = publicAuth;
             export const reconcileSupabaseProfile = async () => {
               if (globalThis.__campusAuthFixture.profileError) throw globalThis.__campusAuthFixture.profileError;
               return {onboarded: true, role: "student"};
             };
             export const authUser = profile => ({id:"fixture-user",role:profile.role});`,
        loader: "js",
      }));
    },
  }],
});
const require = createRequire(import.meta.url);
const compiled = new Module(fileURLToPath(import.meta.url));
compiled.paths = require.resolve.paths("express");
compiled._compile(result.outputFiles[0].text, fileURLToPath(import.meta.url));
const router = compiled.exports.default;

test("authentication route error handling", async (t) => {
  const records = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { warn: (data) => records.push(data), error: (data) => records.push(data) };
    next();
  });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    delete globalThis.__campusAuthFixture;
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const post = async (route) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${route}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "fixture@example.test", password: "fixture-password" }),
    });
    return { response, body: await response.json() };
  };
  const fixtureSession = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 };
  const setup = (overrides = {}) => {
    records.length = 0;
    globalThis.__campusAuthFixture = {
      auth: {
        resetPasswordForEmail: async () => ({ error: null }),
        signInWithPassword: async () => ({ data: { session: fixtureSession }, error: null }),
        getUser: async () => ({ data: { user: { id: "fixture-user" } }, error: null }),
        refreshSession: async () => ({ data: { session: fixtureSession }, error: null }),
        ...overrides,
      },
    };
  };

  await t.test("reset quota is 429 with guidance, not 503 or success", async () => {
    setup({ resetPasswordForEmail: async () => ({ error: { code: "over_email_send_rate_limit", status: 400 } }) });
    const { response, body } = await post("reset-password");
    assert.equal(response.status, 429);
    assert.match(body.error, /wait/i);
    assert.equal(records[0].stage, "password_recovery");
    assert.equal(records[0].causes[0].code, "over_email_send_rate_limit");
  });
  await t.test("reset provider outage remains 503", async () => {
    setup({ resetPasswordForEmail: async () => ({ error: { status: 502 } }) });
    assert.equal((await post("reset-password")).response.status, 503);
  });
  await t.test("successful reset retains privacy-preserving response", async () => {
    setup();
    const { response, body } = await post("reset-password");
    assert.equal(response.status, 200);
    assert.match(body.message, /If an account exists/);
  });
  await t.test("invalid credentials stay 401, provider throttling becomes 429", async () => {
    setup({ signInWithPassword: async () => ({ data: {}, error: { code: "invalid_credentials", status: 400 } }) });
    assert.equal((await post("login")).response.status, 401);
    setup({ signInWithPassword: async () => ({ data: {}, error: { status: 429 } }) });
    assert.equal((await post("login")).response.status, 429);
  });
  await t.test("verification failures expose stage/code only and set no cookies", async () => {
    setup({ getUser: async () => ({ data: {}, error: { code: "unexpected_failure", status: 503, message: "private-fixture" } }) });
    const { response, body } = await post("login");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(records[0].stage, "verify_session");
    assert.equal(records[0].causes[1].code, "unexpected_failure");
    assert.doesNotMatch(JSON.stringify({ records, body }), /private-fixture|fixture-password|fixture-access|fixture@example/);
  });
  await t.test("profile failures remain fail-closed with database diagnostics", async () => {
    setup();
    globalThis.__campusAuthFixture.profileError = { cause: { code: "42501", query: "private SQL" } };
    const { response } = await post("login");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(records[0].stage, "reconcile_profile");
    assert.equal(records[0].causes[2].code, "42501");
    assert.doesNotMatch(JSON.stringify(records), /private SQL/);
  });
  await t.test("refresh failure retains its provider cause and does not set cookies", async () => {
    setup({ refreshSession: async () => ({ data: {}, error: { code: "refresh_token_not_found", status: 400 } }) });
    const { response } = await post("login");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(records[0].stage, "refresh_session");
    assert.equal(records[0].causes[1].code, "refresh_token_not_found");
  });
  await t.test("successful login still returns reconciled user and session cookies", async () => {
    setup();
    const { response, body } = await post("login");
    assert.equal(response.status, 200);
    assert.equal(body.user.role, "student");
    assert.equal(body.needsOnboarding, false);
    assert.equal(body.session.access_token, "fixture-access");
    assert.match(response.headers.get("set-cookie"), /campusx_access=/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
