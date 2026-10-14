import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ContextId } from "@/features/navigation/types";

/** Translated <title> for a context overview ("Personal overview · Mehran Planner"). */
export async function contextOverviewMetadata(context: ContextId): Promise<Metadata> {
  const t = await getTranslations("Shell.pages");
  return { title: t(`${context}.title`) };
}
