// Read-only pre-publish gate. Never prints or changes credentials or user records.
import dns from "node:dns/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = require("pg");
const connectionString = process.env.SUPABASE_DATABASE_URL;
const authUrl = process.env.SUPABASE_URL;
if (!connectionString || !authUrl) {
  console.error("Authentication pre-publish check failed: Supabase database or auth URL is not configured.");
  process.exitCode = 1;
} else {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    const hostname = new URL(connectionString).hostname;
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length && addresses.every(({ family }) => family === 6)) {
      console.warn("Database hostname has IPv6 addresses only; this environment may require the Supabase IPv4-compatible pooler URL.");
    }
    await client.connect();
    await client.query("SELECT 1"); // No real users read or modified.
    console.log("Database connection: reachable.");
    const res = await fetch(new URL("/auth/v1/health", authUrl), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw Error(`Auth service health returned HTTP ${res.status}.`);
    console.log("Auth service: reachable.");
  } catch (error) {
    console.error(`Authentication pre-publish check failed: ${error.code ?? error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
