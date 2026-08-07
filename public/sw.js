/* Launch Pad service worker — push only.
 *
 * Deliberately NO fetch handler and NO caching: the app should always load
 * live, and a stale-cache service worker is how users end up seeing last
 * week's UI after a deploy. This file exists so the installed PWA can
 * receive push notifications (iOS 16.4+), and so a tapped notification
 * opens the app on the exact lead — the only mechanism Apple allows for
 * opening a home-screen web app programmatically.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* a malformed payload still shows a generic alert below */
  }
  const title = data.title || "Launch Pad";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "You have a new lead.",
      // tag collapses repeat alerts for the same lead into one notification
      tag: data.tag || "teg-lead",
      data: { url: data.url || "/dashboard/leads" },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard/leads";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // An open app window: focus it and steer it to the lead.
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
              return;
            } catch {
              /* cross-origin edge — fall through to openWindow */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
