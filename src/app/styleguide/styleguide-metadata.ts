import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { StyleguidePageId } from "@/features/styleguide/pages";

/** Translated <title> and description for a styleguide page ("Components · Styleguide · Mehran Planner"). */
export async function styleguideMetadata(page: StyleguidePageId): Promise<Metadata> {
  const t = await getTranslations("Styleguide.meta");
  return { title: t(`${page}.title`), description: t(`${page}.description`) };
}
