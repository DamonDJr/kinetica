// Bump this whenever the caching behavior changes. The `activate` handler
// deletes every cache that isn't the current version, so bumping the suffix
// evicts a stale shell left behind by an older service worker.
const CACHE = "kinetica-v2";
const OFFLINE_URLS = ["/dashboard", "/workouts", "/nutrition", "/profile"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)).catch(() => {})
  );
  // Take over without waiting for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache API traffic — always hit the network.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets are immutable, so cache-first is safe and fast.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request))
    );
    return;
  }

  // Navigations and everything else: network-first so a new deploy is picked
  // up immediately, falling back to cache only when offline. This is what
  // prevents a stale HTML shell (referencing dead JS chunks) from being served.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (request.mode === "navigate" && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/dashboard")))
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Kinetica", {
      body: data.body,
      icon: data.icon ?? "/icons/icon-192.png",
      data: { url: data.url ?? "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url ?? "/dashboard")
  );
});
