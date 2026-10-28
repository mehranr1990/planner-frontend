import type { Area, TaskPriority } from "@/data/domain";
import { normalizeSearchText } from "@/data/task-query";
import { addDaysToDay, formatClockTime } from "@/lib/dates/clock-time";

/*
 * The tiny parser behind the add-task row (and Quick Add later). It reads
 * tokens anywhere in the line:
 *
 *   !urgent !high !medium !low   (فوری، بالا، متوسط، کم)   priority
 *   ~15m  ~1h  ~1h30m  ~90      (د = minutes, س = hours)    duration
 *   today tomorrow              (امروز، فردا، پس‌فردا)       date, from the planner's today
 *   18:00  at 18  ساعت ۱۸        (Persian digits fine)       time
 *   #finance  #مالی              (with `areas`: known names)  area
 *
 * What is left, in order, is the title. Each kind is taken once; a second
 * match stays in the title. A time alone leaves `date` unset: the caller
 * decides (the Today row adds today). Pure, no clock: `today` is passed in.
 */

export type QuickParseField = "priority" | "duration" | "date" | "time" | "area";

export interface QuickParseResult {
  title: string;
  priority?: TaskPriority;
  durationMinutes?: number;
  /** "YYYY-MM-DD". */
  date?: string;
  /** "HH:mm". */
  time?: string;
  /** A known area named with #name (only when `areas` were passed). */
  area?: Area;
  /** Which kinds were found, for a live "Tomorrow · 18:00 · High · 15m" preview. */
  recognized: QuickParseField[];
}

const PRIORITIES: Record<string, TaskPriority> = {
  urgent: "urgent",
  high: "high",
  medium: "medium",
  low: "low",
  "فوری": "urgent", // فوری
  "بالا": "high", // بالا
  "متوسط": "medium", // متوسط
  "کم": "low", // کم
};

/** Day offsets for the date words, folded the way tokens are (no half-space). */
const DATE_WORDS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  "امروز": 0, // امروز
  "فردا": 1, // فردا
  "پسفردا": 2, // پس‌فردا
};

/** Words that may introduce a time: "at 18", "ساعت ۱۸". */
const TIME_WORDS = new Set(["at", "ساعت"]);

const DURATION = new RegExp(
  "^~(?:(\\d+)(?:h|hr|hrs|\\u0633|\\u0633\\u0627\\u0639\\u062A))?(?:(\\d+)(?:m|min|mins|\\u062F|\\u062F\\u0642\\u06CC\\u0642\\u0647))?$",
);
const BARE_MINUTES = /^~(\d+)$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const BARE_HOUR = /^(\d|1\d|2[0-3])$/;

const MAX_DURATION = 24 * 60;

function parseDuration(token: string): number | null {
  const bare = BARE_MINUTES.exec(token);
  if (bare) return Number(bare[1]);
  const match = DURATION.exec(token);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export interface QuickParseOptions {
  /** Areas a #token may name; an unknown #word stays in the title. */
  areas?: readonly Area[];
}

export function quickParse(input: string, today: string, { areas }: QuickParseOptions = {}): QuickParseResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const folded = tokens.map((token) => normalizeSearchText(token));
  const used = new Set<number>();
  const result: QuickParseResult = { title: "", recognized: [] };

  folded.forEach((token, index) => {
    if (token.startsWith("#") && areas && result.area === undefined) {
      const name = token.slice(1);
      const area = areas.find((candidate) => normalizeSearchText(candidate.name) === name);
      if (area) {
        result.area = area;
        used.add(index);
        result.recognized.push("area");
      }
      return;
    }
    if (token.startsWith("!") && result.priority === undefined) {
      const priority = PRIORITIES[token.slice(1)];
      if (priority) {
        result.priority = priority;
        used.add(index);
        result.recognized.push("priority");
      }
      return;
    }
    if (token.startsWith("~") && result.durationMinutes === undefined) {
      const minutes = parseDuration(token);
      if (minutes !== null && minutes > 0 && minutes <= MAX_DURATION) {
        result.durationMinutes = minutes;
        used.add(index);
        result.recognized.push("duration");
      }
      return;
    }
    if (result.date === undefined && token in DATE_WORDS) {
      result.date = addDaysToDay(today, DATE_WORDS[token]!);
      used.add(index);
      result.recognized.push("date");
      return;
    }
    if (result.time === undefined) {
      const clock = CLOCK.exec(token);
      const introduced = index > 0 && TIME_WORDS.has(folded[index - 1]!) && !used.has(index - 1);
      const hour = clock ? null : introduced && BARE_HOUR.test(token) ? Number(token) : null;
      if (clock || hour !== null) {
        result.time = clock ? formatClockTime(Number(clock[1]) * 60 + Number(clock[2])) : formatClockTime(hour! * 60);
        used.add(index);
        if (introduced) used.add(index - 1);
        result.recognized.push("time");
      }
    }
  });

  result.title = tokens.filter((_, index) => !used.has(index)).join(" ");
  return result;
}
