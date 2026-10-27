import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["artifacts/api-server/tests/auth/**/*.test.mjs", "artifacts/campusx/tests/auth.test.jsx"],
    testTimeout: 30000,
    hookTimeout: 60000,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
