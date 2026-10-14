"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isOptionalModule, type OptionalModuleId } from "./modules";
import {
  createPlannerSettingsStore,
  parsePlannerSettings,
  type PlannerSettings,
  type PlannerSettingsPatch,
  type PlannerSettingsStore,
} from "./planner-settings";
import { plannerSettingsCookieString } from "./planner-settings-cookie";

const CHANNEL_NAME = "mp-planner";

export interface PlannerSettingsActions {
  /** Merges the patch per group, then persists, broadcasts and refreshes. */
  update(patch: PlannerSettingsPatch): void;
  /** Shows or hides an optional module. Core ids are ignored: they cannot be hidden. */
  setModuleVisible(id: OptionalModuleId, visible: boolean): void;
}

interface PlannerSettingsContextValue {
  store: PlannerSettingsStore;
  actions: PlannerSettingsActions;
}

const PlannerSettingsContext = createContext<PlannerSettingsContextValue | null>(null);

function usePlannerSettingsContext(): PlannerSettingsContextValue {
  const value = use(PlannerSettingsContext);
  if (!value) throw new Error("usePlannerSettings must be used inside <PlannerSettingsProvider>");
  return value;
}

/**
 * Seeds a per-tree store from the server-resolved settings, so the server
 * render and hydration read the same values. Changes persist to the cookie,
 * reach other tabs, and refresh server-rendered output (rail, hidden pages).
 */
export function PlannerSettingsProvider({ initial, children }: { initial: PlannerSettings; children: ReactNode }) {
  const router = useRouter();
  const [store] = useState(() => createPlannerSettingsStore(initial));
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      store.replace(parsePlannerSettings(event.data));
      // The sending tab already wrote the cookie; re-render this tab's server
      // output too. Never re-post or re-write here, so tabs cannot loop.
      router.refresh();
    };
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [store, router]);

  const actions = useMemo<PlannerSettingsActions>(() => {
    const update = (patch: PlannerSettingsPatch) => {
      const next = store.update(patch);
      document.cookie = plannerSettingsCookieString(next);
      channelRef.current?.postMessage(next);
      router.refresh();
    };
    return {
      update,
      setModuleVisible(id, visible) {
        if (!isOptionalModule(id)) return;
        update({ modules: { [id]: visible } });
      },
    };
  }, [store, router]);

  const value = useMemo(() => ({ store, actions }), [store, actions]);

  return <PlannerSettingsContext value={value}>{children}</PlannerSettingsContext>;
}

export function usePlannerSettings(): PlannerSettings {
  const { store } = usePlannerSettingsContext();
  // The store is seeded with the server's values, so it is also the server snapshot.
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function usePlannerSettingsActions(): PlannerSettingsActions {
  return usePlannerSettingsContext().actions;
}
