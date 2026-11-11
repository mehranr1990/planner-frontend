import { TeamCalendarScreen } from "@/features/teams/calendar/team-calendar-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-03 · Team calendar: /teams/[id]/calendar (?view · ?date · ?cal · ?event), inside the team gate. */
export default function TeamCalendarPage() {
  return <TeamCalendarScreen />;
}
