import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { Icon } from "@/components/ui/icon";
import { getAppContext } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { cn } from "@/lib/cn";

export interface ContextSwitcherTriggerProps extends Omit<ComponentProps<"button">, "children"> {
  context: ContextId;
  /** The active workspace's display name (data, not translated). */
  workspaceName: string;
}

/**
 * Top-bar context pill (CommandBar direction A): scope dot in a soft circle,
 * small context label, workspace name, chevron. Forwards every button prop
 * and ref, so it works as <Popover.Trigger asChild>; the open state comes from
 * aria-expanded (set by Radix or the caller).
 */
export function ContextSwitcherTrigger({
  context,
  workspaceName,
  className,
  type,
  ...props
}: ContextSwitcherTriggerProps) {
  const t = useTranslations("Navigation");
  const meta = getAppContext(context);

  return (
    <button
      type={type ?? "button"}
      aria-haspopup="dialog"
      data-scope={context}
      className={cn(
        "group inline-flex h-14 max-w-full min-w-0 items-center gap-3 rounded-pill bg-surface ps-2 pe-4 text-start text-fg shadow-island",
        "transition-colors hover:bg-subtle aria-expanded:bg-scope-soft aria-expanded:text-scope-deep",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-scope-soft group-aria-expanded:bg-surface"
      >
        <span className="size-3 rounded-full bg-scope-dot ring-3 ring-surface" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs font-semibold text-fg-secondary group-aria-expanded:text-scope-deep">
          {t(meta.labelKey)}
        </span>
        <bdi className="truncate text-body font-bold">{workspaceName}</bdi>
      </span>
      <Icon icon={ChevronDown} size={14} className="shrink-0 transition-transform group-aria-expanded:rotate-180" />
      <span className="sr-only">{t("switcher.label")}</span>
    </button>
  );
}
