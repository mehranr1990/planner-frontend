"use client";

import { Check, House, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { SocialDirectory } from "@/data/social-domain";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";

/*
 * The Social section of the context switcher (SO-01 right column): Social
 * home · Your groups (role · people) · Pending join requests (requested,
 * preview only) · Find groups · New group. Private groups the person is not
 * in never appear.
 */
export interface SocialSwitcherListProps {
  directory: SocialDirectory | undefined;
  activeGroupId?: string;
  onHome: () => void;
  onOpen: (groupId: string) => void;
  onFind: () => void;
  onNew: () => void;
}

export function SocialSwitcherList({ directory, activeGroupId, onHome, onOpen, onFind, onNew }: SocialSwitcherListProps) {
  const t = useTranslations("Social");
  const format = useProjectFormat();
  const groups = directory?.groups ?? [];
  const pending = directory?.joinRequestsPending ?? [];
  const rowClass = "flex min-h-touch items-center gap-2.5 rounded-row px-2 py-1.5 text-start transition-colors";

  const section = (key: string, title: string, children: ReactNode[]) =>
    children.length > 0 ? (
      <div key={key} role="group" aria-label={title} className="flex flex-col gap-0.5 pt-2">
        <p aria-hidden="true" className="px-2 pb-0.5 text-[0.6875rem] font-bold tracking-wide text-fg-muted uppercase">
          {`${title} · ${format.number(children.length)}`}
        </p>
        {children}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-1">
      <button type="button" data-switcher-row="" onClick={onHome} className={cn(rowClass, "text-fg hover:bg-raised")}>
        <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-tile bg-scope-soft text-scope-deep">
          <Icon icon={House} size={16} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t("shell.switcher.home")}</span>
      </button>
      {section(
        "yours",
        t("shell.switcher.yours"),
        groups.map((group) => {
          const selected = group.id === activeGroupId;
          return (
            <button
              key={group.id}
              type="button"
              data-switcher-row=""
              aria-current={selected ? "true" : undefined}
              onClick={() => onOpen(group.id)}
              className={cn(rowClass, selected ? "bg-scope-soft text-scope-deep" : "text-fg hover:bg-raised")}
            >
              <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-tile bg-scope-soft text-xs font-bold text-scope-deep">
                <bdi>{group.initials}</bdi>
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <bdi className={cn("truncate text-sm", selected ? "font-bold" : "font-semibold")}>{group.name}</bdi>
                <span className="truncate text-xs font-medium text-fg-secondary">
                  {t("shell.switcher.line", { role: t(`roles.${group.myRole ?? "unknown"}`), people: t("people", { count: group.memberCount ?? 0, n: group.memberCount === null ? t("common.notShown") : format.number(group.memberCount) }) })}
                </span>
              </span>
              {selected ? <Icon icon={Check} size={16} className="shrink-0" /> : null}
            </button>
          );
        }),
      )}
      {groups.length === 0 ? <p className="px-2 pt-2 text-xs font-medium text-fg-muted">{t("shell.switcher.none")}</p> : null}
      {section(
        "pending",
        t("shell.switcher.pending"),
        pending.map((request) => (
          <button key={request.groupId} type="button" data-switcher-row="" onClick={() => onOpen(request.groupId)} className={cn(rowClass, "text-fg hover:bg-raised")}>
            <bdi className="min-w-0 flex-1 truncate text-sm font-semibold">{request.groupName}</bdi>
            <span className="shrink-0 rounded-pill bg-raised px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-secondary">{t("shell.switcher.requested")}</span>
          </button>
        )),
      )}
      <div className="mt-1 flex flex-col gap-0.5 border-t border-line pt-2">
        <button type="button" data-switcher-row="" onClick={onFind} className={cn(rowClass, "min-h-10 text-sm font-semibold text-fg hover:bg-raised")}>
          <Icon icon={Search} size={16} className="shrink-0 text-fg-secondary" />
          {t("shell.switcher.find")}
        </button>
        <button type="button" data-switcher-row="" aria-haspopup="dialog" onClick={onNew} className={cn(rowClass, "min-h-10 text-sm font-semibold text-fg hover:bg-raised")}>
          <Icon icon={Plus} size={16} className="shrink-0 text-fg-secondary" />
          {t("shell.switcher.new")}
        </button>
      </div>
    </div>
  );
}
