"use client";

import { ArrowLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { IconButton } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { RiskDetailView } from "./risk-detail-view";

/*
 * PJ-16 drawer: the same container as the PJ-15 task drawer (Sheet
 * side="end" size="detail", full screen on phones). Closing goes Back to the
 * register; focus returns to the row that opened it.
 */
export function RiskDrawer({ riskId }: { riskId: string }) {
  const t = useTranslations("Risk");
  const router = useRouter();
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);
  return (
    <Sheet
      defaultOpen
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <SheetContent
        side="end"
        size="detail"
        mobileSide="fullscreen"
        title={t("title")}
        hideTitle
        hideClose
        bodyClassName="px-3 pt-3 pb-6"
        data-scope="project"
        data-risk-drawer=""
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <RiskDetailView
          riskId={riskId}
          variant="drawer"
          closeControl={
            <SheetClose asChild>
              <IconButton size="sm" variant="ghost" label={t("closeX")} className="shrink-0 bg-surface">
                <X aria-hidden="true" size={18} className="max-lg:hidden" />
                <ArrowLeft aria-hidden="true" size={18} className="lg:hidden rtl:-scale-x-100" />
              </IconButton>
            </SheetClose>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
