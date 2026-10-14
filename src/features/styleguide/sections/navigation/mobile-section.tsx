"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ContextChips } from "@/components/navigation/context-chips";
import { ContextNavList } from "@/components/navigation/context-nav-list";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { ContextId } from "@/features/navigation/types";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

interface MobileSectionProps {
  context: ContextId;
}

/**
 * Context chips and the notched bottom bar inside a 390px phone frame. The
 * bar is laid out in the frame's flow (not fixed), so it stays in the preview.
 */
export function MobileSection({ context }: MobileSectionProps) {
  const t = useTranslations("Styleguide.navigationPage.mobile");
  const tContext = useTranslations("Styleguide.context");
  const tCommon = useTranslations("Common");
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <StyleguideSection tier="signature" id="mobile" span="narrow" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("caption")} contentClassName="p-2 sm:p-4">
        <div className="mx-auto flex h-160 w-full max-w-97.5 flex-col overflow-hidden rounded-card border border-line bg-canvas">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <ContextChips activeContext={context} />
            <div className="flex flex-col gap-3" aria-hidden>
              <Skeleton shape="line" className="w-2/5" />
              <Skeleton shape="card" className="h-36 w-full" />
              <Skeleton shape="row" className="w-full" />
              <Skeleton shape="row" className="w-full" />
            </div>
          </div>
          <MobileBottomNav
            context={context}
            activeItemId="overview"
            fabLabel={t("quickAdd")}
            onFabClick={() => toast({ tone: "neutral", title: t("quickAdd"), description: tCommon("comingSoon") })}
            onMoreClick={() => setMoreOpen(true)}
            moreExpanded={moreOpen}
          />
        </div>
      </PreviewFrame>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" title={t("moreTitle", { context: tContext(context) })}>
          <ContextNavList context={context} onNavigate={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
    </StyleguideSection>
  );
}
