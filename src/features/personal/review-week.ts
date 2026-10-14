import { dayToDate, getPlannerToday } from "@/data/clock";
import { formatDateParam } from "@/lib/dates/date-param";
import { getWeekDates, IRAN_WEEK, type WeekConfig } from "@/lib/dates/week";

/*
 * Weekly review routes are /personal/review/:week, where :week is the Jalali
 * date of the week's first day in the date-param format ("1405-07-19").
 */

/** The :week segment for the week containing `day`. */
export function reviewWeekParam(day: Date, week: WeekConfig = IRAN_WEEK): string {
  return formatDateParam(getWeekDates(day, week)[0]!);
}

/** This week's review (the planner's "today"). */
export function currentReviewHref(week: WeekConfig = IRAN_WEEK): string {
  return `/personal/review/${reviewWeekParam(dayToDate(getPlannerToday()), week)}`;
}
