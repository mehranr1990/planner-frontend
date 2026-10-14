/*
 * SAMPLE DATA for the application shell (Shell + S2MyDay boards).
 * Fixed dates (Tue 13 Oct 2026, now 14:35 in Tehran) so previews and tests
 * are stable. Instants carry an explicit +03:30 offset (Asia/Tehran, no DST),
 * so a UTC server and a browser anywhere build the same moments; components
 * display them through toZonedTime(…, APP_TIME_ZONE).
 * Replace with real calendar / workspace data when the backend lands.
 */

import type { ScheduleBlock } from "@/components/shell/schedule";
import type { Scope } from "@/design-system/tokens/colors";

export type { ScheduleBlock };

export interface SampleWorkspace {
  id: string;
  name: string;
}

/** Marks every export in this module as sample content. */
export const isSampleData = true;

const pad = (value: number) => String(value).padStart(2, "0");

/** An instant on the sample day, given as Tehran wall-clock time. */
const at = (hours: number, minutes = 0) => new Date(`2026-10-13T${pad(hours)}:${pad(minutes)}:00+03:30`);

export const sampleScheduleDate = at(0);
export const sampleNow = at(14, 35);

export const sampleScheduleBlocks: readonly ScheduleBlock[] = [
  { id: "morning-routine", title: "Morning routine", start: at(8), end: at(8, 45), scope: "personal" },
  { id: "deep-work", title: "Deep work · Planner design", start: at(9), end: at(11), scope: "personal" },
  { id: "design-review", title: "Design review", start: at(11), end: at(11, 45), scope: "team" },
  { id: "lunch", title: "Lunch", start: at(13), end: at(13, 45), scope: "personal" },
  {
    id: "ui-design",
    title: "UI design · My Day",
    start: at(14),
    end: at(16),
    scope: "project",
    people: ["Peter Thomas", "Jonathan Kelly"],
  },
  { id: "client-call", title: "Client call", start: at(16, 30), end: at(17), scope: "project" },
  { id: "gym", title: "Gym", start: at(17, 15), end: at(18, 15), scope: "personal" },
];

/** The signed-in person shown in the account menu (no auth until Step 3). */
export interface SampleProfile {
  name: string;
  /** Secondary line under the name, e.g. organisation · role. Data, not translated. */
  detail: string;
}

export const sampleProfile: SampleProfile = { name: "Mehran", detail: "Euroly · Admin" };

export const sampleWorkspaces: Readonly<Record<Scope, readonly SampleWorkspace[]>> = {
  personal: [{ id: "mehran", name: "Mehran" }],
  project: [
    { id: "website-redesign", name: "Website Redesign" },
    { id: "planner-app", name: "Planner App" },
    { id: "mobile-launch", name: "Mobile Launch" },
  ],
  team: [
    { id: "design-team", name: "Design Team" },
    { id: "engineering", name: "Engineering" },
    { id: "marketing", name: "Marketing" },
  ],
  company: [
    { id: "euroly", name: "Euroly" },
    { id: "araxitis", name: "Araxitis" },
  ],
};

/*
 * Localised sample content. Event titles and workspace names are user
 * content in the real product (never translated); the sample set simply
 * ships an English and a Persian version so each locale previews naturally.
 */
const FA_BLOCK_TITLES: Record<string, string> = {
  "morning-routine": "روال صبحگاهی",
  "deep-work": "کار عمیق · طراحی برنامه‌ریز",
  "design-review": "بازبینی طراحی",
  lunch: "ناهار",
  "ui-design": "طراحی رابط · صفحه‌ی امروز",
  "client-call": "تماس با مشتری",
  gym: "باشگاه",
};

const FA_PEOPLE: Record<string, string> = { "Peter Thomas": "پیتر توماس", "Jonathan Kelly": "جاناتان کلی" };

const FA_WORKSPACE_NAMES: Record<string, string> = {
  mehran: "مهران",
  "website-redesign": "بازطراحی وب‌سایت",
  "planner-app": "اپ برنامه‌ریز",
  "mobile-launch": "عرضه‌ی موبایل",
  "design-team": "تیم طراحی",
  engineering: "مهندسی",
  marketing: "بازاریابی",
  euroly: "یورولی",
  araxitis: "آراکسیتیس",
};

export interface SampleShellData {
  profile: SampleProfile;
  workspaces: Readonly<Record<Scope, readonly SampleWorkspace[]>>;
  schedule: { date: Date; now: Date; blocks: readonly ScheduleBlock[] };
}

/** The sample shell content for a UI language. */
export function getSampleShellData(locale: "en" | "fa"): SampleShellData {
  if (locale === "en") {
    return {
      profile: sampleProfile,
      workspaces: sampleWorkspaces,
      schedule: { date: sampleScheduleDate, now: sampleNow, blocks: sampleScheduleBlocks },
    };
  }
  const workspaces = Object.fromEntries(
    Object.entries(sampleWorkspaces).map(([scope, list]) => [
      scope,
      list.map((workspace) => ({ ...workspace, name: FA_WORKSPACE_NAMES[workspace.id] ?? workspace.name })),
    ]),
  ) as Record<Scope, SampleWorkspace[]>;
  return {
    profile: { name: "مهران", detail: "یورولی · مدیر" },
    workspaces,
    schedule: {
      date: sampleScheduleDate,
      now: sampleNow,
      blocks: sampleScheduleBlocks.map((block) => ({
        ...block,
        title: FA_BLOCK_TITLES[block.id] ?? block.title,
        people: block.people?.map((person) => FA_PEOPLE[person] ?? person),
      })),
    },
  };
}
