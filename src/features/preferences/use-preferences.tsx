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
import type { Locale } from "@/lib/locale/config";
import { preferencesCookieString } from "./preferences-cookie";
import {
  createPreferencesStore,
  parsePreferences,
  preferencesForLocale,
  type Preferences,
  type PreferencesStore,
} from "./preferences-store";

const CHANNEL_NAME = "mp-preferences";

interface PreferenceActions {
  update(patch: Partial<Preferences>): void;
  /** Choosing a language also applies its direction, digits and calendar. */
  setLocale(locale: Locale): void;
}

interface PreferencesContextValue {
  store: PreferencesStore;
  actions: PreferenceActions;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function usePreferencesContext(): PreferencesContextValue {
  const value = use(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside <PreferencesProvider>");
  return value;
}

/**
 * Seeds a per-tree store from the server-resolved preferences, so the server
 * render and hydration read the same values. Changes persist to the cookie,
 * reach other tabs, and refresh server-rendered output.
 */
export function PreferencesProvider({ initial, children }: { initial: Preferences; children: ReactNode }) {
  const router = useRouter();
  const [store] = useState(() => createPreferencesStore(initial));
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      store.replace(parsePreferences(event.data));
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

  const actions = useMemo<PreferenceActions>(() => {
    const update = (patch: Partial<Preferences>) => {
      const next = store.update(patch);
      document.cookie = preferencesCookieString(next);
      channelRef.current?.postMessage(next);
      // Server components and <html lang dir> re-render from the new cookie.
      router.refresh();
    };
    return { update, setLocale: (locale) => update(preferencesForLocale(locale)) };
  }, [store, router]);

  const value = useMemo(() => ({ store, actions }), [store, actions]);

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): Preferences {
  const { store } = usePreferencesContext();
  // The store is seeded with the server's values, so it is also the server snapshot.
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function usePreferenceActions(): PreferenceActions {
  return usePreferencesContext().actions;
}
