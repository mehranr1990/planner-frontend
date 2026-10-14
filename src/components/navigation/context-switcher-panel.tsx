"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ComponentProps, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { appContexts } from "@/features/navigation/contexts";
import type { AppContext, ContextId, Workspace } from "@/features/navigation/types";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { ComingSoonBadge } from "./coming-soon-badge";

export interface ContextSwitcherPanelProps extends Omit<ComponentProps<"div">, "onSelect" | "children"> {
  activeContext: ContextId;
  activeWorkspaceId?: string;
  workspaces: Readonly<Record<ContextId, readonly Workspace[]>>;
  onSelect: (context: ContextId, workspaceId: string) => void;
}

const ROW_SELECTOR = "[data-switcher-row]";

/** Up/Down/Home/End move focus between every row of the panel; Tab works natively. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ROW_SELECTOR));
  if (rows.length === 0) return;
  const index = rows.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = rows.length - 1;
  else if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % rows.length;
  else next = index < 0 ? rows.length - 1 : (index - 1 + rows.length) % rows.length;
  event.preventDefault();
  rows[next]!.focus();
}

/**
 * Context switcher popover content (Shell board). Contexts are disclosure
 * rows (one open at a time, the active context first); each lists its
 * workspaces as buttons, the selected one marked aria-current plus a check.
 * "New project" etc. stay disabled until workspace creation ships.
 *
 * Wrap it in a Popover; it accepts div props and a ref, so
 * <Popover.Content asChild> works (Radix then supplies role="dialog").
 * Surface styles are included, so use the unstyled PopoverContent, which adds
 * the stacking, transform origin and pop animation.
 */
export function ContextSwitcherPanel({
  activeContext,
  activeWorkspaceId,
  workspaces,
  onSelect,
  className,
  onKeyDown,
  ...props
}: ContextSwitcherPanelProps) {
  const t = useTranslations("Navigation");
  const [expanded, setExpanded] = useState<ContextId | null>(activeContext);

  return (
    <div
      role="group"
      aria-label={t("switcher.label")}
      className={cn(
        "flex w-85 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-card-sm bg-elevated p-2.5 text-fg shadow-elevated",
        className,
      )}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented) moveFocus(event);
      }}
      {...props}
    >
      <p aria-hidden="true" className="px-2.5 pt-1.5 pb-2 type-label text-fg-secondary">
        {t("switcher.title")}
      </p>
      {appContexts.map((context) => (
        <ContextRow
          key={context.id}
          context={context}
          active={context.id === activeContext}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces[context.id] ?? []}
          expanded={expanded === context.id}
          onToggle={() => setExpanded(expanded === context.id ? null : context.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface ContextRowProps {
  context: AppContext;
  active: boolean;
  activeWorkspaceId: string | undefined;
  workspaces: readonly Workspace[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: (context: ContextId, workspaceId: string) => void;
}

function ContextRow({ context, active, activeWorkspaceId, workspaces, expanded, onToggle, onSelect }: ContextRowProps) {
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const { digits } = usePreferences();
  const regionId = useId();
  const addHintId = useId();
  const label = t(context.labelKey);
  const current = active ? workspaces.find((workspace) => workspace.id === activeWorkspaceId) : undefined;

  const summary = current
    ? t("switcher.activeWorkspace", { workspace: current.name })
    : t("switcher.workspaceCount", { count: workspaces.length, formatted: formatNumber(workspaces.length, digits) });

  return (
    <div data-scope={context.id} className={cn("flex flex-col rounded-row", expanded && "bg-subtle")}>
      <button
        type="button"
        data-switcher-row=""
        aria-expanded={expanded}
        aria-controls={expanded ? regionId : undefined}
        onClick={onToggle}
        className="flex min-h-13.5 items-center gap-3 rounded-row px-3 text-start transition-colors hover:bg-raised"
      >
        <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-scope-dot" />
        <span className="flex min-w-0 flex-1 flex-col leading-snug">
          <span className="text-sm font-bold text-fg">{label}</span>
          <span className="truncate text-xs font-medium text-fg-secondary">{summary}</span>
        </span>
        <Icon
          icon={ChevronDown}
          size={14}
          className={cn("shrink-0 text-fg-secondary transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded ? (
        <div
          id={regionId}
          role="group"
          aria-label={t("switcher.workspaces", { context: label })}
          className="flex flex-col gap-0.5 ps-7.5 pe-2 pb-2"
        >
          {workspaces.map((workspace) => {
            const selected = active && workspace.id === activeWorkspaceId;
            return (
              <button
                key={workspace.id}
                type="button"
                data-switcher-row=""
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(context.id, workspace.id)}
                className={cn(
                  "flex min-h-touch items-center gap-2.5 rounded-row px-3 text-start text-sm transition-colors",
                  selected ? "bg-scope-soft font-bold text-scope-deep" : "font-medium text-fg hover:bg-raised",
                )}
              >
                <bdi className="min-w-0 flex-1 truncate">{workspace.name}</bdi>
                {selected ? <Icon icon={Check} size={16} className="shrink-0" /> : null}
              </button>
            );
          })}
          {context.canAddWorkspace ? (
            <button
              type="button"
              data-switcher-row=""
              aria-disabled="true"
              aria-describedby={addHintId}
              className="flex min-h-10 cursor-not-allowed items-center gap-2 rounded-row px-3 text-start text-xs font-semibold text-fg-muted"
            >
              <Icon icon={Plus} size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(context.addLabelKey)}</span>
              <ComingSoonBadge id={addHintId} aria-hidden="true">
                {tCommon("comingSoon")}
              </ComingSoonBadge>
            </button>
          ) : (
            <p className="px-3 py-2 text-xs font-medium text-fg-muted">{t(context.addLabelKey)}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
