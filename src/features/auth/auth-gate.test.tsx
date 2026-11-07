import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError } from "@/api/errors";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { AuthGate } from "./auth-gate";
import { hardNavigate } from "./navigation";
import { handleApiErrorGlobally, resetLeaveGuardForTests, sessionQueryKey, useSignOut } from "./session";
import { apiError, json, mockApi, SESSION, USER, type Handler } from "./test-api";

vi.mock("./navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./navigation")>()),
  hardNavigate: vi.fn(),
}));

const SETTINGS = { locale: "en-US", timezone: "Asia/Tehran", preferredCalendar: "GREGORIAN", firstDayOfWeek: 6 };

function accountRoutes(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /api/v1/auth/get-session": () => json(SESSION),
    "GET /api/v1/me": () => json(USER),
    "GET /api/v1/me/settings": () => json(SETTINGS, 200, { ETag: '"s-1"' }),
    "GET /api/v1/me/spaces": () => json([]),
    ...overrides,
  };
}

function Probe() {
  const { calendar } = usePreferences();
  const { update } = usePreferenceActions();
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  return (
    <div>
      <p>private content</p>
      <p data-testid="calendar">{calendar}</p>
      <button onClick={() => update({ calendar: "jalali" })}>use jalali</button>
      <button onClick={() => void queryClient.invalidateQueries({ queryKey: sessionQueryKey })}>revalidate</button>
      <button onClick={() => signOut().catch(() => undefined)}>sign out</button>
    </div>
  );
}

beforeEach(() => {
  resetLeaveGuardForTests();
  vi.mocked(hardNavigate).mockClear();
  setMockPathname("/personal/tasks");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AuthGate — mock mode", () => {
  it("passes children through without calling the API", () => {
    const api = mockApi({});
    renderWithProviders(<AuthGate><p>private content</p></AuthGate>);
    expect(screen.getByText("private content")).toBeInTheDocument();
    expect(api.fetchMock).not.toHaveBeenCalled();
  });
});

describe("AuthGate — live mode", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_MODE", "live"));

  it("sends an anonymous visitor to sign-in with a safe return path and never renders private content", async () => {
    const api = mockApi({ "GET /api/v1/auth/get-session": () => json(null) });
    renderWithProviders(<AuthGate><p>private content</p></AuthGate>);
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/sign-in?next=%2Fpersonal%2Ftasks"));
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
    expect(api.find("GET", "/api/v1/auth/get-session")[0]!.init.credentials).toBe("include");
  });

  it("shows the unavailable state for a 403 session (closed / quarantined)", async () => {
    mockApi({ "GET /api/v1/auth/get-session": () => apiError(403, "FORBIDDEN") });
    renderWithProviders(<AuthGate><p>private content</p></AuthGate>);
    expect(await screen.findByRole("heading", { name: "This account can't be used right now" })).toBeInTheDocument();
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });

  it("restores an active session and loads profile, settings and space", async () => {
    const api = mockApi(accountRoutes());
    renderWithProviders(<AuthGate><Probe /></AuthGate>);
    expect(await screen.findByText("private content")).toBeInTheDocument();
    await waitFor(() => expect(api.find("GET", "/api/v1/me/spaces")).toHaveLength(1));
    expect(api.find("GET", "/api/v1/me")).toHaveLength(1);
    expect(api.find("GET", "/api/v1/me/settings")).toHaveLength(1);
    // Local values already match the account: nothing is written back.
    expect(api.find("PATCH", "/api/v1/me/settings")).toHaveLength(0);
  });

  it("applies the account calendar to the local preferences", async () => {
    mockApi(accountRoutes({ "GET /api/v1/me/settings": () => json({ ...SETTINGS, preferredCalendar: "JALALI" }, 200, { ETag: '"s-1"' }) }));
    renderWithProviders(<AuthGate><Probe /></AuthGate>);
    await waitFor(() => expect(screen.getByTestId("calendar")).toHaveTextContent("jalali"));
  });

  it("writes a local change with If-Match and, on 409, refetches and re-applies only that change", async () => {
    let patches = 0;
    let settingsReads = 0;
    const api = mockApi(
      accountRoutes({
        "GET /api/v1/me/settings": () => json(SETTINGS, 200, { ETag: settingsReads++ === 0 ? '"s-1"' : '"s-2"' }),
        "PATCH /api/v1/me/settings": () =>
          patches++ === 0 ? apiError(409, "CONFLICT") : json({ ...SETTINGS, preferredCalendar: "JALALI" }, 200, { ETag: '"s-3"' }),
      }),
    );
    renderWithProviders(<AuthGate><Probe /></AuthGate>);
    await waitFor(() => expect(api.find("GET", "/api/v1/me/settings")).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "use jalali" }));
    await waitFor(() => expect(api.find("PATCH", "/api/v1/me/settings")).toHaveLength(2));
    const [first, second] = api.find("PATCH", "/api/v1/me/settings");
    expect(first!.headers.get("If-Match")).toBe('"s-1"');
    expect(second!.headers.get("If-Match")).toBe('"s-2"');
    expect(first!.body).toEqual({ preferredCalendar: "JALALI" });
    expect(second!.body).toEqual({ preferredCalendar: "JALALI" });
    expect(first!.headers.get("Content-Type")).toBe("application/json");
    expect(screen.getByTestId("calendar")).toHaveTextContent("jalali");
  });

  it("leaves with reason=revoked when a revalidation finds the session gone", async () => {
    let active = true;
    mockApi(accountRoutes({ "GET /api/v1/auth/get-session": () => json(active ? SESSION : null) }));
    renderWithProviders(<AuthGate><Probe /></AuthGate>);
    await screen.findByText("private content");
    active = false;
    await userEvent.click(screen.getByRole("button", { name: "revalidate" }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/sign-in?reason=revoked&next=%2Fpersonal%2Ftasks"));
  });

  it("signs out with an empty JSON body, then clears caches and app storage before leaving", async () => {
    window.localStorage.setItem("mp-focus-session", "{}");
    window.localStorage.setItem("mp-overview-slot-dismissals", "{}");
    window.sessionStorage.setItem("mp-sheet-opened", "/personal?sheet=note");
    // Device UI state and other apps' data on this origin survive sign-out.
    window.localStorage.setItem("mp-calendar-hidden-layers", "[]");
    window.localStorage.setItem("mp-task-create-more", "open");
    window.localStorage.setItem("unrelated", "keep");
    const api = mockApi(accountRoutes({ "POST /api/v1/auth/sign-out": () => json({ success: true }) }));
    renderWithProviders(<AuthGate><Probe /></AuthGate>);
    await screen.findByText("private content");
    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/sign-in?reason=signed-out"));
    const [call] = api.find("POST", "/api/v1/auth/sign-out");
    expect(call!.body).toEqual({});
    expect(call!.init.credentials).toBe("include");
    expect(call!.headers.has("Origin")).toBe(false);
    expect(window.localStorage.getItem("mp-focus-session")).toBeNull();
    expect(window.localStorage.getItem("mp-overview-slot-dismissals")).toBeNull();
    expect(window.sessionStorage.getItem("mp-sheet-opened")).toBeNull();
    expect(window.localStorage.getItem("mp-calendar-hidden-layers")).toBe("[]");
    expect(window.localStorage.getItem("mp-task-create-more")).toBe("open");
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  it("stays signed in when sign-out cannot reach the server", async () => {
    mockApi(accountRoutes({ "POST /api/v1/auth/sign-out": () => Promise.reject(new TypeError("Failed to fetch")) }));
    renderWithProviders(<AuthGate><Probe /></AuthGate>);
    await screen.findByText("private content");
    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    await act(async () => {});
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});

describe("handleApiErrorGlobally", () => {
  it("ends the session on 401 and clears the query cache; ignores 403 and auth-flow calls", () => {
    const client = new QueryClient();
    client.setQueryData(["account", "u1", "me"], USER);
    handleApiErrorGlobally(client, new ApiHttpError(403, undefined, undefined));
    handleApiErrorGlobally(client, new ApiHttpError(401, undefined, undefined), { authFlow: true });
    expect(hardNavigate).not.toHaveBeenCalled();
    handleApiErrorGlobally(client, new ApiHttpError(401, undefined, undefined));
    expect(hardNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/sign-in\?reason=expired/));
    expect(client.getQueryData(["account", "u1", "me"])).toBeUndefined();
  });
});
