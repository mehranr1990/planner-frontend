import { getTranslations } from "next-intl/server";
import type { PersonalPageId } from "./pages";

/** Localised <title> for a Personal page ("My Day · Mehran Planner"). */
export async function personalPageMetadata(page: PersonalPageId) {
  const t = await getTranslations("Personal");
  return { title: t(`pages.${page}.title`) };
}
