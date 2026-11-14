"use client";

import { MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { NOTIFICATION_CHANNELS, type NotificationPreferencesPatch } from "@/data/personal-services";
import { useNotificationPreferences, usePushDevices, useRevokePushDevice, useUpdateNotificationPreferences } from "@/data/personal-services-queries";
import { UtilityField } from "@/design-system/surfaces/utility-card";
import { dayOfInstant, isClockTimeString } from "./reminder-model";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Settings · Notifications: the server's delivery preferences (channels the
 * server can deliver, quiet hours, re-deliver on reopen), this account's
 * browser push subscriptions (revoke only: subscribing needs a service
 * worker, which the app does not have yet). Each change saves at once with
 * the preference revision.
 */

export function NotificationPreferencesPanel() {
  const t = useTranslations("Services.preferences");
  const query = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const message = useServiceError();
  const [quiet, setQuiet] = useState<{ start: string; end: string } | null>(null);

  const save = (patch: NotificationPreferencesPatch) =>
    update.mutate(patch, {
      onSuccess: () => toast({ id: "notification-preferences", tone: "neutral", title: t("saved") }),
      onError: (error) => toast({ tone: "danger", title: message(error) }),
    });

  if (query.isPending)
    return (
      <LoadingState>
        <Skeleton className="h-24 rounded-row" />
      </LoadingState>
    );
  if (query.isError) return <ErrorState variant="bare" title={t("loadError")} description={message(query.error)} onRetry={() => void query.refetch()} />;
  const prefs = query.data;
  const times = quiet ?? { start: prefs.quietStart ?? "", end: prefs.quietEnd ?? "" };
  const quietOn = prefs.quietStart !== null && prefs.quietEnd !== null;

  return (
    <>
      {NOTIFICATION_CHANNELS.map((channel) => {
        const available = prefs.available.includes(channel);
        return (
          <UtilityField key={channel} className="flex-wrap justify-between gap-x-4 gap-y-2 py-2">
            <div className="flex min-w-0 flex-col">
              <span>{t(`channel.${channel}`)}</span>
              <span className="text-xs font-normal text-fg-muted">{available ? t(`channelHint.${channel}`) : t("unavailable")}</span>
            </div>
            <Switch
              aria-label={t(`channel.${channel}`)}
              checked={prefs.channels[channel]}
              disabled={!available || update.isPending}
              onCheckedChange={(on) => save({ channels: { [channel]: on } })}
            />
          </UtilityField>
        );
      })}
      <UtilityField className="flex-wrap justify-between gap-x-4 gap-y-2 py-2">
        <div className="flex min-w-0 flex-col">
          <span>{t("quiet")}</span>
          <span className="text-xs font-normal text-fg-muted">{t("quietHint")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch aria-label={t("quiet")} checked={quietOn} disabled={update.isPending} onCheckedChange={(on) => save(on ? { quietStart: "22:00", quietEnd: "07:00" } : { quietStart: null, quietEnd: null })} />
          {quietOn ? (
            <>
              <Input type="time" dir="ltr" aria-label={t("quietStart")} className="w-28" value={times.start} onChange={(event) => setQuiet({ ...times, start: event.target.value })} />
              <Input type="time" dir="ltr" aria-label={t("quietEnd")} className="w-28" value={times.end} onChange={(event) => setQuiet({ ...times, end: event.target.value })} />
              <Button
                size="sm"
                variant="secondary"
                disabled={!quiet || !isClockTimeString(times.start) || !isClockTimeString(times.end)}
                onClick={() => {
                  save({ quietStart: times.start, quietEnd: times.end });
                  setQuiet(null);
                }}
              >
                {t("apply")}
              </Button>
            </>
          ) : null}
        </div>
      </UtilityField>
      <UtilityField className="flex-wrap justify-between gap-x-4 gap-y-2 py-2">
        <div className="flex min-w-0 flex-col">
          <span>{t("reopen")}</span>
          <span className="text-xs font-normal text-fg-muted">{t("reopenHint")}</span>
        </div>
        <Switch aria-label={t("reopen")} checked={prefs.reactivateOnReopen} disabled={update.isPending} onCheckedChange={(reactivateOnReopen) => save({ reactivateOnReopen })} />
      </UtilityField>
      <PushDevices />
    </>
  );
}

function PushDevices() {
  const t = useTranslations("Services.preferences");
  const format = useServiceFormat();
  const query = usePushDevices();
  const revoke = useRevokePushDevice();
  const message = useServiceError();
  return (
    <UtilityField className="flex-col items-stretch gap-2 py-3">
      <span>{t("devices")}</span>
      <p className="text-xs font-normal text-fg-muted">{t("devicesHint")}</p>
      {query.isPending ? (
        <Skeleton className="h-10 rounded-row" />
      ) : query.isError ? (
        <ErrorState variant="bare" title={t("devicesError")} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-sm font-normal text-fg-secondary">{t("noDevices")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {query.data.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <MonitorSmartphone aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 truncate">
                  <bdi dir="auto">{device.label ?? device.host}</bdi>
                  <span className="text-xs font-normal text-fg-muted"> · {format.day(dayOfInstant(device.createdAt))}</span>
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={revoke.isPending}
                onClick={() =>
                  revoke.mutate(device, {
                    onSuccess: () => toast({ tone: "neutral", title: t("revoked") }),
                    onError: (error) => toast({ tone: "danger", title: message(error) }),
                  })
                }
              >
                {t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </UtilityField>
  );
}
