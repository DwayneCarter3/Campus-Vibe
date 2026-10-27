// The old live-account create/cleanup tool is deliberately retired.
// Run only isolated checks; never read Supabase credentials or touch real users.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.argv.length > 2) {
  console.error("Live fixture create/cleanup is disabled. Run pnpm test:auth instead.");
  process.exitCode = 1;
} else {
  const result = spawnSync("pnpm", ["test:auth"], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}
