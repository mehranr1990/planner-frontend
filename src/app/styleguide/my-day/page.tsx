import type { Metadata } from "next";
import { MyDayDemo } from "@/features/styleguide/my-day/my-day-demo";

/*
 * Dev harness for P02 My Day (not linked from any navigation): the screen
 * without the app shell, on an isolated demo state. Query: ?state=normal |
 * empty | partial | overloaded | no-current | after-hours, &reschedule=<block
 * id>, &view=3days (details in features/styleguide/my-day/demo-params.ts).
 */

// Localised from the preferences cookie by the root layout, like every route: opt out of instant validation.
export const instant = false;

export const metadata: Metadata = {
  title: "My Day · states",
  robots: { index: false, follow: false },
};

export default function StyleguideMyDayPage() {
  return <MyDayDemo />;
}
