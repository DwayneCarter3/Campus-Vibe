const CACHE_VERSION = "campusx-shell-__CAMPUSX_BUILD_VERSION__";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SCOPE = new URL(self.registration.scope);
const SHELL_URL = new URL("index.html", APP_SCOPE).href;
const CACHEABLE_EXTENSION = /\.(?:js|css|woff2?)$/i;

function isLocalIcon(pathname) {
  return /(?:\/favicon(?:\.[a-z0-9]+)?|\/icons\/[^/]+\.(?:svg|ico))$/i.test(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      const response = await fetch(SHELL_URL, { cache: "reload" });
      if (!response.ok) throw new Error(`Could not cache CampusX shell (${response.status})`);
      await shellCache.put(SHELL_URL, response.clone());

      const html = await response.text();
      const shellAssets = new Set();
      for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
        const assetUrl = new URL(match[1], SHELL_URL);
        if (
          assetUrl.origin === APP_SCOPE.origin &&
          assetUrl.pathname.startsWith(APP_SCOPE.pathname) &&
          (/\.(?:js|css)$/i.test(assetUrl.pathname) || /favicon/i.test(assetUrl.pathname))
        ) {
          shellAssets.add(assetUrl.href);
        }
      }

      for (const assetUrl of shellAssets) {
        try {
          const assetResponse = await fetch(assetUrl);
          if (!assetResponse.ok) continue;
          await shellCache.put(assetUrl, assetResponse.clone());
          if (/\.css(?:$|\?)/i.test(assetUrl)) {
            const css = await assetResponse.text();
            for (const fontMatch of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
              const fontUrl = new URL(fontMatch[1], assetUrl);
              if (
                fontUrl.origin === APP_SCOPE.origin &&
                fontUrl.pathname.startsWith(APP_SCOPE.pathname) &&
                (/\.(?:woff2?)$/i.test(fontUrl.pathname) || isLocalIcon(fontUrl.pathname))
              ) {
                try {
                  const fontResponse = await fetch(fontUrl.href);
                  if (fontResponse.ok) await shellCache.put(fontUrl.href, fontResponse);
                } catch {
                  // An unavailable optional font does not prevent installing the shell.
                }
              }
            }
          }
        } catch {
          // A missing optional asset does not prevent the shell document from being cached.
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("campusx-shell-") || name.startsWith("campusx-runtime-"))
          .filter((name) => name !== SHELL_CACHE && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (
    requestUrl.origin !== APP_SCOPE.origin ||
    !requestUrl.pathname.startsWith(APP_SCOPE.pathname) ||
    /\/(?:api|auth)(?:\/|$)/i.test(requestUrl.pathname)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(SHELL_URL).then((shell) => shell ?? fetch(request)),
    );
    return;
  }

  // Lazy route chunks are intentionally never precached. A route first opened
  // offline has no chunk available until it has been requested online once.
  if (!CACHEABLE_EXTENSION.test(requestUrl.pathname) && !isLocalIcon(requestUrl.pathname)) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const runtimeCache = await caches.open(RUNTIME_CACHE);
        await runtimeCache.put(request, response.clone());
      }
      return response;
    })(),
  );
});