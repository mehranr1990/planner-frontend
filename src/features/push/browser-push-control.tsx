"use client";

import { BellRing } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { NotificationPreferences, NotificationPreferencesPatch, PushDevice } from "@/data/personal-services";
import { useRegisterPushDevice, useRevokePushDevice } from "@/data/personal-services-queries";
import { useServiceError } from "@/features/personal-services/service-error";
import {
  currentSubscription,
  pushPermission,
  pushSupport,
  readLocalDevice,
  refreshWorker,
  requestPushPermission,
  subscribeBrowser,
  unsubscribeBrowser,
  writeLocalDevice,
  type PushSupport,
} from "./browser-push";

/*
 * Settings · Notifications · "This browser": turns Web Push on or off for the
 * current browser. Permission is asked only from the button. The browser is
 * "on" when its live subscription is the one this account registered and the
 * server still lists it (a provider-expired or remotely revoked one shows as
 * off, and turning it on again re-subscribes).
 */

type Status = PushSupport | "server-off" | "denied" | "on" | "off" | "checking";

export function BrowserPushControl({
  prefs,
  devices,
  onChannel,
}: {
  prefs: NotificationPreferences;
  /** Active server devices, or null while loading / on error. */
  devices: PushDevice[] | null;
  onChannel: (patch: NotificationPreferencesPatch) => void;
}) {
  const t = useTranslations("Services.preferences.browser");
  const locale = useLocale();
  const message = useServiceError();
  const register = useRegisterPushDevice();
  const revoke = useRevokePushDevice();
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const serverKey = prefs.available.includes("webPush") ? prefs.pushPublicKey : null;

  useEffect(() => {
    let live = true;
    const settle = (next: Status) => live && setStatus(next);
    const support = pushSupport();
    if (support !== "supported") settle(support);
    else if (!serverKey) settle("server-off");
    else if (pushPermission() === "denied") settle("denied");
    else if (devices === null) settle("checking");
    else
      void currentSubscription()
        .then((subscription) => {
          const local = readLocalDevice();
          const on = !!subscription && !!local && local.endpoint === subscription.endpoint && devices.some((device) => device.id === local.id);
          settle(on ? "on" : "off");
          if (on) void refreshWorker(locale).catch(() => undefined);
        })
        .catch(() => settle("off"));
    return () => {
      live = false;
    };
  }, [serverKey, devices, locale]);

  async function enable() {
    if (!serverKey) return;
    setBusy(true);
    try {
      const permission = await requestPushPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const input = await subscribeBrowser(serverKey, locale);
      try {
        const device = await register.mutateAsync(input);
        writeLocalDevice({ id: device.id, endpoint: input.endpoint });
      } catch (error) {
        // The server refused it: drop the browser side too, so nothing is orphaned.
        await unsubscribeBrowser().catch(() => undefined);
        throw error;
      }
      if (!prefs.channels.webPush) onChannel({ channels: { webPush: true } });
      setStatus("on");
      toast({ tone: "neutral", title: t("enabled") });
    } catch (error) {
      toast({ tone: "danger", title: error instanceof Error && error.name === "NotAllowedError" ? t("blocked") : message(error) });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const local = readLocalDevice();
      const device = devices?.find((item) => item.id === local?.id);
      if (device) await revoke.mutateAsync(device);
      await unsubscribeBrowser();
      writeLocalDevice(null);
      setStatus("off");
      toast({ tone: "neutral", title: t("disabled") });
    } catch (error) {
      toast({ tone: "danger", title: message(error) });
    } finally {
      setBusy(false);
    }
  }

  const hint =
    status === "unsupported" || status === "insecure" || status === "ios-install" || status === "server-off" || status === "denied"
      ? t(`state.${status === "server-off" ? "serverOff" : status === "ios-install" ? "iosInstall" : status}`)
      : status === "on"
        ? t("state.on")
        : status === "off"
          ? t("state.off")
          : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-push-status={status}>
      <div className="flex min-w-0 items-start gap-2">
        <BellRing aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-fg-muted" />
        <div className="flex min-w-0 flex-col">
          <span className="text-sm">{t("title")}</span>
          <span className="text-xs font-normal text-fg-muted" role="status" aria-live="polite">
            {hint}
          </span>
        </div>
      </div>
      {status === "on" ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void disable()}>
          {t("turnOff")}
        </Button>
      ) : status === "off" ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void enable()}>
          {t("turnOn")}
        </Button>
      ) : null}
    </div>
  );
}

/** Revoking this browser's own device from the list also drops its browser subscription. */
export async function forgetIfThisBrowser(device: PushDevice): Promise<void> {
  if (readLocalDevice()?.id !== device.id) return;
  writeLocalDevice(null);
  await unsubscribeBrowser().catch(() => undefined);
}

export function isThisBrowser(device: PushDevice): boolean {
  return readLocalDevice()?.id === device.id;
}
