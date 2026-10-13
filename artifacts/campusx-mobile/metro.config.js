const { getDefaultConfig } = require("expo/metro-config");
const { createHash } = require("crypto");
const { readFileSync } = require("fs");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Metro's dependency cache can survive a restart after Babel config changes.
// Include our config in its key so Worklets transformations cannot stay stale.
config.cacheVersion = `${config.cacheVersion || ""}:${createHash("sha256")
  .update(readFileSync(path.join(projectRoot, "babel.config.js")))
  .digest("hex")}`;

config.watchFolders = [...new Set([...(config.watchFolders || []), workspaceRoot])];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
