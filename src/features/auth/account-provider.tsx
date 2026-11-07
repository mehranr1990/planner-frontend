"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, use, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { setPlannerTimeZone } from "@/lib/dates/zone";
import { ApiHttpError } from "@/api/errors";
import { getApiClient } from "@/api/runtime";
import type { SessionState } from "@/api/session";
import { usePlannerSettings, usePlannerSettingsActions } from "@/features/planner-settings/use-planner-settings";
import { preferencesForLocale, type Preferences } from "@/features/preferences/preferences-store";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";
import {
  getMe,
  getPersonalSpace,
  getSettings,
  updateSettings,
  type AccountSettingsPatch,
  type AccountUser,
  type PersonalSpace,
  type VersionedSettings,
} from "./auth-api";
import { localPatch, serverChanges, type LocalAccountFields } from "./account-settings-map";
import { accountKeys } from "./session";

/*
 * Signed-in account context (live mode): profile (/me), account settings
 * with their ETag (/me/settings) and the owned Personal Space (/me/spaces),
 * all cached under the user id. Account settings sync both ways with the
 * local preference stores; writes send If-Match and, on 409, refetch and
 * re-apply the user's change once (the change is a partial patch, so it
 * never overwrites fields the user did not touch).
 */

interface AccountContextValue {
  session: SessionState;
  /** Fresh profile when loaded, otherwise the session's identity. */
  user: AccountUser | SessionState["user"];
  space: PersonalSpace | null | undefined;
  settings: VersionedSettings | undefined;
  updateAccountSettings(patch: AccountSettingsPatch): Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** The signed-in account, or null in mock mode / outside the gate. */
export function useAccount(): AccountContextValue | null {
  return use(AccountContext);
}

export function AccountProvider({ session, children }: { session: SessionState; children: ReactNode }) {
  const t = useTranslations("Auth.account");
  const userId = session.user.id;
  const client = getApiClient();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: accountKeys.me(userId), queryFn: ({ signal }) => getMe(client, signal) });
  const space = useQuery({ queryKey: accountKeys.space(userId), queryFn: ({ signal }) => getPersonalSpace(client, signal) });
  const settings = useQuery({
    queryKey: accountKeys.settings(userId),
    queryFn: ({ signal }) => getSettings(client, signal),
  });

  const updateAccountSettings = useCallback(
    async (patch: AccountSettingsPatch) => {
      const key = accountKeys.settings(userId);
      const current = queryClient.getQueryData<VersionedSettings>(key);
      try {
        let next: VersionedSettings;
        try {
          next = await updateSettings(client, patch, current?.etag);
        } catch (error) {
          if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
          // Stale revision: take the server's latest ETag and re-apply only this change.
          const fresh = await getSettings(client);
          next = await updateSettings(client, patch, fresh.etag);
        }
        queryClient.setQueryData(key, next);
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) throw error; // global handler signs out
        toast({ id: "account-settings", title: t("settingsNotSaved"), tone: "danger" });
        await queryClient.invalidateQueries({ queryKey: key });
        throw error;
      }
    },
    [client, queryClient, t, userId],
  );

  useAccountSettingsSync(settings.data, updateAccountSettings);

  // The account zone defines "today" and day boundaries (live mode). Applied before the app renders;
  // a later change (Settings → Time zone) refetches everything computed in the old zone.
  const zone = settings.data?.settings.timezone;
  const appliedZone = useRef<string | null>(null);
  if (zone) setPlannerTimeZone(zone);
  useEffect(() => {
    if (!zone) return;
    if (appliedZone.current !== null && appliedZone.current !== zone) void queryClient.invalidateQueries();
    appliedZone.current = zone;
  }, [zone, queryClient]);
  const zoneReady = settings.data !== undefined || settings.isError;

  const value = useMemo<AccountContextValue>(
    () => ({
      session,
      user: me.data ?? session.user,
      space: space.data,
      settings: settings.data,
      updateAccountSettings,
    }),
    [session, me.data, space.data, settings.data, updateAccountSettings],
  );

  if (!zoneReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-fg-muted">
        <Spinner size="lg" label={t("loading")} />
      </div>
    );
  }
  return <AccountContext value={value}>{children}</AccountContext>;
}

/**
 * One effect for both directions so they never race: a new server snapshot is
 * applied to the local stores; any later local change (Settings, profile
 * menu, undo) is diffed against that snapshot and sent as a partial patch.
 */
function useAccountSettingsSync(
  server: VersionedSettings | undefined,
  push: (patch: AccountSettingsPatch) => Promise<void>,
) {
  const preferences = usePreferences();
  const preferenceActions = usePreferenceActions();
  const planner = usePlannerSettings();
  const plannerActions = usePlannerSettingsActions();
  const appliedSnapshot = useRef<VersionedSettings | null>(null);
  const inFlight = useRef<string | null>(null);

  const local: LocalAccountFields = {
    locale: preferences.locale,
    calendar: preferences.calendar,
    weekStartsOn: planner.week.weekStartsOn,
  };

  useEffect(() => {
    if (!server) return;
    if (appliedSnapshot.current !== server) {
      appliedSnapshot.current = server;
      inFlight.current = null;
      const changes = serverChanges(server.settings, local);
      const patch: Partial<Preferences> = {
        ...(changes.locale ? preferencesForLocale(changes.locale) : {}),
        ...(changes.calendar || changes.locale ? { calendar: changes.calendar ?? local.calendar } : {}),
      };
      if (Object.keys(patch).length) preferenceActions.update(patch);
      if (changes.weekStartsOn !== undefined) plannerActions.update({ week: { weekStartsOn: changes.weekStartsOn } });
      return;
    }
    const patch = localPatch(local, server.settings);
    const signature = patch && JSON.stringify(patch);
    if (!patch || signature === inFlight.current) return;
    inFlight.current = signature;
    push(patch).catch(() => {
      inFlight.current = null;
    });
    // `local` is rebuilt every render; its three fields are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, local.locale, local.calendar, local.weekStartsOn, push, preferenceActions, plannerActions]);
}
