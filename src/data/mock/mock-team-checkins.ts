import { checkinReplyFixtures, defaultCheckinSchedule, type CheckinReplySeed } from "@/fixtures/team-checkins";
import { CURRENT_WEEK } from "@/fixtures/team-work";
import { RepositoryError } from "../repositories";
import type {
  CheckinAnswers,
  CheckinComment,
  CheckinReply,
  CheckinSchedule,
  CheckinWeek,
  CheckinWeekStatus,
  TeamCapabilities,
  TeamPerson,
  TeamRole,
} from "../team-domain";
import type { TeamAccessOptions, TeamCheckinRepository } from "../team-repositories";

/*
 * Mock checkinRepo (TM-09). Three work questions per person per week (owner
 * answer): no mood, no scores, no streaks. Replies are editable until the
 * week closes; a missing reply may still be sent for 24h after closing,
 * marked late only to its author (T12). Viewers read only. Leads remind
 * non-responders once per week (never people off today, never themselves).
 */

export interface MockTeamCheckinsOptions {
  respond<T>(value: T): Promise<T>;
  today: string;
  now: string;
  team(teamId: string): { members: readonly TeamPerson[]; roleOf(personId: string): TeamRole };
  capabilities(teamId: string, options?: TeamAccessOptions): TeamCapabilities;
  /** Manual status "off" right now (presenceRepo); nothing is inferred. */
  isOff(teamId: string, personId: string): boolean;
  /** My reply for the current week changed (the rail badge follows). */
  onMineChanged?(teamId: string, missing: boolean): void;
}

const DAY = 86_400_000;
const BASE_WEEK_NUMBER = 42;

interface StoredReply extends CheckinReplySeed {
  late?: boolean;
  skipped?: boolean;
  comments: CheckinComment[];
}

const dayMs = (value: string) => Date.parse(`${value}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Saturday that starts the Iran week of `day`. */
export function checkinWeekOf(day: string): string {
  const ms = dayMs(day);
  const offset = (new Date(ms).getUTCDay() - 6 + 7) % 7;
  return isoDay(ms - offset * DAY);
}

/** The closing instant of a week (Iran time, +03:30). */
export function checkinClosesAt(week: string, schedule: CheckinSchedule): string {
  const offset = (schedule.closesDay - 6 + 7) % 7;
  return `${isoDay(dayMs(week) + offset * DAY)}T${schedule.closesTime}:00+03:30`;
}

export function checkinStatus(closesAt: string, now: string): CheckinWeekStatus {
  const close = Date.parse(closesAt);
  const at = Date.parse(now);
  if (at < close) return "open";
  return at < close + DAY ? "late" : "closed";
}

export function createMockTeamCheckins(options: MockTeamCheckinsOptions): TeamCheckinRepository {
  const { respond, today, now, team, capabilities, isOff, onMineChanged } = options;
  const currentWeek = checkinWeekOf(today);
  const replies = new Map<string, StoredReply[]>();
  for (const [teamId, weeks] of Object.entries(checkinReplyFixtures)) {
    for (const [week, seeds] of Object.entries(weeks)) {
      replies.set(`${teamId}:${week}`, seeds.map((seed) => ({ ...structuredClone(seed), comments: [...(seed.comments ?? [])] })));
    }
  }
  const schedules = new Map<string, CheckinSchedule>();
  const reminded = new Map<string, string>();
  let counter = 0;

  const scheduleOf = (teamId: string) => schedules.get(teamId) ?? defaultCheckinSchedule;
  const listOf = (teamId: string, week: string) => {
    const key = `${teamId}:${week}`;
    if (!replies.has(key)) replies.set(key, []);
    return replies.get(key)!;
  };
  const weekNumber = (week: string) => BASE_WEEK_NUMBER + Math.round((dayMs(week) - dayMs(CURRENT_WEEK)) / (7 * DAY));
  const statusOf = (teamId: string, week: string): CheckinWeekStatus =>
    week > currentWeek ? "closed" : checkinStatus(checkinClosesAt(week, scheduleOf(teamId)), now);
  const check = (week: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || checkinWeekOf(week) !== week || week > currentWeek) {
      throw new RepositoryError("not-found", "No such check-in week");
    }
  };

  const view = (teamId: string, week: string, preview?: TeamAccessOptions): CheckinWeek => {
    const { members, roleOf } = team(teamId);
    const caps = capabilities(teamId, preview);
    const status = statusOf(teamId, week);
    const stored = listOf(teamId, week);
    const person = (id: string) => members.find((item) => item.id === id);
    const toReply = (seed: StoredReply, mine: boolean): CheckinReply | null => {
      const who = person(seed.personId);
      if (!who) return null;
      return {
        id: seed.id,
        person: who,
        answers: structuredClone(seed.answers),
        sentAt: seed.sentAt,
        // "late" is visible only to the author.
        ...(mine && seed.late ? { late: true } : {}),
        comments: structuredClone(seed.comments),
      };
    };
    const own = stored.find((seed) => seed.personId === "me");
    const others = stored
      .filter((seed) => seed.personId !== "me" && !seed.skipped)
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
      .flatMap((seed) => toReply(seed, false) ?? []);
    // Viewers never reply: they are not counted.
    const expected = members.filter((member) => (member.id === "me" ? preview?.previewRole ?? roleOf("me") : roleOf(member.id)) !== "viewer");
    const answered = new Set(stored.filter((seed) => !seed.skipped).map((seed) => seed.personId));
    const skipped = new Set(stored.filter((seed) => seed.skipped).map((seed) => seed.personId));
    const notYet = expected
      .filter((member) => !answered.has(member.id) && !skipped.has(member.id))
      .map((member) => ({ person: member, off: week === currentWeek && isOff(teamId, member.id) }));
    const writable = status !== "closed" && caps.createTask;
    const mineState = !own ? "missing" : own.skipped ? "skipped" : "sent";
    return {
      week,
      weekNumber: weekNumber(week),
      status,
      closesAt: checkinClosesAt(week, scheduleOf(teamId)),
      schedule: { ...scheduleOf(teamId) },
      current: { week: currentWeek, weekNumber: weekNumber(currentWeek) },
      // Last week always; earlier weeks only when they have replies (closed, read-only).
      previous: [1, 2, 3]
        .map((back) => isoDay(dayMs(currentWeek) - back * 7 * DAY))
        .filter((item, index) => index === 0 || listOf(teamId, item).length > 0)
        .map((item) => ({ week: item, weekNumber: weekNumber(item) })),
      replies: others,
      mine: { state: mineState, reply: own && !own.skipped ? toReply(own, true) : null },
      replied: expected.filter((member) => answered.has(member.id)),
      notYet,
      remindable: notYet.filter((entry) => !entry.off && entry.person.id !== "me").length,
      remindedAt: reminded.get(`${teamId}:${week}`) ?? null,
      can: {
        // Late (T12): only a missing reply, within 24h of closing.
        reply: writable && (status === "open" || mineState === "missing"),
        comment: writable,
        remind: status === "open" && caps.editWeekFocus,
        makeTask: caps.createTask,
      },
    };
  };

  return {
    async summary(teamId) {
      const current = view(teamId, currentWeek);
      return respond({
        week: currentWeek,
        replied: current.replied.length,
        total: current.replied.length + current.notYet.length,
        closesAt: current.closesAt,
        mine: current.mine.state === "missing" && current.can.reply ? "missing" : "sent",
      });
    },
    async week(teamId, week = currentWeek, preview) {
      team(teamId);
      check(week);
      return respond(view(teamId, week, preview));
    },
    async reply(teamId, week, input) {
      team(teamId);
      check(week);
      const current = view(teamId, week);
      if (!capabilities(teamId).createTask) throw new RepositoryError("forbidden", "Viewers read replies");
      if (!current.can.reply) throw new RepositoryError("conflict", "This week is closed");
      const list = listOf(teamId, week);
      const existing = list.find((seed) => seed.personId === "me");
      if ("skip" in input) {
        const skip: StoredReply = { id: existing?.id ?? `ci-me-${++counter}`, personId: "me", answers: { did: "", next: "", blocked: "" }, sentAt: now, skipped: true, comments: [] };
        if (existing) Object.assign(existing, skip);
        else list.push(skip);
      } else {
        const answers: CheckinAnswers = { did: input.did.trim(), next: input.next.trim(), blocked: input.blocked.trim() };
        if (!answers.did && !answers.next) throw new RepositoryError("invalid", "Did or Next required");
        const late = current.status === "late";
        if (existing) Object.assign(existing, { answers, sentAt: now, skipped: false, late: existing.late || late });
        else list.push({ id: `ci-me-${++counter}`, personId: "me", answers, sentAt: now, late, comments: [] });
      }
      if (week === currentWeek) onMineChanged?.(teamId, false);
      return respond(view(teamId, week));
    },
    async comment(teamId, replyId, body) {
      const { members } = team(teamId);
      const text = body.trim();
      if (!text) throw new RepositoryError("invalid", "Comment required");
      for (const [key, list] of replies) {
        if (!key.startsWith(`${teamId}:`)) continue;
        const reply = list.find((seed) => seed.id === replyId);
        if (!reply) continue;
        if (!view(teamId, key.slice(teamId.length + 1)).can.comment) throw new RepositoryError("forbidden", "Read only");
        const comment: CheckinComment = { id: `cc-new-${++counter}`, author: members.find((item) => item.id === "me")!, body: text, at: now };
        reply.comments.push(comment);
        return respond(structuredClone(comment));
      }
      throw new RepositoryError("not-found", "Reply not found");
    },
    async remind(teamId, week) {
      team(teamId);
      check(week);
      const current = view(teamId, week);
      if (!current.can.remind) throw new RepositoryError("forbidden", "Lead+ only, while open");
      if (current.remindedAt) throw new RepositoryError("conflict", "Already reminded this week");
      reminded.set(`${teamId}:${week}`, now);
      return respond({ reminded: current.remindable });
    },
    async schedule(teamId) {
      team(teamId);
      return respond({ ...scheduleOf(teamId) });
    },
    async setSchedule(teamId, next) {
      team(teamId);
      if (!capabilities(teamId).editWeekFocus) throw new RepositoryError("forbidden", "Lead+ only");
      if (!/^\d{2}:\d{2}$/.test(next.opensTime) || !/^\d{2}:\d{2}$/.test(next.closesTime)) {
        throw new RepositoryError("invalid", "Bad time");
      }
      schedules.set(teamId, { ...next });
      return respond({ ...next });
    },
  };
}
