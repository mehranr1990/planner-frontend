/*
 * Mehran Planner · push-only service worker. No fetch handler and no cache:
 * it shows Web Push notifications and routes their clicks, nothing else.
 *
 * The server payload is generic ({ notificationId, tag, type? }); the text
 * shown is fixed and localised here (sw.js?lang=fa|en), so no planner content
 * ever reaches a lock screen. Clicks open only same-origin, allow-listed
 * Planner paths built from a validated id, never a URL from the payload.
 */

const LANG = new URL(self.location.href).searchParams.get("lang") === "en" ? "en" : "fa";

const TEXT = {
  fa: { title: "برنامه‌ریز مهران", reminder: "یک یادآور دارید.", messaging: "فعالیت تازه‌ای دارید.", dir: "rtl" },
  en: { title: "Mehran Planner", reminder: "You have a reminder.", messaging: "You have new activity.", dir: "ltr" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK = "/personal";

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** The in-app destination of a payload: an allow-listed path, never the payload's own URL. */
function destinationOf(data) {
  if (data && data.type === "MESSAGING") return "/messages";
  const id = data && typeof data.notificationId === "string" ? data.notificationId : "";
  return UUID.test(id) ? `/personal?push=${id}` : FALLBACK;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const text = TEXT[LANG];
  const tag = typeof data.tag === "string" && UUID.test(data.tag) ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(text.title, {
      body: data.type === "MESSAGING" ? text.messaging : text.reminder,
      lang: LANG,
      dir: text.dir,
      icon: "/favicon.ico",
      tag,
      data: { url: destinationOf(data) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && typeof event.notification.data.url === "string" ? event.notification.data.url : FALLBACK;
  // Re-validate: only same-origin paths built by destinationOf.
  const target = new URL(path, self.location.origin);
  const url = target.origin === self.location.origin && /^\/(personal|messages)(\/|$)/.test(target.pathname) ? target.href : new URL(FALLBACK, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          const navigated = await client.navigate(url);
          if (navigated) return navigated.focus();
        } catch {
          // An uncontrolled tab cannot be navigated by the worker: open a new one.
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
