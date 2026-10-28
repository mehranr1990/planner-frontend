"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef, type ReactNode } from "react";
import { FloatingPanel, FloatingPanelContent } from "@/components/ui/floating-panel";
import { Sheet, SheetContent, type SheetContentProps } from "@/components/ui/sheet";
import { moduleForSheet } from "@/features/planner-settings/modules";
import { ModuleHiddenState } from "@/features/planner-settings/module-hidden-state";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { EXPENSE_SHEET_TX_PARAM, ExpenseSheet } from "@/features/finance/expense-sheet";
import { GOAL_SHEET_PARAM, GOAL_SHEET_TITLE_PARAM, GoalSheet } from "@/features/goals/goal-sheet";
import { HABIT_SHEET_PARAM, HABIT_SHEET_TITLE_PARAM, HabitSheet } from "@/features/habits/habit-sheet";
import { MoodCheckIn } from "@/features/journal/mood-check-in";
import { QuickAdd } from "@/features/tasks/create/quick-add";
import { RescheduleSheet } from "@/features/reschedule/reschedule-sheet";
import { QuickNote } from "./quick-note";
import {
  consumeOpenedSheet,
  isSheetId,
  QUICK_ADD_TEXT_PARAM,
  SHEET_PARAM,
  sheetHref,
  sheetScopedParams,
  type SheetId,
} from "./sheet-params";
import { usePageHydrated } from "./use-page-hydrated";
import { VoiceCapture } from "./voice-capture";

/*
 * The global sheet host (P00PersonalIA Routes · P18): `?sheet=<id>` on any
 * Personal route opens that flow over the page; closing removes only the
 * parameter. Container rule (P18): drawer (420px, inline end) for multi-field
 * create/edit, centred sheet for Add expense and Quick Add, floating panel
 * for Quick note and Voice; below lg everything is a bottom sheet (Sheet and
 * FloatingPanel switch themselves).
 *
 * Mood and Reschedule are popovers in P18, anchored to what opened them. A
 * URL has no anchor, so here they open as a compact centred sheet (Journal
 * owns mood inline in its composer).
 *
 * Every body is real: Quick Add (P18 · H), Add expense (A), Habit (B), Goal (C),
 * Mood check-in (D), Reschedule (E), Quick note (F) and Voice (G). Sheets of
 * hidden modules show "Module hidden".
 * Reads useSearchParams(), so mount it inside <Suspense>.
 */

type Container =
  | { kind: "sheet"; side: NonNullable<SheetContentProps["side"]>; size?: SheetContentProps["size"]; compact?: boolean }
  | { kind: "floating" };

const containers: Record<SheetId, Container> = {
  "quick-add": { kind: "sheet", side: "center" },
  expense: { kind: "sheet", side: "center" },
  habit: { kind: "sheet", side: "end", size: "drawer" },
  goal: { kind: "sheet", side: "end", size: "drawer" },
  mood: { kind: "sheet", side: "center", compact: true },
  reschedule: { kind: "sheet", side: "center", compact: true },
  note: { kind: "floating" },
  voice: { kind: "floating" },
};

export function SheetHost() {
  const params = useSearchParams();
  const value = params.get(SHEET_PARAM);
  // Arriving with the URL, open only once the page under it has hydrated (see usePageHydrated).
  const pageHydrated = usePageHydrated();
  // Keyed by id: switching sheets remounts the container cleanly.
  return pageHydrated && isSheetId(value) ? (
    <OpenSheet
      key={value}
      id={value}
      initialText={params.get(QUICK_ADD_TEXT_PARAM) ?? undefined}
      goalId={params.get(GOAL_SHEET_PARAM)}
      goalTitle={params.get(GOAL_SHEET_TITLE_PARAM) ?? undefined}
      habitId={params.get(HABIT_SHEET_PARAM)}
      habitTitle={params.get(HABIT_SHEET_TITLE_PARAM) ?? undefined}
      transactionId={params.get(EXPENSE_SHEET_TX_PARAM)}
    />
  ) : null;
}

function OpenSheet({
  id,
  initialText,
  goalId,
  goalTitle,
  habitId,
  habitTitle,
  transactionId,
}: {
  id: SheetId;
  initialText?: string;
  goalId?: string | null;
  goalTitle?: string;
  habitId?: string | null;
  habitTitle?: string;
  transactionId?: string | null;
}) {
  const t = useTranslations("Personal.sheets");
  const tGoals = useTranslations("Goals.sheet");
  const tHabits = useTranslations("Habits.sheet");
  const tFinance = useTranslations("Finance.sheet");
  const router = useRouter();
  const pathname = usePathname();
  const settings = usePlannerSettings();
  // The opener (top-bar +, FAB, palette) still has focus when the sheet mounts.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  const close = useCallback(() => {
    // Opened here: Back consumes the entry. Arrived with the URL: drop the parameter.
    if (consumeOpenedSheet()) router.back();
    else router.replace(sheetHref(pathname, window.location.search, null, sheetScopedParams[id]), { scroll: false });
  }, [router, pathname, id]);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);

  const sheetModule = moduleForSheet(id);
  const hidden = sheetModule !== null && !isModuleVisible(settings, sheetModule);
  const body: ReactNode = hidden ? (
    <ModuleHiddenState module={sheetModule} titleAs="h3" />
  ) : id === "quick-add" ? (
    <QuickAdd onClose={close} initialText={initialText} />
  ) : id === "expense" ? (
    <ExpenseSheet onClose={close} initialText={initialText} transactionId={transactionId} />
  ) : id === "habit" ? (
    <HabitSheet habitId={habitId} initialTitle={habitTitle} onClose={close} />
  ) : id === "goal" ? (
    <GoalSheet goalId={goalId} initialTitle={goalTitle} onClose={close} />
  ) : id === "reschedule" ? (
    <RescheduleSheet onClose={close} />
  ) : id === "note" ? (
    <QuickNote onClose={close} />
  ) : id === "mood" ? (
    <MoodCheckIn onClose={close} />
  ) : (
    <VoiceCapture onClose={close} />
  );

  const container = containers[id];
  const title = id === "expense" && transactionId ? tFinance("titleEdit") : id === "goal" && goalId ? tGoals("titleEdit") : id === "habit" && habitId ? tHabits("titleEdit") : t(`${id}.title`);
  const onOpenChange = (open: boolean) => {
    if (!open) close();
  };

  if (container.kind === "floating") {
    return (
      <FloatingPanel open onOpenChange={onOpenChange}>
        <FloatingPanelContent title={t(`${id}.title`)} data-scope="personal" data-sheet={id} onCloseAutoFocus={onCloseAutoFocus}>
          {body}
        </FloatingPanelContent>
      </FloatingPanel>
    );
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side={container.side}
        size={container.size}
        title={title}
        data-scope="personal"
        data-sheet={id}
        onCloseAutoFocus={onCloseAutoFocus}
        className={container.compact ? "lg:max-w-md" : undefined}
      >
        {body}
      </SheetContent>
    </Sheet>
  );
}
