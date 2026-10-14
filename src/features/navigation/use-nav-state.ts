"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useInboxCount } from "@/data/queries";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { isCoreModule, isOptionalModule } from "@/features/planner-settings/modules";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import type { AppContext, NavItem } from "./types";

/*
 * Live navigation state for the Personal context: hidden modules (P17) leave
 * the rail, the More sheet and search; the Inbox carries its untriaged count
 * (P07). Other contexts show every item and no badges.
 */

/** Whether a nav item is shown in this context, given the hidden modules. */
export function useNavItemFilter(context: AppContext): (item: NavItem) => boolean {
  const settings = usePlannerSettings();
  const personal = context.id === "personal";
  return useCallback(
    (item: NavItem) =>
      !personal || isCoreModule(item.id) || !isOptionalModule(item.id) || isModuleVisible(settings, item.id),
    [personal, settings],
  );
}

/** The visible count badge for an item, or undefined (no badge item, loading, or zero). */
export function useNavBadge(item: NavItem): { count: string; label: string } | undefined {
  const t = useTranslations("Navigation.badges");
  const { digits } = usePreferences();
  // Always called (hooks order); the query is shared and cheap.
  const inbox = useInboxCount();
  if (item.badge !== "inbox") return undefined;
  const count = inbox.data ?? 0;
  if (count <= 0) return undefined;
  const visible = formatNumber(count, digits);
  return { count: visible, label: t("inbox", { count: visible }) };
}
