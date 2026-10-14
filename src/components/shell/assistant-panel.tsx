"use client";

import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { UnavailableState } from "@/components/feedback/state-views";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NotchedCard, NotchedCardButton, NotchedCardHeader } from "@/design-system/surfaces/notched-card";
import { AssistantFab } from "./assistant-fab";
import { useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * The assistant (design guide §5): the floating capsule opens a notched panel
 * anchored bottom inline-end. No chat in Step 2, only the "later step" state.
 */

function AssistantNotice() {
  const t = useTranslations("Shell.assistantPanel");
  return <UnavailableState title={t("unavailableTitle")} description={t("unavailableDescription")} variant="bare" />;
}

/**
 * Desktop: AssistantFab + its notched popover panel. The launcher sits in its
 * own complementary landmark, so the floating capsule is not loose content
 * outside every region; the landmark is desktop-only like the capsule.
 */
export function AssistantLauncher() {
  const t = useTranslations("Shell.assistantPanel");
  const tShell = useTranslations("Shell");
  const tCommon = useTranslations("Common");
  const scope = useShellScope();
  const titleId = useId();
  const [open, setOpen] = useRouteScopedOpen();

  return (
    <aside aria-label={tShell("assistant")} data-slot="assistant" className="hidden lg:block">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <AssistantFab />
        </PopoverTrigger>
        {/* The notched card is the surface, so the popover content stays unstyled. */}
        <PopoverContent
          unstyled
          side="top"
          align="end"
          sideOffset={12}
          aria-labelledby={titleId}
          data-scope={scope}
          className={
            "w-96 max-w-[calc(100vw-2rem)] " +
            // The notch is a clip-path, which would cut a box-shadow; a drop-shadow follows the shape.
            "[filter:drop-shadow(0_18px_40px_color-mix(in_oklab,var(--text-primary)_14%,transparent))] dark:[filter:none]"
          }
        >
          <NotchedCard
            preset="compact"
            radius="card-sm"
            tone="elevated"
            action={
              <PopoverClose asChild>
                <NotchedCardButton icon={X} label={tCommon("close")} variant="secondary" />
              </PopoverClose>
            }
            contentClassName="flex flex-col gap-2"
          >
            <NotchedCardHeader>
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-pill bg-scope-deep text-on-accent">
                <Icon icon={Sparkles} size={18} />
              </span>
              <h2 id={titleId} className="type-title">
                {t("title")}
              </h2>
            </NotchedCardHeader>
            <AssistantNotice />
          </NotchedCard>
        </PopoverContent>
      </Popover>
    </aside>
  );
}

export interface AssistantSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** Mobile: the assistant as a bottom sheet (reached from the "More" sheet). */
export function AssistantSheet({ open, onOpenChange, onCloseAutoFocus }: AssistantSheetProps) {
  const t = useTranslations("Shell.assistantPanel");
  const scope = useShellScope();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" title={t("title")} data-scope={scope} onCloseAutoFocus={onCloseAutoFocus}>
        <AssistantNotice />
      </SheetContent>
    </Sheet>
  );
}
