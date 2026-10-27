# Authentication regression gate

Run `pnpm test:auth` from the workspace root. It uses an ephemeral, isolated
PGlite PostgreSQL database and the *actual* `supabase/identity.sql` triggers.
No live database, Supabase endpoint, real user or founder account is touched.
The HTTP tests run the actual API handlers in a separate Node process with a
simulated GoTrue boundary, restart that process and database connection, and
check cookie scope, rotation and logout. Web provider tests check browser
credential handling without saving bearer tokens in browser storage. The
temporary database is removed after each run. No provider email is sent.

Before publishing, run `pnpm test:auth:prepublish`. In addition to the
isolated regression tests, it checks reachability of the *configured*
Supabase database with a read-only `SELECT 1` and the auth service health
endpoint. It fails on networking or configuration errors; it does not create,
reset, or delete identities. This is not a replacement for a separately
provisioned end-to-end GoTrue test tenant. The simulated provider validates
how CampusX uses provider responses but does not test GoTrue internals or
email delivery.

The former `auth-test-fixture.mjs create/cleanup` script is retired because
it could delete application rows and touch a real founder profile. Running
that script with no arguments delegates to the isolated tests instead.
