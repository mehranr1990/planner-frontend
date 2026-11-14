"use client";

import { Bell, BellOff, Building2, Check, Clock, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { CompanyNotification } from "@/data/company-domain";
import { useCompanyNotifications, useReadCompanyNotification } from "@/data/company-queries";
import type { MessagingNotice } from "@/data/messaging-domain";
import { useMessagingMutation, useMessagingNotices } from "@/data/messaging-queries";
import { RepositoryError } from "@/data/repositories";
import type { NotificationFilter, PlannerNotification } from "@/data/personal-services";
import { useNotificationAction, useNotificationInbox, useUnreadCount, type NotificationAction } from "@/data/personal-services-queries";
import { companyHref } from "@/features/navigation/contexts";
import { announcementsHref, messagesHref } from "@/features/messages/paths";
import { getCompanyIdFromPathname } from "@/features/navigation/paths";
import { taskDetailHref } from "@/features/personal/routes";
import { useServiceError } from "@/features/personal-services/service-error";
import { useServiceFormat } from "@/features/personal-services/use-service-format";
import { addDaysToDay, instantAtTime } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * Bell + notifications popover (Shell board): the one notification inbox.
 * Server-owned read state; the badge polls the unread count. Each item:
 * open the reminder's task (when it has one), read / unread, snooze, and
 * dismiss. No real-time stream exists, so opening refetches.
 * Inside a company (/companies/[id]/…) the same popover also lists that
 * company's notifications for the viewer (server-created; read only, no
 * snooze / dismiss in the contract) and counts them in the badge.
 */

export interface NotificationsPopoverProps {
  /** Classes for the bell button (the mobile header lifts it onto a white island). */
  triggerClassName?: string;
}

export const NOTIFICATION_SETTINGS_HREF = "/personal/settings#settings-notifications";

export function NotificationsPopover({ triggerClassName }: NotificationsPopoverProps) {
  const t = useTranslations("Shell.notifications");
  const ts = useTranslations("Services.inbox");
  const scope = useShellScope();
  const titleId = useId();
  const format = useServiceFormat();
  const [open, setOpen] = useRouteScopedOpen();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const companyId = getCompanyIdFromPathname(usePathname());
  const company = useCompanyNotifications(companyId);
  const companyUnread = (company.data ?? []).filter((item) => !item.read).length;
  const personalUnread = useUnreadCount().data ?? 0;
  const messaging = useMessagingNotices();
  const messagingUnread = messaging.data ? messaging.data.notices.filter((item) => !item.read).length + messaging.data.reminders.filter((item) => !item.read).length : 0;
  const unread = personalUnread + companyUnread + messagingUnread;
  const inbox = useNotificationInbox(filter, open);
  const action = useNotificationAction();
  const message = useServiceError();

  const run = (next: NotificationAction, done?: string) =>
    action.mutate(next, {
      onSuccess: () => (done ? toast({ title: done, tone: "neutral" }) : undefined),
      onError: (error) => toast({ title: message(error), tone: "danger" }),
    });

  const label = unread > 0 ? ts("labelWithCount", { count: unread, formatted: format.number(Math.min(unread, 99)) }) : t("label");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="relative inline-flex">
        <PopoverTrigger asChild>
          <IconButton icon={Bell} label={label} className={cn(triggerClassName)} />
        </PopoverTrigger>
        {unread > 0 ? (
          <span aria-hidden="true">
            <Badge label={label} count={unread} tone="primary" placement="corner" />
          </span>
        ) : null}
      </span>
      <PopoverContent align="end" aria-labelledby={titleId} data-scope={scope} className="flex w-90 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-card-sm p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-1">
          <h2 id={titleId} className="text-body font-bold">
            {t("title")}
          </h2>
          <PillGroup<NotificationFilter>
            label={ts("filter")}
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: "all", label: ts("all") },
              { value: "unread", label: ts("unread"), count: personalUnread > 0 ? format.number(Math.min(personalUnread, 99)) : undefined },
            ]}
          />
        </div>
        <MessagingSection query={messaging} unreadOnly={filter === "unread"} onNavigate={() => setOpen(false)} />
        {companyId ? <CompanySection companyId={companyId} query={company} unreadOnly={filter === "unread"} onNavigate={() => setOpen(false)} /> : null}
        {inbox.isPending ? (
          <LoadingState>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 rounded-row" />
              <Skeleton className="h-14 rounded-row" />
            </div>
          </LoadingState>
        ) : inbox.isError ? (
          <ErrorState variant="bare" title={ts("error")} description={message(inbox.error)} onRetry={() => void inbox.refetch()} />
        ) : inbox.data.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={filter === "unread" ? ts("emptyUnread") : t("emptyDescription")} variant="bare" />
        ) : (
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto" aria-busy={action.isPending}>
            {inbox.data.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                when={format.instant(item.scheduledAt)}
                busy={action.isPending}
                onOpen={() => {
                  if (!item.read) run({ kind: "read", notification: item, read: true });
                  setOpen(false);
                }}
                onRead={(read) => run({ kind: "read", notification: item, read })}
                onSnooze={(until) => run({ kind: "snooze", notification: item, until }, ts("snoozed"))}
                onDismiss={() => run({ kind: "dismiss", notification: item }, ts("dismissed"))}
              />
            ))}
          </ul>
        )}
        <Link href={NOTIFICATION_SETTINGS_HREF} onClick={() => setOpen(false)} className="self-end rounded-pill px-2 py-1 text-xs font-semibold text-fg-secondary hover:text-fg">
          {ts("settings")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  item,
  when,
  busy,
  onOpen,
  onRead,
  onSnooze,
  onDismiss,
}: {
  item: PlannerNotification;
  when: string;
  busy: boolean;
  onOpen(): void;
  onRead(read: boolean): void;
  onSnooze(until: string): void;
  onDismiss(): void;
}) {
  const ts = useTranslations("Services.inbox");
  const tomorrow = addDaysToDay(getPlannerToday(), 1);
  const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
  const title = (
    <bdi dir="auto" className={cn("block truncate text-sm", item.read ? "font-semibold text-fg-secondary" : "font-bold text-fg")}>
      {item.title}
    </bdi>
  );
  return (
    <li className={cn("flex items-start gap-2 rounded-row p-2", !item.read && "bg-subtle")}>
      <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-scope-deep")} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {item.taskId ? (
          <Link href={taskDetailHref(item.taskId)} onClick={onOpen} className="min-w-0 hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
        {item.body ? (
          <p dir="auto" className="line-clamp-2 text-xs text-fg-secondary">
            {item.body}
          </p>
        ) : null}
        <span className="text-xs text-fg-muted">
          {when}
          {item.read ? null : <span className="sr-only"> · {ts("unreadState")}</span>}
        </span>
      </div>
      <div className="flex shrink-0 items-center">
        <IconButton size="sm" variant="ghost" icon={item.read ? BellOff : Check} label={item.read ? ts("markUnread") : ts("markRead")} disabled={busy} onClick={() => onRead(!item.read)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" variant="ghost" icon={Clock} label={ts("snooze")} disabled={busy} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onSnooze(inHours(1))}>{ts("snooze1h")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSnooze(inHours(3))}>{ts("snooze3h")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSnooze(instantAtTime(tomorrow, "09:00"))}>{ts("snoozeTomorrow")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton size="sm" variant="ghost" icon={X} label={ts("dismiss")} disabled={busy} onClick={onDismiss} />
      </div>
    </li>
  );
}

/*
 * Messaging notices (new message / conversation invitation) and announcement
 * "please read" reminders. The API serves read state only (no dismiss /
 * snooze); a link opens the conversation, the invitation inbox (/messages) or
 * the source's announcements, and the server authorises what opens there.
 */
function MessagingSection({ query, unreadOnly, onNavigate }: { query: ReturnType<typeof useMessagingNotices>; unreadOnly: boolean; onNavigate(): void }) {
  const t = useTranslations("Msg.notices");
  const ts = useTranslations("Services.inbox");
  const format = useServiceFormat();
  const titleId = useId();
  const readNotice = useMessagingMutation((repo, notice: MessagingNotice) => repo.conversations.readNotice(notice));
  const readReminder = useMessagingMutation((repo, id: string) => repo.announcements.readReminder(id));
  const busy = readNotice.isPending || readReminder.isPending;
  const failed = () => toast({ title: t("readFailed"), tone: "danger" });
  if (query.isPending) return null;
  if (query.isError) return <ErrorState variant="bare" title={t("error")} onRetry={() => void query.refetch()} />;
  const rows = [
    ...query.data.notices.map((notice) => ({
      key: `n-${notice.id}`,
      read: notice.read,
      at: notice.at,
      label: t(notice.kind),
      href: notice.kind === "invitation" ? messagesHref.root : messagesHref.conversation(notice.conversationId),
      markRead: () => readNotice.mutate(notice, { onError: failed }),
    })),
    ...query.data.reminders.map((reminder) => ({
      key: `r-${reminder.id}`,
      read: reminder.read,
      at: reminder.at,
      label: reminder.title ? t("announcement", { title: reminder.title }) : t("announcementGeneric"),
      href: reminder.source ? announcementsHref(reminder.source) : null,
      markRead: () => readReminder.mutate(reminder.id, { onError: failed }),
    })),
  ]
    .filter((row) => !unreadOnly || !row.read)
    .sort((a, b) => b.at.localeCompare(a.at));
  if (!rows.length) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1 border-b border-line pb-2">
      <h3 id={titleId} className="flex items-center gap-1.5 px-1.5 text-xs font-bold text-fg-secondary">
        <MessageSquare aria-hidden="true" className="size-3.5" />
        {t("section")}
      </h3>
      <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto" aria-busy={busy}>
        {rows.map((row) => {
          const className = cn("min-w-0 truncate text-sm", row.read ? "font-semibold text-fg-secondary" : "font-bold text-fg");
          return (
            <li key={row.key} className={cn("flex items-start gap-2 rounded-row p-2", !row.read && "bg-subtle")}>
              <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", row.read ? "bg-transparent" : "bg-scope-deep")} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {row.href ? (
                  <Link
                    href={row.href}
                    onClick={() => {
                      if (!row.read) row.markRead();
                      onNavigate();
                    }}
                    className={cn(className, "hover:underline")}
                  >
                    <bdi dir="auto">{row.label}</bdi>
                  </Link>
                ) : (
                  <bdi dir="auto" className={className}>
                    {row.label}
                  </bdi>
                )}
                <span className="text-xs text-fg-muted">
                  {format.instant(row.at)}
                  {row.read ? null : <span className="sr-only"> · {ts("unreadState")}</span>}
                </span>
              </div>
              {row.read ? null : <IconButton size="sm" variant="ghost" icon={Check} label={t("markRead")} disabled={busy} onClick={row.markRead} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* Company notifications: a knowledge page to acknowledge, or (Owner) a request to open an employee file. */
function CompanySection({
  companyId,
  query,
  unreadOnly,
  onNavigate,
}: {
  companyId: string;
  query: ReturnType<typeof useCompanyNotifications>;
  unreadOnly: boolean;
  onNavigate(): void;
}) {
  const t = useTranslations("Company.notifications");
  const ts = useTranslations("Services.inbox");
  const format = useServiceFormat();
  const titleId = useId();
  const read = useReadCompanyNotification(companyId);
  const markRead = (item: CompanyNotification) => {
    if (item.read) return;
    read.mutate(item.id, { onError: () => toast({ title: t("readFailed"), tone: "danger" }) });
  };
  // No access to this company: its gate explains; the bell stays quiet.
  if (query.isError && query.error instanceof RepositoryError && (query.error.code === "forbidden" || query.error.code === "not-found")) return null;
  if (query.isPending) return null;
  if (query.isError) return <ErrorState variant="bare" title={t("error")} onRetry={() => void query.refetch()} />;
  const items = query.data.filter((item) => !unreadOnly || !item.read);
  if (!items.length) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1 border-b border-line pb-2">
      <h3 id={titleId} className="flex items-center gap-1.5 px-1.5 text-xs font-bold text-fg-secondary">
        <Building2 aria-hidden="true" className="size-3.5" />
        {t("section")}
      </h3>
      <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto" aria-busy={read.isPending}>
        {items.map((item) => {
          const href = item.kind === "kb-ack-reminder" ? `${companyHref(companyId, "knowledge")}/${item.subjectId}` : `${companyHref(companyId, "people")}/${item.subjectId}/file`;
          return (
            <li key={item.id} className={cn("flex items-start gap-2 rounded-row p-2", !item.read && "bg-subtle")}>
              <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-scope-deep")} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link
                  href={href}
                  onClick={() => {
                    markRead(item);
                    onNavigate();
                  }}
                  className={cn("min-w-0 truncate text-sm hover:underline", item.read ? "font-semibold text-fg-secondary" : "font-bold text-fg")}
                >
                  {t(item.kind === "kb-ack-reminder" ? "kbReminder" : "fileRequest")}
                </Link>
                <span className="text-xs text-fg-muted">
                  {format.instant(item.createdAt)}
                  {item.read ? null : <span className="sr-only"> · {ts("unreadState")}</span>}
                </span>
              </div>
              {item.read ? null : <IconButton size="sm" variant="ghost" icon={Check} label={t("markRead")} disabled={read.isPending} onClick={() => markRead(item)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
