"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef, type ReactNode } from "react";
import { FloatingPanel, FloatingPanelContent } from "@/components/ui/floating-panel";
import { Sheet, SheetContent, type SheetContentProps } from "@/components/ui/sheet";
import { sheetSteps } from "@/features/personal/pages";
import { moduleForSheet } from "@/features/planner-settings/modules";
import { ModuleHiddenState } from "@/features/planner-settings/module-hidden-state";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { convertDigits } from "@/lib/locale/digits";
import { consumeOpenedSheet, isSheetId, SHEET_PARAM, sheetHref, type SheetId } from "./sheet-params";

/*
 * The global sheet host (P00PersonalIA Routes · P18): `?sheet=<id>` on any
 * Personal route opens that flow over the page; closing removes only the
 * parameter. Container rule (P18): drawer (420px, inline end) for multi-field
 * create/edit, centred sheet for Add expense and Quick Add, floating panel
 * for Quick note and Voice; below lg everything is a bottom sheet (Sheet and
 * FloatingPanel switch themselves).
 *
 * Mood and Reschedule are popovers in P18, anchored to what opened them. A
 * URL has no anchor, so here they open as a compact centred sheet; the
 * screens that own them (My Day, Journal) anchor real popovers later.
 *
 * Bodies are placeholders: the flows arrive with their first screen
 * (pages.ts · sheetSteps). Sheets of hidden modules show "Module hidden".
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
  // Keyed by id: switching sheets remounts the container cleanly.
  return isSheetId(value) ? <OpenSheet key={value} id={value} /> : null;
}

function OpenSheet({ id }: { id: SheetId }) {
  const t = useTranslations("Personal.sheets");
  const router = useRouter();
  const pathname = usePathname();
  const settings = usePlannerSettings();
  const { digits } = usePreferences();
  // The opener (top-bar +, FAB, palette) still has focus when the sheet mounts.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  const close = useCallback(() => {
    // Opened here: Back consumes the entry. Arrived with the URL: drop the parameter.
    if (consumeOpenedSheet()) router.back();
    else router.replace(sheetHref(pathname, window.location.search, null), { scroll: false });
  }, [router, pathname]);

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
  ) : (
    <p data-sheet-placeholder={id} className="type-body text-fg-secondary">
      {t(`${id}.note`, { step: convertDigits(sheetSteps[id], digits) })}
    </p>
  );

  const container = containers[id];
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
        title={t(`${id}.title`)}
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
