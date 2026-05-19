// Minimal pass-through service worker.
// Its presence (with a manifest) is what makes the app installable,
// which is required for browsers to persist microphone permissions.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => e.respondWith(fetch(e.request)));
