import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { NOTIFICATION_MODULES, type ModuleChannels, type NotificationPreferences, type PushDevice } from "@/data/personal-services";
import { DataProvider } from "@/data/provider";
import { RepositoryError, type Repositories } from "@/data/repositories";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { deviceLabel, pushSupport, readLocalDevice, subscribeBrowser, writeLocalDevice } from "./browser-push";
import { BrowserPushControl } from "./browser-push-control";
import { PushOpen } from "./push-open";

const ID = "0b9f1c52-3c1a-4d55-9a0e-2f6f0c1d7e11";
const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

interface FakeBrowser {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
  subscription: { endpoint: string; unsubscribe: ReturnType<typeof vi.fn>; toJSON: () => unknown } | null;
  subscribe: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
}

function installBrowser({ permission = "default" as NotificationPermission, keys = { auth: "a", p256dh: "p" } as Record<string, string> | null } = {}): FakeBrowser {
  const fake: FakeBrowser = {
    permission,
    requestPermission: vi.fn(async () => {
      fake.permission = "granted";
      return "granted";
    }),
    subscription: null,
    subscribe: vi.fn(),
    register: vi.fn(),
  };
  const makeSubscription = () => {
    const subscription = {
      endpoint: ENDPOINT,
      unsubscribe: vi.fn(async () => {
        fake.subscription = null;
        return true;
      }),
      toJSON: () => ({ endpoint: ENDPOINT, keys: keys ?? undefined }),
    };
    fake.subscription = subscription;
    return subscription;
  };
  fake.subscribe.mockImplementation(async () => makeSubscription());
  const pushManager = { getSubscription: async () => fake.subscription, subscribe: fake.subscribe };
  const registration = { pushManager, active: { scriptURL: "https://planner.test/sw.js?lang=en" } };
  fake.register.mockImplementation(async () => registration);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { get permission() { return fake.permission; }, requestPermission: fake.requestPermission });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: fake.register, ready: Promise.resolve(registration), getRegistration: async () => registration },
  });
  return fake;
}

function uninstallBrowser() {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
}

const prefs = (patch: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  channels: { inApp: true, email: false, webPush: false },
  available: ["inApp", "webPush"],
  reactivateOnReopen: true,
  quietStart: null,
  quietEnd: null,
  pushPublicKey: KEY,
  modules: Object.fromEntries(NOTIFICATION_MODULES.map((module) => [module, { inApp: true, email: true, webPush: true }])) as ModuleChannels,
  ...patch,
});

const device = (id = ID): PushDevice => ({ id, revision: 1, label: "Chrome · Windows", host: "fcm.googleapis.com", createdAt: "2026-11-19T08:00:00.000Z" });

function renderControl(p: NotificationPreferences, devices: PushDevice[] | null, repositories: Repositories = createMockRepositories()) {
  const onChannel = vi.fn();
  renderWithProviders(
    <DataProvider repositories={repositories}>
      <BrowserPushControl prefs={p} devices={devices} onChannel={onChannel} />
    </DataProvider>,
  );
  return { onChannel };
}

const status = async (value: string) => waitFor(() => expect(document.querySelector("[data-push-status]")?.getAttribute("data-push-status")).toBe(value));

beforeEach(() => localStorage.clear());
afterEach(() => {
  uninstallBrowser();
  resetToasts();
});

describe("browser push · detection", () => {
  it("reports insecure, unsupported, iOS-tab and supported browsers", () => {
    vi.stubGlobal("isSecureContext", false);
    expect(pushSupport()).toBe("insecure");
    vi.stubGlobal("isSecureContext", true);
    expect(pushSupport()).toBe("unsupported");
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit Safari/604.1");
    expect(pushSupport()).toBe("ios-install");
    ua.mockRestore();
    installBrowser();
    expect(pushSupport()).toBe("supported");
  });

  it("labels devices coarsely and keeps the local device record safe", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537")).toBe("Chrome · Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Version/17 Safari/604")).toBe("Safari · iOS");
    expect(deviceLabel("curl/8")).toBe("Browser");
    writeLocalDevice({ id: ID, endpoint: ENDPOINT });
    expect(readLocalDevice()).toEqual({ id: ID, endpoint: ENDPOINT });
    localStorage.setItem("planner.push.device", "{bad");
    expect(readLocalDevice()).toBeNull();
  });

  it("subscribes with the VAPID key and rejects an incomplete subscription", async () => {
    const fake = installBrowser();
    const input = await subscribeBrowser(KEY, "en");
    expect(fake.register).toHaveBeenCalledWith("/sw.js?lang=en", { scope: "/" });
    expect(fake.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(input).toMatchObject({ endpoint: ENDPOINT, keys: { auth: "a", p256dh: "p" } });
    uninstallBrowser();
    installBrowser({ keys: null });
    await expect(subscribeBrowser(KEY, "fa")).rejects.toThrow("PUSH_SUBSCRIPTION_INCOMPLETE");
  });
});

describe("browser push · settings control", () => {
  it("shows the unsupported and server-off states without a button", async () => {
    vi.stubGlobal("isSecureContext", true);
    renderControl(prefs(), []);
    await status("unsupported");
    expect(screen.queryByRole("button")).toBeNull();
    uninstallBrowser();
  });

  it("explains a server without Web Push", async () => {
    installBrowser();
    renderControl(prefs({ pushPublicKey: null }), []);
    await status("server-off");
    expect(screen.getByText(/isn’t configured on this server/)).toBeInTheDocument();
  });

  it("explains a blocked permission and never asks again by itself", async () => {
    const fake = installBrowser({ permission: "denied" });
    renderControl(prefs(), []);
    await status("denied");
    expect(fake.requestPermission).not.toHaveBeenCalled();
  });

  it("asks for permission only on click, then registers and turns the channel on", async () => {
    const fake = installBrowser();
    const repositories = createMockRepositories();
    const register = vi.spyOn(repositories.notifications, "registerPushDevice").mockResolvedValue(device());
    const { onChannel } = renderControl(prefs(), [], repositories);
    await status("off");
    expect(fake.requestPermission).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await status("on");
    expect(register).toHaveBeenCalledWith({ endpoint: ENDPOINT, keys: { auth: "a", p256dh: "p" }, label: expect.any(String) });
    expect(readLocalDevice()).toEqual({ id: ID, endpoint: ENDPOINT });
    expect(onChannel).toHaveBeenCalledWith({ channels: { webPush: true } });
  });

  it("stays off when permission is refused", async () => {
    const fake = installBrowser();
    fake.requestPermission.mockResolvedValue("denied");
    const repositories = createMockRepositories();
    const register = vi.spyOn(repositories.notifications, "registerPushDevice");
    renderControl(prefs(), [], repositories);
    await status("off");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await status("denied");
    expect(register).not.toHaveBeenCalled();
  });

  it("drops the browser subscription when the server refuses it, so the user can retry", async () => {
    const fake = installBrowser();
    const repositories = createMockRepositories();
    vi.spyOn(repositories.notifications, "registerPushDevice").mockRejectedValue(new RepositoryError("invalid", "bad endpoint"));
    renderControl(prefs(), [], repositories);
    await status("off");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(fake.subscription).toBeNull());
    expect(readLocalDevice()).toBeNull();
    expect(screen.getByRole("button", { name: "Turn on" })).toBeEnabled();
  });

  it("shows an expired / remotely revoked subscription as off", async () => {
    const fake = installBrowser({ permission: "granted" });
    await subscribeBrowser(KEY, "en");
    writeLocalDevice({ id: ID, endpoint: fake.subscription!.endpoint });
    renderControl(prefs({ channels: { inApp: true, email: false, webPush: true } }), [device("1b9f1c52-3c1a-4d55-9a0e-2f6f0c1d7e11")]);
    await status("off");
  });

  it("turns off: revokes the server device and unsubscribes the browser", async () => {
    const fake = installBrowser({ permission: "granted" });
    await subscribeBrowser(KEY, "en");
    writeLocalDevice({ id: ID, endpoint: ENDPOINT });
    const repositories = createMockRepositories();
    const revoke = vi.spyOn(repositories.notifications, "revokePushDevice").mockResolvedValue();
    renderControl(prefs(), [device()], repositories);
    await status("on");
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await status("off");
    expect(revoke).toHaveBeenCalledWith(device());
    expect(fake.subscription).toBeNull();
    expect(readLocalDevice()).toBeNull();
  });
});

describe("push click · /personal?push=<id>", () => {
  function renderOpen(repositories: Repositories) {
    renderWithProviders(
      <DataProvider repositories={repositories}>
        <PushOpen />
      </DataProvider>,
    );
  }
  const notification = { id: ID, revision: 2, title: "t", body: null, scheduledAt: "2026-11-19T08:00:00.000Z", read: false, reminderId: ID, taskId: "task-1" };

  it("opens the notification's task and marks it read", async () => {
    setMockPathname("/personal");
    setMockSearch(`push=${ID}`);
    const repositories = createMockRepositories();
    vi.spyOn(repositories.notifications, "get").mockResolvedValue(notification);
    const read = vi.spyOn(repositories.notifications, "setRead").mockResolvedValue({ ...notification, read: true });
    renderOpen(repositories);
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/personal/tasks/task-1"));
    expect(read).toHaveBeenCalledWith(notification, true);
  });

  it("falls back with a notice when the notification is gone or foreign", async () => {
    setMockPathname("/personal");
    setMockSearch(`push=${ID}`);
    const repositories = createMockRepositories();
    renderOpen(repositories);
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/personal"));
    expect(await screen.findByText("This notification is no longer available")).toBeInTheDocument();
  });

  it("drops a malformed id without calling the API", async () => {
    setMockPathname("/personal");
    setMockSearch("push=..%2Fadmin&sheet=quick-add");
    const repositories = createMockRepositories();
    const get = vi.spyOn(repositories.notifications, "get");
    renderOpen(repositories);
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/personal?sheet=quick-add"));
    expect(get).not.toHaveBeenCalled();
  });
});
