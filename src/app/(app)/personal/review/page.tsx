import { redirect } from "next/navigation";
import { currentReviewHref } from "@/features/personal/review-week";
import { getRequestPlannerSettings } from "@/features/planner-settings/request-planner-settings";

export const instant = false;

/** /personal/review → this week's review (week = Jalali date of its first day, per the user's week settings). */
export default async function WeeklyReviewIndexPage() {
  const settings = await getRequestPlannerSettings();
  redirect(currentReviewHref(settings.week));
}
