import { getYear as getJalaliYear, newDate as newJalaliDate } from "date-fns-jalali";
import type { ProjectPerson, ProjectPriority } from "@/data/project-domain";
import { normalizeSearchText } from "@/data/task-query";
import { quickParse } from "@/features/tasks/domain/quick-parse";
import { toLatinDigits } from "@/lib/locale/digits";

/*
 * Quick add for project tasks (PJ-02): Personal's parser (!priority, ~estimate,
 * today/tomorrow) plus two project tokens:
 *
 *   @kian            a project member by first name (or initials)  → pending assignment
 *   due 25 Oct       a day + Gregorian month (en) — or "موعد ۲۵ آبان" (Jalali)
 *
 * "~3h" becomes the estimate in hours. What is left is the title. Pure: the
 * caller passes today and the members.
 */

export interface ProjectQuickParse {
  title: string;
  assignee?: ProjectPerson;
  priority?: ProjectPriority;
  due?: string;
  estimateHours?: number;
}

const GREGORIAN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const DUE_WORDS = new Set(["due", "موعد"]);

const pad = (value: number) => String(value).padStart(2, "0");
const toDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The next occurrence (today or later) of a day + month. */
function resolveDue(dayText: string, monthText: string, today: string): string | undefined {
  const day = Number(toLatinDigits(dayText));
  if (!Number.isInteger(day) || day < 1 || day > 31) return undefined;
  const month = monthText.toLocaleLowerCase();
  const gregorian = GREGORIAN_MONTHS.findIndex((name) => month.startsWith(name));
  const year = Number(today.slice(0, 4));
  if (gregorian >= 0) {
    for (const candidate of [year, year + 1]) {
      const date = new Date(candidate, gregorian, day);
      if (date.getMonth() === gregorian && toDay(date) >= today) return toDay(date);
    }
    return undefined;
  }
  const jalali = JALALI_MONTHS.findIndex((name) => normalizeSearchText(name) === normalizeSearchText(monthText));
  if (jalali < 0) return undefined;
  const jalaliYear = getJalaliYear(new Date(year, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))));
  for (const candidate of [jalaliYear, jalaliYear + 1]) {
    const date = newJalaliDate(candidate, jalali, day);
    if (toDay(date) >= today) return toDay(date);
  }
  return undefined;
}

function findMember(handle: string, members: readonly ProjectPerson[]): ProjectPerson | undefined {
  const needle = normalizeSearchText(handle);
  return members.find((person) => {
    const first = normalizeSearchText(person.name.split(/\s+/)[0] ?? "");
    return first === needle || normalizeSearchText(person.initials) === needle || person.id === needle;
  });
}

export function projectQuickParse(input: string, today: string, members: readonly ProjectPerson[]): ProjectQuickParse {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const result: ProjectQuickParse = { title: "" };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.startsWith("@") && !result.assignee) {
      const member = findMember(token.slice(1), members);
      if (member) {
        result.assignee = member;
        continue;
      }
    }
    if (DUE_WORDS.has(token.toLocaleLowerCase()) && !result.due && index + 2 < tokens.length) {
      const due = resolveDue(tokens[index + 1]!, tokens[index + 2]!, today);
      if (due) {
        result.due = due;
        index += 2;
        continue;
      }
    }
    kept.push(token);
  }

  const base = quickParse(kept.join(" "), today);
  result.title = base.title;
  if (base.priority) result.priority = base.priority;
  if (!result.due && base.date) result.due = base.date;
  if (base.durationMinutes) result.estimateHours = Math.round((base.durationMinutes / 60) * 10) / 10;
  return result;
}
