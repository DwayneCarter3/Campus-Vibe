import { openFixture } from "./isolated-db.mjs";
export { usersTable } from "./isolated-db.mjs";
// This module replaces @workspace/db ONLY in the isolated test worker bundle.
if (!process.env.CAMPUSX_AUTH_TEST_DIR) throw Error("Isolated fixture directory required.");
export const { pg, db } = await openFixture(process.env.CAMPUSX_AUTH_TEST_DIR);
