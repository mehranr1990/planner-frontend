"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { ApiHttpError } from "@/api/errors";
import { RepositoryError } from "@/data/repositories";

/*
 * One honest message per failure (401 is handled globally: sign-in).
 * 403 → no access, 404 → gone, 400/422 → refused, 409 (after the one
 * automatic re-read) → changed elsewhere, 413 → too large, else generic.
 */
export function useServiceError() {
  const t = useTranslations("Services.errors");
  return useCallback(
    (error: unknown): string => {
      if (error instanceof RepositoryError) {
        if (error.code === "forbidden") return t("forbidden");
        if (error.code === "not-found") return t("notFound");
        if (error.code === "invalid") return t("invalid");
        if (error.code === "conflict") return t("conflict");
        if (error.code === "unsupported") return t("unsupported");
      }
      if (error instanceof ApiHttpError) {
        if (error.status === 409) return t("conflict");
        if (error.status === 413) return t("tooLarge");
        if (error.status === 415) return t("invalid");
        if (error.status === 429) return t("rateLimited");
      }
      return t("generic");
    },
    [t],
  );
}
