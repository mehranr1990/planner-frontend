import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/* The real public/sw.js, run against a fake ServiceWorkerGlobalScope. */

const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGIN = "https://planner.test";
const ID = "0b9f1c52-3c1a-4d55-9a0e-2f6f0c1d7e11";

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(lang = "fa", windows: { url: string; navigate: ReturnType<typeof vi.fn> }[] = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => null);
  const self = {
    location: new URL(`${ORIGIN}/sw.js?lang=${lang}`),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => windows), openWindow },
    skipWaiting: vi.fn(),
  };
  new Function("self", SOURCE)(self);
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => (pending = promise) });
    await pending;
  };
  return { dispatch, showNotification, openWindow };
}

const pushEvent = (payload: unknown) => ({ data: { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) } });

function clickEvent(url: unknown) {
  return { notification: { close: vi.fn(), data: { url } } };
}

describe("service worker · push", () => {
  it("shows fixed, localised generic text (never the payload's text) and routes to the notification", async () => {
    const worker = loadWorker("fa");
    await worker.dispatch("push", pushEvent({ title: "Secret task title", body: "Pay 5,000,000 to Ali", notificationId: ID, tag: ID }));
    expect(worker.showNotification).toHaveBeenCalledWith("برنامه‌ریز مهران", expect.objectContaining({ body: "یک یادآور دارید.", dir: "rtl", tag: ID, data: { url: `/personal?push=${ID}` } }));
    const [, options] = worker.showNotification.mock.calls[0] as unknown as [string, { body: string }];
    expect(options.body).not.toContain("Secret");
  });

  it("routes messaging pushes to Messages and survives a malformed payload", async () => {
    const worker = loadWorker("en");
    await worker.dispatch("push", pushEvent({ type: "MESSAGING", version: 1, notificationId: ID, tag: ID }));
    expect(worker.showNotification).toHaveBeenLastCalledWith("Mehran Planner", expect.objectContaining({ body: "You have new activity.", data: { url: "/messages" } }));
    await worker.dispatch("push", { data: { json: () => JSON.parse("not json") } });
    expect(worker.showNotification).toHaveBeenLastCalledWith("Mehran Planner", expect.objectContaining({ body: "You have a reminder.", tag: undefined, data: { url: "/personal" } }));
    await worker.dispatch("push", pushEvent({ notificationId: "../../evil", tag: "x" }));
    expect(worker.showNotification).toHaveBeenLastCalledWith("Mehran Planner", expect.objectContaining({ data: { url: "/personal" } }));
  });
});

describe("service worker · notificationclick", () => {
  it("navigates an open planner window to the target and focuses it", async () => {
    const focus = vi.fn();
    const navigate = vi.fn(async () => ({ focus }));
    const worker = loadWorker("fa", [{ url: `${ORIGIN}/personal/tasks`, navigate }]);
    const event = clickEvent(`/personal?push=${ID}`);
    await worker.dispatch("notificationclick", event);
    expect(event.notification.close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/personal?push=${ID}`);
    expect(focus).toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window when no tab can be navigated", async () => {
    const navigate = vi.fn(async () => {
      throw new TypeError("not controlled");
    });
    const worker = loadWorker("fa", [{ url: `${ORIGIN}/personal`, navigate }]);
    await worker.dispatch("notificationclick", clickEvent("/messages"));
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/messages`);
  });

  it.each(["https://evil.test/personal", "//evil.test/personal", "javascript:alert(1)", "/admin", 42])("never leaves the allow-list (%s)", async (url) => {
    const worker = loadWorker();
    await worker.dispatch("notificationclick", clickEvent(url));
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/personal`);
  });
});
