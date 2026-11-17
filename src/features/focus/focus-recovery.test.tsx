import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import type { FocusRecoveryAction, FocusRecoveryRepository, ServerFocusSession } from "@/data/repositories";
import { advance, pause, resume, startSession, type FocusConfig } from "./domain/timer";
import { useFocusRecovery } from "./focus-recovery";
import { focusStore } from "./focus-store";

/* The live Focus mirror against a fake recovery repository (no network). */

const config: FocusConfig = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4, autoStartNext: false };
const T0 = Date.parse("2026-11-17T08:00:00.000Z");

function fakeRecovery(initial?: Partial<ServerFocusSession>) {
  const log: string[] = [];
  const claims: number[] = [];
  let server: ServerFocusSession = { id: "s1", revision: 1, state: "IDLE", recoveryState: "READY", workMs: 0, ...initial };
  const state: Record<string, ServerFocusSession["state"]> = { START: "RUNNING", RESUME: "RUNNING", RECOVER: "PAUSED", PAUSE: "PAUSED", FINISH: "FINISHED", STOP: "FINISHED", DISCARD: "ABANDONED" };
  const api: FocusRecoveryRepository = {
    create: async () => {
      log.push("create");
      return server;
    },
    get: async () => server,
    command: async (_session, action: FocusRecoveryAction) => {
      log.push(action);
      server = { ...server, revision: server.revision + 1, state: state[action] ?? server.state, recoveryState: action === "RECOVER" ? "HEALTHY" : server.recoveryState };
      return server;
    },
    claim: (endAt) => void claims.push(endAt),
    track: () => undefined,
  };
  return { api, log, claims };
}

function mount(api: FocusRecoveryRepository) {
  const repositories = createMockRepositories();
  repositories.plan = { ...repositories.plan, focusRecovery: api };
  const wrapper = ({ children }: { children: ReactNode }) => <DataProvider repositories={repositories}>{children}</DataProvider>;
  return renderHook(() => useFocusRecovery(), { wrapper });
}

beforeEach(() => {
  window.localStorage.clear();
  focusStore.reset();
});
afterEach(() => focusStore.clear());

describe("focus recovery mirror", () => {
  it("starts, pauses and resumes the cycle's session, then claims and finishes it", async () => {
    const { api, log, claims } = fakeRecovery();
    const view = mount(api);
    act(() => focusStore.update(() => startSession(config, null, T0)));
    await waitFor(() => expect(log).toEqual(["create", "START"]));
    act(() => focusStore.update((s) => pause(s!, T0 + 60_000)));
    await waitFor(() => expect(log.at(-1)).toBe("PAUSE"));
    act(() => focusStore.update((s) => resume(s!, T0 + 120_000)));
    await waitFor(() => expect(log.at(-1)).toBe("RESUME"));
    act(() => focusStore.update((s) => advance(s!, T0 + 60 * 60_000)));
    await waitFor(() => expect(log.at(-1)).toBe("FINISH"));
    expect(claims).toHaveLength(1);
    view.unmount();
  });

  it("discards a cycle that ends before it finished (nothing recorded, as before)", async () => {
    const { api, log, claims } = fakeRecovery();
    mount(api);
    act(() => focusStore.update(() => startSession(config, null, T0)));
    await waitFor(() => expect(log).toEqual(["create", "START"]));
    act(() => focusStore.clear());
    await waitFor(() => expect(log.at(-1)).toBe("DISCARD"));
    expect(claims).toEqual([]);
  });

  it("recovers an interrupted session after a reload and resumes a running timer", async () => {
    const { api, log } = fakeRecovery({ state: "RUNNING", recoveryState: "INTERRUPTED", revision: 3 });
    const session = startSession(config, null, T0);
    window.localStorage.setItem("mp-focus-server", JSON.stringify({ cycle: `${T0}:1`, session: { id: "s1", revision: 3, state: "RUNNING", recoveryState: "HEALTHY", workMs: 0 }, finished: false, pending: null }));
    focusStore.update(() => session);
    mount(api);
    await waitFor(() => expect(log).toEqual(["RECOVER", "RESUME"]));
  });
});
