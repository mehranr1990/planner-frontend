"use client";

import { useTranslations } from "next-intl";
import { RepositoryError } from "@/data/repositories";

/** An action the connected backend does not offer (live mode refuses it before any request). */
export const isUnavailable = (error: unknown): boolean => error instanceof RepositoryError && error.code === "unsupported";

/** "Not available yet" for an unsupported action, null for every other error (callers keep their own title). */
export function useUnavailableTitle() {
  const t = useTranslations("ContextShell");
  return (error: unknown): string | null => (isUnavailable(error) ? t("unavailable") : null);
}
