import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;
const outDir = path.resolve(import.meta.dirname, "dist/public");

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

function fingerprintServiceWorker() {
  return {
    name: "campusx-service-worker-fingerprint",
    apply: "build" as const,
    async closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      const workerPath = path.join(outDir, "sw.js");
      const [html, worker] = await Promise.all([
        readFile(htmlPath, "utf8"),
        readFile(workerPath, "utf8"),
      ]);
      const fingerprint = createHash("sha256").update(html).digest("hex").slice(0, 12);
      const versionToken = "__CAMPUSX_BUILD_VERSION__";
      if (!worker.includes(versionToken)) {
        throw new Error("CampusX service worker build-version token is missing.");
      }
      await writeFile(workerPath, worker.replace(versionToken, fingerprint));
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    fingerprintServiceWorker(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
