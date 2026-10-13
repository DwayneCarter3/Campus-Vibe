const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const babel = require("@babel/core");

const projectRoot = path.resolve(__dirname, "..");
const appRequire = createRequire(path.join(projectRoot, "package.json"));
const configFile = path.join(projectRoot, "babel.config.js");
const workletsRoot = path.dirname(
  appRequire.resolve("react-native-worklets/package.json"),
);

for (const platform of ["web", "ios", "android"]) {
  test(`${platform} transforms the Worklets startup check`, () => {
    // Web loads compiled JS, while native loads the TypeScript package entry.
    const filename = path.join(
      workletsRoot,
      platform === "web" ? "lib/module/initializers.js" : "src/initializers.ts",
    );
    const result = babel.transformFileSync(filename, {
      cwd: projectRoot,
      configFile,
      caller: {
        name: "metro",
        bundler: "metro",
        platform,
        isDev: true,
        isNodeModule: true,
        projectRoot,
      },
    });
    const start = result.code.indexOf("function initializeRNRuntime");
    const end = result.code.indexOf("function initializeWorkletRuntime", start);
    assert.ok(start >= 0 && end > start, "startup function exists");
    assert.match(result.code.slice(start, end), /__workletHash\s*=/);
    assert.match(result.code.slice(start, end), /__pluginVersion\s*=\s*"0\.5\.1"/);
  });
}

test("Reanimated resolves the same Worklets installation as the app", () => {
  const reanimatedRequire = createRequire(
    appRequire.resolve("react-native-reanimated/package.json"),
  );
  assert.equal(
    reanimatedRequire.resolve("react-native-worklets/package.json"),
    appRequire.resolve("react-native-worklets/package.json"),
  );
});

test("Metro cache version includes the Babel configuration fingerprint", () => {
  const config = appRequire("./metro.config.js");
  const fingerprint = createHash("sha256")
    .update(readFileSync(configFile))
    .digest("hex");
  assert.ok(config.cacheVersion.endsWith(`:${fingerprint}`));
});
