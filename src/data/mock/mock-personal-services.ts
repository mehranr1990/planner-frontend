import { addDaysToDay, diffDays, parseDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { shiftDecimal } from "@/lib/locale/decimal";
import type { Transaction } from "../domain";
import type {
  Bill,
  BillOccurrence,
  BillVersion,
  NotificationPreferences,
  PersonalServiceRepositories,
  Reminder,
  RepeatRule,
  Routine,
  TaskAttachment,
} from "../personal-services";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from "../personal-services";
import { RepositoryError } from "../repositories";

/*
 * Mock mode for the Personal services: in-memory, starting empty. The
 * notification inbox stays empty (nothing ever fires without a server), so
 * the bell keeps its "all caught up" state; reminders, routines, files and
 * bills behave like the API without delivery.
 */

const clone = <T>(value: T): T => structuredClone(value);
const notFound = (what: string): never => {
  throw new RepositoryError("not-found", `No ${what}`);
};
const invalid = (message: string): never => {
  throw new RepositoryError("invalid", message);
};

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

/** Due days of a rule from `start`, within [from, to] (at most 366). */
export function occurrencesOf(start: string, repeat: RepeatRule | null, from: string, to: string): string[] {
  if (!repeat) return start >= from && start <= to ? [start] : [];
  const days: string[] = [];
  const startDate = parseDay(start)!;
  let seen = 0;
  for (let day = start, n = 0; day <= to && n < 4000; n++) {
    const index = diffDays(start, day);
    const due =
      repeat.frequency === "daily" || repeat.frequency === "interval"
        ? index % repeat.interval === 0
        : repeat.frequency === "weekly"
          ? index % (7 * repeat.interval) === 0
          : repeat.frequency === "weekdays"
            ? repeat.weekdays.includes(weekdayOfDay(day)) && Math.floor(index / 7) % repeat.interval === 0
            : repeat.frequency === "monthly"
              ? parseDay(day)!.date === startDate.date
              : parseDay(day)!.date === startDate.date && parseDay(day)!.month === startDate.month;
    if (due) {
      if (repeat.until && day > repeat.until) break;
      seen += 1;
      if (repeat.count !== null && seen > repeat.count) break;
      if (day >= from) days.push(day);
    }
    day = addDaysToDay(day, 1);
  }
  return days;
}

export function createMockPersonalServices({
  habitTitles,
  transactions,
}: {
  habitTitles: () => Promise<Map<string, string>>;
  transactions: (from: string, to: string) => Promise<Transaction[]>;
}): PersonalServiceRepositories {
  const reminders: Reminder[] = [];
  const routines: Routine[] = [];
  const files = new Map<string, { attachment: TaskAttachment; blob: Blob }[]>();
  const bills: { bill: Bill; versions: BillVersion[]; paid: Set<string> }[] = [];
  let preferences: NotificationPreferences = {
    channels: { inApp: true, email: false, webPush: false },
    available: ["inApp"],
    reactivateOnReopen: true,
    quietStart: null,
    quietEnd: null,
  };

  const reminder = (id: string) => reminders.find((item) => item.id === id) ?? notFound("reminder");
  const routine = (id: string) => routines.find((item) => item.id === id) ?? notFound("routine");
  const billEntry = (id: string) => bills.find((item) => item.bill.id === id) ?? notFound("bill");
  const versionOf = (bill: Bill, current: boolean): BillVersion => ({
    effectiveFrom: bill.effectiveFrom,
    current,
    name: bill.name,
    amount: bill.amount,
    currency: bill.currency,
    dueDay: bill.dueDay,
    repeat: bill.repeat,
    archived: bill.archived,
  });
  const nextBill = (entry: (typeof bills)[number], next: Bill) => {
    entry.versions = [versionOf(next, true), ...entry.versions.map((version) => ({ ...version, current: false }))];
    entry.bill = next;
    return clone(next);
  };
  const withHabits = async (title: string, habitIds: string[]) => {
    const titles = await habitTitles();
    if (habitIds.some((id) => !titles.has(id))) notFound("habit");
    return { title: title.trim(), habits: habitIds.map((id) => ({ id, title: titles.get(id)!, archived: false })) };
  };

  return {
    notifications: {
      list: async () => [],
      unreadCount: async () => 0,
      setRead: async () => notFound("notification"),
      dismiss: async () => notFound("notification"),
      snooze: async () => notFound("notification"),
      preferences: async () => clone(preferences),
      updatePreferences: async (patch) => {
        preferences = { ...preferences, ...patch, channels: { ...preferences.channels, ...patch.channels }, available: preferences.available };
        return clone(preferences);
      },
      pushDevices: async () => [],
      revokePushDevice: async () => notFound("push device"),
    },

    reminders: {
      list: async (filter = {}) => clone(reminders.filter((item) => !filter.taskId || item.taskId === filter.taskId)),
      create: async (input) => {
        if (!input.title.trim() || input.channels.length === 0) invalid("A reminder needs a title and a channel");
        const created: Reminder = { ...clone(input), id: nextId("reminder"), revision: 1, state: "active", nextAt: null, exhausted: false };
        reminders.push(created);
        return clone(created);
      },
      update: async (current, patch) => {
        const item = reminder(current.id);
        Object.assign(item, clone(patch), { revision: item.revision + 1 });
        return clone(item);
      },
      setPaused: async (current, paused) => {
        const item = reminder(current.id);
        Object.assign(item, { state: paused ? "paused" : "active", revision: item.revision + 1 });
        return clone(item);
      },
      remove: async (current) => {
        reminders.splice(reminders.indexOf(reminder(current.id)), 1);
      },
      deliveries: async (id) => {
        reminder(id);
        return [];
      },
    },

    routines: {
      list: async () => clone(routines),
      create: async (input) => {
        if (!input.title.trim()) invalid("A routine needs a title");
        const created: Routine = { id: nextId("routine"), revision: 1, ...(await withHabits(input.title, input.habitIds)) };
        routines.push(created);
        return clone(created);
      },
      update: async (current, patch) => {
        const item = routine(current.id);
        const next = await withHabits(patch.title ?? item.title, patch.habitIds ?? item.habits.map((habit) => habit.id));
        Object.assign(item, next, { revision: item.revision + 1 });
        return clone(item);
      },
      remove: async (current) => {
        routines.splice(routines.indexOf(routine(current.id)), 1);
      },
    },

    taskFiles: {
      list: async (taskId) => (files.get(taskId) ?? []).map((item) => clone(item.attachment)),
      upload: async (taskId, file) => {
        if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type) || file.size <= 0 || file.size > ATTACHMENT_MAX_BYTES) invalid("Unsupported file");
        const attachment: TaskAttachment = { fileId: nextId("file"), name: file.name, mimeType: file.type, sizeBytes: file.size, status: "ready", attachedAt: new Date().toISOString() };
        files.set(taskId, [...(files.get(taskId) ?? []), { attachment, blob: file }]);
        return clone(attachment);
      },
      download: async (fileId) => {
        for (const list of files.values()) {
          const found = list.find((item) => item.attachment.fileId === fileId);
          if (found) return found.blob;
        }
        return notFound("file");
      },
      detach: async (taskId, fileId) => {
        files.set(taskId, (files.get(taskId) ?? []).filter((item) => item.attachment.fileId !== fileId));
      },
      remove: async (taskId, fileId) => {
        files.set(taskId, (files.get(taskId) ?? []).filter((item) => item.attachment.fileId !== fileId));
      },
    },

    bills: {
      list: async (archived) => bills.filter((item) => item.bill.archived === archived).map((item) => clone(item.bill)).sort((a, b) => a.dueDay.localeCompare(b.dueDay)),
      create: async (input) => {
        if (!input.name.trim()) invalid("A bill needs a name");
        const bill: Bill = {
          id: nextId("bill"),
          revision: 1,
          name: input.name.trim(),
          kind: input.kind,
          amount: input.amountRial,
          currency: "IRR",
          dueDay: input.dueDay,
          repeat: clone(input.repeat),
          archived: false,
          effectiveFrom: input.dueDay,
        };
        bills.push({ bill, versions: [versionOf(bill, true)], paid: new Set() });
        return clone(bill);
      },
      update: async (current, patch, effectiveFrom) => {
        const entry = billEntry(current.id);
        const { amountRial, ...rest } = patch;
        return nextBill(entry, { ...entry.bill, ...clone(rest), ...(amountRial ? { amount: amountRial } : {}), effectiveFrom, revision: entry.bill.revision + 1 });
      },
      setArchived: async (current, archived, effectiveFrom) => {
        const entry = billEntry(current.id);
        return nextBill(entry, { ...entry.bill, archived, effectiveFrom, revision: entry.bill.revision + 1 });
      },
      preview: async (billId, from, to) => {
        const { bill, paid } = billEntry(billId);
        return occurrencesOf(bill.dueDay, bill.repeat, from, to).map(
          (day): BillOccurrence => ({ key: day, dueDay: day, amount: bill.amount, currency: bill.currency, state: paid.has(day) ? "paid" : "unpaid" }),
        );
      },
      history: async (billId) => clone(billEntry(billId).versions),
      recordPayment: async (current, key) => {
        const entry = billEntry(current.id);
        if (entry.paid.has(key)) throw new RepositoryError("conflict", "Already paid");
        entry.paid.add(key);
      },
    },

    financeReports: {
      report: async (from, to) => {
        const list = await transactions(from, to);
        if (list.length === 0) return { from, to, postingCount: 0, currencies: [] };
        const sum = (kind: Transaction["kind"]) => list.filter((tx) => tx.kind === kind).reduce((total, tx) => total + tx.amountToman * 10, 0);
        const income = sum("income");
        const expense = sum("expense");
        const text = (value: number) => shiftDecimal(String(Math.round(value)), 0);
        return {
          from,
          to,
          postingCount: list.length,
          currencies: [{ currency: "IRR", income: text(income), expense: text(expense), fees: "0", transferIn: "0", transferOut: "0", adjustments: "0", net: text(income - expense) }],
        };
      },
      exportFile: async (from, to, format) => {
        const list = await transactions(from, to);
        const blob =
          format === "json"
            ? new Blob([JSON.stringify({ version: 1, from, to, transactions: list }, null, 2)], { type: "application/json" })
            : new Blob([["day,kind,title,amount_irr", ...list.map((tx) => `${tx.day},${tx.kind},"${tx.title.replaceAll('"', '""')}",${tx.amountToman * 10}`)].join("\n")], { type: "text/csv" });
        return { blob, filename: `personal-finance.${format}` };
      },
    },
  };
}
