import type { Weekday } from "@/lib/dates/week";

/*
 * Personal services seam (Phase 1–5 gap closure): notifications, reminders,
 * routines, task files, bills and finance reports / export. Domain shapes
 * mirror only what the contract stores; anything the API does not hold is
 * absent, never guessed. Money stays an exact IRR decimal string.
 */

// ── Notifications ─────────────────────────────────────────────────────────

export type NotificationChannel = "inApp" | "email" | "webPush";
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["inApp", "email", "webPush"];

export interface PlannerNotification {
  id: string;
  revision: number;
  title: string;
  body: string | null;
  /** The occurrence instant the reminder fired for. */
  scheduledAt: string;
  read: boolean;
  reminderId: string;
  /** The reminder's task (deep link), when the reminder is linked to one. */
  taskId: string | null;
}

export type NotificationFilter = "all" | "unread";

export interface NotificationPreferences {
  channels: Record<NotificationChannel, boolean>;
  /** Channels the server can deliver right now; others are read-only. */
  available: NotificationChannel[];
  reactivateOnReopen: boolean;
  /** "HH:MM" or null (no quiet hours). */
  quietStart: string | null;
  quietEnd: string | null;
  /** The server's VAPID public key (base64url) when Web Push is configured, else null. */
  pushPublicKey: string | null;
  /** Per-module switches (null = not served by this server); delivery needs both the module switch and the global channel. */
  modules: ModuleChannels | null;
}

/** Notification sources with their own channel switches (no per-event-type settings). */
export type NotificationModule = "personal" | "projects" | "teams" | "company" | "messaging" | "social";
export const NOTIFICATION_MODULES: readonly NotificationModule[] = ["personal", "projects", "teams", "company", "messaging", "social"];
export type ModuleChannels = Record<NotificationModule, Record<NotificationChannel, boolean>>;

export type NotificationPreferencesPatch = Partial<Omit<NotificationPreferences, "available" | "channels" | "pushPublicKey" | "modules">> & {
  channels?: Partial<Record<NotificationChannel, boolean>>;
  /** Each supplied module carries all three channels; omitted modules keep their values. */
  modules?: Partial<ModuleChannels>;
};

export interface PushDevice {
  id: string;
  revision: number;
  label: string | null;
  /** The push service host only; the endpoint itself is never exposed. */
  host: string;
  createdAt: string;
}

/** A browser PushSubscription as the server stores it (endpoint and keys never come back). */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { auth: string; p256dh: string };
  label: string | null;
}

export interface NotificationsRepository {
  /** The inbox, newest first (dismissed ones are gone). */
  list(filter: NotificationFilter): Promise<PlannerNotification[]>;
  /** One notification (push click target); a foreign or missing one is not-found. */
  get(id: string): Promise<PlannerNotification>;
  /** Exact unread notifications in the Personal inbox (the badge shows 99+). */
  unreadCount(): Promise<number>;
  setRead(notification: PlannerNotification, read: boolean): Promise<PlannerNotification>;
  dismiss(notification: PlannerNotification): Promise<void>;
  /** Snoozes until the instant; the server re-delivers then. */
  snooze(notification: PlannerNotification, until: string): Promise<void>;
  preferences(): Promise<NotificationPreferences>;
  updatePreferences(patch: NotificationPreferencesPatch): Promise<NotificationPreferences>;
  /** Active browser push subscriptions of this account. */
  pushDevices(): Promise<PushDevice[]>;
  registerPushDevice(input: PushSubscriptionInput): Promise<PushDevice>;
  revokePushDevice(device: PushDevice): Promise<void>;
}

// ── Reminders ─────────────────────────────────────────────────────────────

export type RepeatFrequency = "daily" | "weekly" | "weekdays" | "monthly" | "yearly" | "interval";
export const REPEAT_FREQUENCIES: readonly RepeatFrequency[] = ["daily", "weekly", "weekdays", "monthly", "yearly", "interval"];

/** The contract's schedule rule (reminders and bills): interval 1–365, weekdays 0 = Sunday. */
export interface RepeatRule {
  frequency: RepeatFrequency;
  interval: number;
  /** Only for "weekdays" (at least one). */
  weekdays: Weekday[];
  /** Last day (inclusive) or null. */
  until: string | null;
  count: number | null;
}

export type TaskReminderField = "due" | "start" | "scheduled";

export type ReminderSchedule =
  /** One instant. */
  | { kind: "at"; at: string }
  /** A local day + time in the account zone, optionally repeating. */
  | { kind: "local"; day: string; time: string; repeat: RepeatRule | null }
  /** Relative to a task's date; "scheduled" needs a time, the others an offset only. */
  | { kind: "task"; field: TaskReminderField; offsetMinutes: number; time: string | null };

export type ReminderState = "active" | "paused";

export interface Reminder {
  id: string;
  revision: number;
  title: string;
  body: string | null;
  taskId: string | null;
  schedule: ReminderSchedule;
  channels: NotificationChannel[];
  urgent: boolean;
  state: ReminderState;
  /** Next planned delivery, or null when exhausted / paused. */
  nextAt: string | null;
  exhausted: boolean;
}

export interface ReminderInput {
  title: string;
  body: string | null;
  taskId: string | null;
  schedule: ReminderSchedule;
  channels: NotificationChannel[];
  urgent: boolean;
}

export type DeliveryState = "pending" | "processing" | "retry" | "delivered" | "skipped" | "canceled" | "expired" | "failed" | "ambiguous";

export interface ReminderDelivery {
  id: string;
  channel: NotificationChannel;
  state: DeliveryState;
  /** Sent instant, else the planned one. */
  at: string | null;
  attempts: number;
  /** Server reason code (e.g. QUIET_HOURS), shown as-is. */
  reason: string | null;
}

export interface RemindersRepository {
  /** Active and paused reminders (cancelled ones are deleted), optionally for one task. */
  list(filter?: { taskId?: string }): Promise<Reminder[]>;
  create(input: ReminderInput): Promise<Reminder>;
  update(reminder: Reminder, patch: Partial<ReminderInput>): Promise<Reminder>;
  setPaused(reminder: Reminder, paused: boolean): Promise<Reminder>;
  remove(reminder: Reminder): Promise<void>;
  /** Newest delivery attempts first. */
  deliveries(reminderId: string): Promise<ReminderDelivery[]>;
}

// ── Routines ──────────────────────────────────────────────────────────────

export interface Routine {
  id: string;
  revision: number;
  title: string;
  /** Ordered habits; `archived` marks a habit that is no longer active. */
  habits: { id: string; title: string; archived: boolean }[];
}

export interface RoutineInput {
  title: string;
  habitIds: string[];
}

/** DAILY; WEEKLY = the start date's weekday; WEEKDAYS = the picked days (Sunday = 0). */
export type RoutineScheduleKind = "DAILY" | "WEEKLY" | "WEEKDAYS";

export interface RoutineSchedule {
  kind: RoutineScheduleKind;
  /** ISO days; `endDate` inclusive. */
  startDate: string;
  endDate: string | null;
  weekdays: number[];
  /** Wall-clock "HH:mm" in `timezone` (the account zone when saved). */
  startTime: string;
  expectedMinutes: number | null;
  reminder: boolean;
  timezone: string;
}

export type RoutineOccurrenceState = "PENDING" | "RUNNING" | "COMPLETED" | "SKIPPED" | "DST_GAP";
export type RoutineAction = "START" | "COMPLETE" | "SKIP";

export interface RoutineOccurrence {
  routineId: string;
  /** ISO day. */
  date: string;
  /** Null for a DST_GAP day (the wall time does not exist). */
  scheduledAt: string | null;
  state: RoutineOccurrenceState;
  /** If-Match for execute (a pending day carries the routine's revision). */
  revision: number;
  startedAt: string | null;
  completedAt: string | null;
  /** Progress from the linked habits' actual records for that day. */
  linkedHabits: number;
  completedHabits: number;
  percent: number | null;
}

export interface RoutinesRepository {
  /** Active routines (archived ones are kept by the server, not listed). */
  list(): Promise<Routine[]>;
  create(input: RoutineInput): Promise<Routine>;
  update(routine: Routine, patch: Partial<RoutineInput>): Promise<Routine>;
  /** Archives the routine; habits and their entries stay. */
  remove(routine: Routine): Promise<void>;
  /** The routine's optional schedule (null = unscheduled). */
  schedule(routineId: string): Promise<RoutineSchedule | null>;
  /** Replaces (or clears) the schedule; advances the routine revision. */
  setSchedule(routine: Routine, schedule: RoutineSchedule | null): Promise<Routine>;
  /** Due and executed days in [from, to) (ISO days, ≤ 366 days), oldest first. */
  occurrences(routineId: string, from: string, to: string): Promise<RoutineOccurrence[]>;
  /** START / COMPLETE / SKIP one day; terminal days refuse (conflict). */
  execute(occurrence: RoutineOccurrence, action: RoutineAction): Promise<RoutineOccurrence>;
}

// ── Task files ────────────────────────────────────────────────────────────

export const ATTACHMENT_TYPES = ["text/plain", "application/pdf", "image/png", "image/jpeg"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];
/** The server's default upload limit (10 MiB). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface TaskAttachment {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  status: "uploading" | "ready" | "rejected";
  attachedAt: string;
}

export interface TaskFilesRepository {
  list(taskId: string): Promise<TaskAttachment[]>;
  /** Uploads the bytes, then attaches the READY file; rejects "invalid" for a type or size the server refuses. */
  upload(taskId: string, file: File): Promise<TaskAttachment>;
  download(fileId: string): Promise<Blob>;
  /** Unlinks the file from the task; the file itself stays. */
  detach(taskId: string, fileId: string): Promise<void>;
  /** Unlinks and deletes the file's bytes. */
  remove(taskId: string, fileId: string): Promise<void>;
}

// ── Bills ─────────────────────────────────────────────────────────────────

export interface Bill {
  id: string;
  revision: number;
  name: string;
  kind: "expense" | "income";
  /** Exact decimal string in `currency`. */
  amount: string;
  /** ISO code; the planner writes IRR. */
  currency: string;
  dueDay: string;
  repeat: RepeatRule | null;
  archived: boolean;
  /** First day the current version applies. */
  effectiveFrom: string;
}

export interface BillInput {
  name: string;
  kind: "expense" | "income";
  /** Exact IRR decimal string. */
  amountRial: string;
  dueDay: string;
  repeat: RepeatRule | null;
}

export interface BillOccurrence {
  /** The occurrence key the payment is recorded against. */
  key: string;
  dueDay: string;
  amount: string;
  currency: string;
  state: "unpaid" | "paid" | "reversed";
}

export interface BillVersion {
  effectiveFrom: string;
  current: boolean;
  name: string;
  amount: string;
  currency: string;
  dueDay: string;
  repeat: RepeatRule | null;
  archived: boolean;
}

export interface BillsRepository {
  list(archived: boolean): Promise<Bill[]>;
  create(input: BillInput): Promise<Bill>;
  /** A new version from `effectiveFrom` (the history keeps the old one). */
  update(bill: Bill, patch: Partial<BillInput>, effectiveFrom: string): Promise<Bill>;
  setArchived(bill: Bill, archived: boolean, effectiveFrom: string): Promise<Bill>;
  /** Occurrences due from `from` to `to` (inclusive, at most 366 days). */
  preview(billId: string, from: string, to: string): Promise<BillOccurrence[]>;
  history(billId: string): Promise<BillVersion[]>;
  /** Records the occurrence as paid: an internal ledger posting, never a money transfer. */
  recordPayment(bill: Bill, occurrenceKey: string): Promise<void>;
}

// ── Finance reports / export ──────────────────────────────────────────────

export interface FinanceReportTotals {
  currency: string;
  income: string;
  expense: string;
  fees: string;
  transferIn: string;
  transferOut: string;
  adjustments: string;
  net: string;
}

export interface FinanceReport {
  from: string;
  /** Inclusive last day. */
  to: string;
  postingCount: number;
  /** One row per currency, never converted or summed across currencies. */
  currencies: FinanceReportTotals[];
}

export type FinanceExportFormat = "csv" | "json";

export interface DownloadFile {
  blob: Blob;
  filename: string;
}

export interface FinanceReportsRepository {
  /** Totals from `from` to `to` (inclusive days, at most 366). */
  report(from: string, to: string): Promise<FinanceReport>;
  /** Finance transactions only (not an account export). */
  exportFile(from: string, to: string, format: FinanceExportFormat): Promise<DownloadFile>;
}

// ── Working hours & capacity ──────────────────────────────────────────────

/** "HH:mm" wall-clock interval in the account zone; several per day model breaks. */
export interface WorkingInterval {
  start: string;
  end: string;
}

export interface WorkingHours {
  /** Seven arrays, Sunday = 0; an empty array is a nonworking day. */
  intervalsByWeekday: WorkingInterval[][];
  /** Explicit date overrides (ISO day → intervals; empty = off that day). */
  exceptions: { date: string; intervals: WorkingInterval[] }[];
}

export interface WorkingHoursState {
  /** Null = not configured (capacity stays unknown). */
  workingHours: WorkingHours | null;
  revision: number;
  timezone: string;
  /** Account week start (Sunday = 0). */
  firstDayOfWeek: number;
}

export type ScheduleCapacityState = "CONFIGURED" | "UNKNOWN" | "DST_GAP";

export interface CapacityDay {
  date: string;
  state: ScheduleCapacityState;
  /** Null when unknown — never invented. */
  availableMinutes: number | null;
  busyMinutes: number;
  reservedMinutes: number | null;
  remainingMinutes: number | null;
  overbookedMinutes: number | null;
}

export interface ScheduleCapacity {
  state: ScheduleCapacityState;
  days: CapacityDay[];
  availableMinutes: number | null;
  reservedMinutes: number | null;
  remainingMinutes: number | null;
  overbookedMinutes: number | null;
}

export interface WorkingHoursRepository {
  get(): Promise<WorkingHoursState>;
  /**
   * Read-modify-write of the whole configuration (exceptions included):
   * `apply` gets the latest saved hours and returns the next ones (null clears).
   * A stale write re-reads and re-applies, so untouched entries are kept.
   */
  update(apply: (current: WorkingHours | null) => WorkingHours | null): Promise<WorkingHoursState>;
  /**
   * Advisory occupancy (calendar events ∪ time blocks ∩ availability) for one
   * day or one account week. Null = not served (mock mode keeps the local
   * work-hours model).
   */
  capacity(query: { date: string } | { weekStartDate: string }): Promise<ScheduleCapacity | null>;
}

export interface PersonalServiceRepositories {
  workingHours: WorkingHoursRepository;
  notifications: NotificationsRepository;
  reminders: RemindersRepository;
  routines: RoutinesRepository;
  taskFiles: TaskFilesRepository;
  bills: BillsRepository;
  financeReports: FinanceReportsRepository;
}
