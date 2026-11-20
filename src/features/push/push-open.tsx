"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import { useRepositories } from "@/data/provider";
import { taskDetailHref } from "@/features/personal/routes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * A push click lands on /personal?push=<notificationId> (built by sw.js).
 * The notification is read with the session (ownership is the server's): an
 * accessible one is marked read and opens its task; one without a task stays
 * on the page; a missing / foreign / malformed one falls back here with a
 * notice. The param is always removed, so a reload never repeats it.
 */
export function PushOpen() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { notifications } = useRepositories();
  const t = useTranslations("Services.pushOpen");
  const id = params.get("push");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (id === null || handled.current === id) return;
    handled.current = id;
    const rest = new URLSearchParams(params);
    rest.delete("push");
    const here = rest.size ? `${pathname}?${rest}` : pathname;
    if (!UUID.test(id)) {
      router.replace(here);
      return;
    }
    void notifications
      .get(id)
      .then(async (notification) => {
        if (!notification.read) await notifications.setRead(notification, true).catch(() => undefined);
        router.replace(notification.taskId ? taskDetailHref(notification.taskId) : here);
      })
      .catch(() => {
        router.replace(here);
        toast({ tone: "neutral", title: t("gone") });
      });
  }, [id, params, pathname, router, notifications, t]);

  return null;
}
