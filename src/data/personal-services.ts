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
}

export type NotificationPreferencesPatch = Partial<Omit<NotificationPreferences, "available" | "channels">> & {
  channels?: Partial<Record<NotificationChannel, boolean>>;
};

export interface PushDevice {
  id: string;
  revision: number;
  label: string | null;
  /** The push service host only; the endpoint itself is never exposed. */
  host: string;
  createdAt: string;
}

export interface NotificationsRepository {
  /** The inbox, newest first (dismissed ones are gone). */
  list(filter: NotificationFilter): Promise<PlannerNotification[]>;
  /** Unread notifications, counted up to 100 (the badge shows 99+). */
  unreadCount(): Promise<number>;
  setRead(notification: PlannerNotification, read: boolean): Promise<PlannerNotification>;
  dismiss(notification: PlannerNotification): Promise<void>;
  /** Snoozes until the instant; the server re-delivers then. */
  snooze(notification: PlannerNotification, until: string): Promise<void>;
  preferences(): Promise<NotificationPreferences>;
  updatePreferences(patch: NotificationPreferencesPatch): Promise<NotificationPreferences>;
  /** Active browser push subscriptions of this account. */
  pushDevices(): Promise<PushDevice[]>;
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

export interface RoutinesRepository {
  /** Active routines (archived ones are kept by the server, not listed). */
  list(): Promise<Routine[]>;
  create(input: RoutineInput): Promise<Routine>;
  update(routine: Routine, patch: Partial<RoutineInput>): Promise<Routine>;
  /** Archives the routine; habits and their entries stay. */
  remove(routine: Routine): Promise<void>;
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

export interface PersonalServiceRepositories {
  notifications: NotificationsRepository;
  reminders: RemindersRepository;
  routines: RoutinesRepository;
  taskFiles: TaskFilesRepository;
  bills: BillsRepository;
  financeReports: FinanceReportsRepository;
}
