import type { PushSubscriptionInput } from "@/data/personal-services";

/*
 * Browser side of Web Push: capability detection, the explicit permission
 * request, the push-only service worker and the PushManager subscription.
 * Nothing here runs on page load; Settings calls it on a user gesture.
 * The VAPID public key comes from the server's preferences; no secret is
 * ever held in the browser.
 */

export type PushSupport =
  /** No Service Worker / PushManager / Notification in this browser. */
  | "unsupported"
  /** Not HTTPS (localhost is a secure context for development). */
  | "insecure"
  /** iOS/iPadOS Safari tab: push needs the Home Screen web app. */
  | "ios-install"
  | "supported";

export const SW_URL = "/sw.js";
const DEVICE_KEY = "planner.push.device";

/** The server subscription this browser registered (id + the endpoint it was for). */
export interface LocalPushDevice {
  id: string;
  endpoint: string;
}

function isIos(nav: Navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (capable) return "supported";
  return isIos(navigator) && !isStandalone() ? "ios-install" : "unsupported";
}

export function pushPermission(): NotificationPermission {
  return typeof Notification === "undefined" ? "denied" : Notification.permission;
}

/** Only ever called from a click handler. */
export async function requestPushPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function swUrl(lang: string): string {
  return `${SW_URL}?lang=${lang === "en" ? "en" : "fa"}`;
}

/** The worker registration, if any (no registration is created here). */
export async function existingRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (pushSupport() !== "supported") return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

/** The current browser subscription, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await existingRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Keeps an existing worker's notification language in step with the UI (no-op without one). */
export async function refreshWorker(lang: string): Promise<void> {
  const registration = await existingRegistration();
  if (registration && !registration.active?.scriptURL.endsWith(swUrl(lang))) await navigator.serviceWorker.register(swUrl(lang), { scope: "/" });
}

/**
 * Registers the worker and subscribes with the server's VAPID key. A stale
 * subscription made with another key (or an expired one) is replaced.
 */
export async function subscribeBrowser(publicKey: string, lang: string): Promise<PushSubscriptionInput> {
  const registration = await navigator.serviceWorker.register(swUrl(lang), { scope: "/" });
  await navigator.serviceWorker.ready;
  const key = urlBase64ToBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = subscription.toJSON();
  const auth = json.keys?.auth;
  const p256dh = json.keys?.p256dh;
  if (!json.endpoint || !auth || !p256dh) {
    await subscription.unsubscribe();
    throw new Error("PUSH_SUBSCRIPTION_INCOMPLETE");
  }
  return { endpoint: json.endpoint, keys: { auth, p256dh }, label: deviceLabel(navigator.userAgent) };
}

export async function unsubscribeBrowser(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) await subscription.unsubscribe();
}

/** A coarse, non-identifying label ("Chrome · Windows"). */
export function deviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /OPR\//.test(userAgent)
        ? "Opera"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return os ? `${browser} · ${os}` : browser;
}

export function readLocalDevice(): LocalPushDevice | null {
  try {
    const value = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "null") as unknown;
    if (value && typeof value === "object" && typeof (value as LocalPushDevice).id === "string" && typeof (value as LocalPushDevice).endpoint === "string")
      return value as LocalPushDevice;
  } catch {
    // Storage blocked or corrupt: treated as "not subscribed here".
  }
  return null;
}

export function writeLocalDevice(device: LocalPushDevice | null): void {
  try {
    if (device) localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Storage blocked: the device still works, it just is not marked as this browser.
  }
}
