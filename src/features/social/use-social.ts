"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useGroupAccess } from "@/data/social-queries";
import { SocialError } from "@/data/social-repositories";
import { socialGroupIdFromPath } from "./paths";

/** The group in the URL (/social/groups/[id]/…) and its access answer (SO-01). */
export function useCurrentSocialGroup() {
  const groupId = socialGroupIdFromPath(usePathname() ?? "");
  const access = useGroupAccess(groupId);
  const group = access.data?.kind === "member" ? access.data.group : undefined;
  return { groupId, access, group };
}

/** One message per Social error code (never reveals more than the server said). */
export function useSocialErrorText() {
  const t = useTranslations("Social.common");
  return useCallback(
    (error: unknown) => {
      if (error instanceof SocialError) {
        if (error.code === "forbidden" || error.code === "not-found") return t("forbidden");
        if (error.code === "conflict") return t("conflict");
        if (error.code === "unsupported") return `${t("unsupportedTitle")} · ${t("unsupportedBody")}`;
      }
      return t("failed");
    },
    [t],
  );
}

/** A client operation id for idempotent creates (one per opened form). */
export function newClientOpId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}:${random}`;
}
