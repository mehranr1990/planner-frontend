"use client";

import { Bell, Check, CircleAlert, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Toast as ToastPrimitive } from "radix-ui";
import { useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { statusTokens } from "@/design-system/tokens/colors";
import { cn } from "@/lib/cn";

/*
 * Toasts: an imperative toast()/dismiss() API over a tiny module-level store,
 * rendered by a single <Toaster /> on Radix Toast (live-region announcements,
 * pause on hover/focus, swipe and F8 to reach the viewport).
 */

export type ToastTone = "success" | "info" | "warning" | "danger" | "neutral";

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** How to do the same thing without the toast, for screen-reader users. */
  altText: string;
}

export interface ToastOptions {
  /** Pass an id to replace a toast that is already showing. */
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. Defaults to 5000 (8000 with an action). */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
  open: boolean;
}

/** Visible at once; later toasts wait their turn. */
export const MAX_VISIBLE_TOASTS = 3;
/** Long enough for the pop-out animation before the record is dropped. */
const REMOVE_DELAY = 400;

type Listener = () => void;

let records: readonly ToastRecord[] = [];
const listeners = new Set<Listener>();
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

function emit(next: readonly ToastRecord[]) {
  records = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => records;
const EMPTY: readonly ToastRecord[] = [];
const getServerSnapshot = () => EMPTY;

/** Shows a toast and returns its id. */
export function toast(options: ToastOptions): string {
  const id = options.id ?? `toast-${++counter}`;
  const record: ToastRecord = { tone: "neutral", ...options, id, open: true };
  const timer = removalTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    removalTimers.delete(id);
  }
  const exists = records.some((item) => item.id === id);
  emit(exists ? records.map((item) => (item.id === id ? record : item)) : [...records, record]);
  return id;
}

/** Closes one toast (animated), or every toast when called without an id. */
export function dismiss(id?: string) {
  const targets = records.filter((item) => item.open && (id === undefined || item.id === id));
  if (targets.length === 0) return;
  const closing = new Set(targets.map((item) => item.id));
  emit(records.map((item) => (closing.has(item.id) ? { ...item, open: false } : item)));
  for (const target of closing) {
    removalTimers.set(
      target,
      setTimeout(() => {
        removalTimers.delete(target);
        emit(records.filter((item) => item.id !== target));
      }, REMOVE_DELAY),
    );
  }
}

/** Test helper: drops every toast immediately. */
export function resetToasts() {
  removalTimers.forEach((timer) => clearTimeout(timer));
  removalTimers.clear();
  counter = 0;
  emit([]);
}

const toneIcon: Record<ToastTone, LucideIcon> = {
  success: Check,
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  neutral: Bell,
};

function ToastItem({ record }: { record: ToastRecord }) {
  const tCommon = useTranslations("Common");
  const t = useTranslations("Feedback.toast");
  const tone = record.tone ?? "neutral";
  const token = statusTokens[tone];
  const duration = record.duration ?? (record.action ? 8000 : 5000);

  return (
    <ToastPrimitive.Root
      open={record.open}
      onOpenChange={(open) => {
        if (!open) dismiss(record.id);
      }}
      duration={duration}
      // Danger interrupts (assertive); everything else is polite.
      type={tone === "danger" ? "foreground" : "background"}
      data-tone={tone}
      className={cn(
        "pointer-events-auto relative flex w-full items-center gap-3 rounded-row border border-hairline bg-elevated",
        "py-2.5 ps-3.5 pe-2.5 text-fg shadow-elevated",
        "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
        "data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y) data-[swipe=cancel]:translate-y-0",
        "data-[swipe=cancel]:transition-[translate] data-[swipe=end]:animate-sheet-down",
      )}
    >
      <span
        aria-hidden
        className={cn("inline-flex size-7.5 shrink-0 items-center justify-center rounded-pill", token.soft, token.text)}
      >
        <Icon icon={toneIcon[tone]} size={15} className="stroke-[2.4]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <ToastPrimitive.Title className="text-sm font-semibold text-fg">
          {/* Tone is never colour alone: name it for assistive tech. */}
          {tone === "warning" || tone === "danger" ? <span className="sr-only">{t(`tone.${tone}`)}: </span> : null}
          {record.title}
        </ToastPrimitive.Title>
        {record.description != null ? (
          <ToastPrimitive.Description className="text-xs text-fg-secondary">{record.description}</ToastPrimitive.Description>
        ) : null}
      </div>
      {record.action ? (
        <ToastPrimitive.Action altText={record.action.altText} asChild>
          <button
            type="button"
            onClick={record.action.onClick}
            className={cn(
              // 40px visual capsule with a 48px hit area.
              "relative inline-flex h-10 shrink-0 items-center rounded-pill bg-secondary px-3.5 text-xs font-bold text-fg",
              "hover:bg-secondary-hover active:bg-secondary-pressed after:absolute after:-inset-1",
            )}
          >
            {record.action.label}
          </button>
        </ToastPrimitive.Action>
      ) : null}
      <ToastPrimitive.Close
        aria-label={tCommon("close")}
        className={cn(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-pill text-fg-muted",
          "hover:bg-raised hover:text-fg after:absolute after:-inset-2",
        )}
      >
        <Icon icon={X} size={16} />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

interface ToasterProps {
  /**
   * Viewport classes. By default toasts sit bottom-centre, clear of a mobile
   * bottom nav (6rem + safe area) and 1.5rem from the bottom on md+.
   */
  className?: string;
}

/** Render once near the root of the app. */
export function Toaster({ className }: ToasterProps) {
  const t = useTranslations("Feedback.toast");
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const visible = items.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <ToastPrimitive.Provider swipeDirection="down" label={t("label")}>
      {visible.map((record) => (
        <ToastItem key={record.id} record={record} />
      ))}
      <ToastPrimitive.Viewport
        label={t("region", { hotkey: "F8" })}
        className={cn(
          // The viewport spans the bottom edge; only toasts take pointer events.
          "pointer-events-none fixed inset-x-0 bottom-0 z-(--z-toast) mx-auto flex w-full max-w-md flex-col gap-2",
          // Padding only while toasts show, so an empty viewport has no box over page content.
          visible.length > 0 && "px-gutter pb-[calc(var(--safe-bottom)+6rem)] md:pb-[calc(var(--safe-bottom)+1.5rem)]",
          className,
        )}
      />
    </ToastPrimitive.Provider>
  );
}
