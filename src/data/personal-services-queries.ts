"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import type {
  Bill,
  BillInput,
  NotificationFilter,
  NotificationPreferencesPatch,
  PlannerNotification,
  PushDevice,
  Reminder,
  ReminderInput,
  Routine,
  RoutineInput,
} from "./personal-services";
import { useRepositories } from "./provider";
import { afterHydration } from "./queries";
import { financeKeys } from "./query-keys";

/*
 * React Query hooks for the Personal services seam. Notifications have no
 * push stream: the unread badge polls gently (60 s) and every write
 * refreshes the inbox. Bill writes refresh all Finance reads (a payment is
 * a ledger posting).
 */

export const serviceKeys = {
  notifications: ["notifications"] as const,
  inbox: (filter: NotificationFilter) => ["notifications", "inbox", filter] as const,
  unread: ["notifications", "unread"] as const,
  preferences: ["notifications", "preferences"] as const,
  push: ["notifications", "push"] as const,
  reminders: ["reminders"] as const,
  reminderList: (taskId: string | null) => ["reminders", "list", taskId] as const,
  deliveries: (id: string) => ["reminders", "deliveries", id] as const,
  routines: ["routines"] as const,
  attachments: (taskId: string) => ["task-files", taskId] as const,
  bills: (archived: boolean) => [...financeKeys.all, "bill-list", archived] as const,
  billPreview: (id: string, from: string, to: string) => [...financeKeys.all, "bill-preview", id, from, to] as const,
  billHistory: (id: string) => [...financeKeys.all, "bill-history", id] as const,
  report: (from: string, to: string) => [...financeKeys.all, "report", from, to] as const,
};

const UNREAD_POLL_MS = 60_000;

function useInvalidating<V, T>(run: (vars: V) => Promise<T>, keys: readonly QueryKey[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))),
  });
}

// ── Notifications ─────────────────────────────────────────────────────────

export function useNotificationInbox(filter: NotificationFilter, enabled: boolean) {
  const { notifications } = useRepositories();
  return useQuery({ queryKey: serviceKeys.inbox(filter), queryFn: () => notifications.list(filter), enabled });
}

export function useUnreadCount() {
  const { notifications } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: serviceKeys.unread, queryFn: () => notifications.unreadCount(), refetchInterval: UNREAD_POLL_MS }), hydrated);
}

export type NotificationAction =
  | { kind: "read"; notification: PlannerNotification; read: boolean }
  | { kind: "dismiss"; notification: PlannerNotification }
  | { kind: "snooze"; notification: PlannerNotification; until: string };

export function useNotificationAction() {
  const { notifications } = useRepositories();
  return useInvalidating(async (action: NotificationAction) => {
    if (action.kind === "read") await notifications.setRead(action.notification, action.read);
    else if (action.kind === "dismiss") await notifications.dismiss(action.notification);
    else await notifications.snooze(action.notification, action.until);
  }, [serviceKeys.notifications]);
}

export function useNotificationPreferences(enabled = true) {
  const { notifications } = useRepositories();
  return useQuery({ queryKey: serviceKeys.preferences, queryFn: () => notifications.preferences(), enabled });
}

export function useUpdateNotificationPreferences() {
  const { notifications } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) => notifications.updatePreferences(patch),
    onSuccess: (next) => client.setQueryData(serviceKeys.preferences, next),
  });
}

export function usePushDevices(enabled = true) {
  const { notifications } = useRepositories();
  return useQuery({ queryKey: serviceKeys.push, queryFn: () => notifications.pushDevices(), enabled });
}

export function useRevokePushDevice() {
  const { notifications } = useRepositories();
  return useInvalidating((device: PushDevice) => notifications.revokePushDevice(device), [serviceKeys.push]);
}

// ── Reminders ─────────────────────────────────────────────────────────────

export function useReminders(taskId: string | null) {
  const { reminders } = useRepositories();
  return useQuery({ queryKey: serviceKeys.reminderList(taskId), queryFn: () => reminders.list(taskId ? { taskId } : {}) });
}

export type ReminderWrite =
  | { kind: "create"; input: ReminderInput }
  | { kind: "update"; reminder: Reminder; patch: Partial<ReminderInput> }
  | { kind: "pause"; reminder: Reminder; paused: boolean }
  | { kind: "remove"; reminder: Reminder };

export function useReminderWrite() {
  const { reminders } = useRepositories();
  return useInvalidating(async (write: ReminderWrite) => {
    if (write.kind === "create") await reminders.create(write.input);
    else if (write.kind === "update") await reminders.update(write.reminder, write.patch);
    else if (write.kind === "pause") await reminders.setPaused(write.reminder, write.paused);
    else await reminders.remove(write.reminder);
  }, [serviceKeys.reminders, serviceKeys.notifications]);
}

export function useReminderDeliveries(id: string, enabled: boolean) {
  const { reminders } = useRepositories();
  return useQuery({ queryKey: serviceKeys.deliveries(id), queryFn: () => reminders.deliveries(id), enabled });
}

// ── Routines ──────────────────────────────────────────────────────────────

export function useRoutines() {
  const { routines } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: serviceKeys.routines, queryFn: () => routines.list() }), hydrated);
}

export type RoutineWrite =
  | { kind: "create"; input: RoutineInput }
  | { kind: "update"; routine: Routine; patch: Partial<RoutineInput> }
  | { kind: "remove"; routine: Routine };

export function useRoutineWrite() {
  const { routines } = useRepositories();
  return useInvalidating(async (write: RoutineWrite) => {
    if (write.kind === "create") await routines.create(write.input);
    else if (write.kind === "update") await routines.update(write.routine, write.patch);
    else await routines.remove(write.routine);
  }, [serviceKeys.routines]);
}

// ── Task files ────────────────────────────────────────────────────────────

export function useTaskAttachments(taskId: string) {
  const { taskFiles } = useRepositories();
  return useQuery({ queryKey: serviceKeys.attachments(taskId), queryFn: () => taskFiles.list(taskId) });
}

export type AttachmentWrite =
  | { kind: "upload"; file: File }
  | { kind: "detach"; fileId: string }
  | { kind: "remove"; fileId: string };

export function useAttachmentWrite(taskId: string) {
  const { taskFiles } = useRepositories();
  return useInvalidating(async (write: AttachmentWrite) => {
    if (write.kind === "upload") await taskFiles.upload(taskId, write.file);
    else if (write.kind === "detach") await taskFiles.detach(taskId, write.fileId);
    else await taskFiles.remove(taskId, write.fileId);
  }, [serviceKeys.attachments(taskId)]);
}

// ── Bills & reports ───────────────────────────────────────────────────────

export function useBills(archived: boolean) {
  const { bills } = useRepositories();
  return useQuery({ queryKey: serviceKeys.bills(archived), queryFn: () => bills.list(archived), placeholderData: keepPreviousData });
}

export function useBillPreview(id: string, from: string, to: string) {
  const { bills } = useRepositories();
  return useQuery({ queryKey: serviceKeys.billPreview(id, from, to), queryFn: () => bills.preview(id, from, to) });
}

export function useBillHistory(id: string, enabled: boolean) {
  const { bills } = useRepositories();
  return useQuery({ queryKey: serviceKeys.billHistory(id), queryFn: () => bills.history(id), enabled });
}

export type BillWrite =
  | { kind: "create"; input: BillInput }
  | { kind: "update"; bill: Bill; patch: Partial<BillInput>; effectiveFrom: string }
  | { kind: "archive"; bill: Bill; archived: boolean; effectiveFrom: string }
  | { kind: "pay"; bill: Bill; occurrenceKey: string };

export function useBillWrite() {
  const { bills } = useRepositories();
  return useInvalidating(async (write: BillWrite) => {
    if (write.kind === "create") await bills.create(write.input);
    else if (write.kind === "update") await bills.update(write.bill, write.patch, write.effectiveFrom);
    else if (write.kind === "archive") await bills.setArchived(write.bill, write.archived, write.effectiveFrom);
    else await bills.recordPayment(write.bill, write.occurrenceKey);
  }, [financeKeys.all]);
}

export function useFinanceReport(from: string, to: string, enabled: boolean) {
  const { financeReports } = useRepositories();
  return useQuery({ queryKey: serviceKeys.report(from, to), queryFn: () => financeReports.report(from, to), enabled, placeholderData: keepPreviousData });
}

/** Saves a Blob through a temporary link (no URL is kept). */
export function saveBlob(blob: Blob, filename: string) {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
