"use client";

import { ArrowLeft, Pause } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useTask } from "@/data/queries";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { convertDigits } from "@/lib/locale/digits";

/*
 * STEP 3 SKELETON of Focus (P09, built in step 10). The route lives in the
 * (focus) group, so the shell retreats: no top bar, rail or bottom nav —
 * only "Leave focus", the cycle capsule and the timer card (the one
 * signature card, focus preset, Pause in the notch). ?task=:id names the
 * task. The timer shows the Focus default from planner settings; it does not
 * run yet. Reads useSearchParams(), so it sits inside <Suspense>.
 */
export function FocusSkeleton() {
  const t = useTranslations("Personal");
  const params = useSearchParams();
  const taskId = params.get("task");
  const task = useTask(taskId);
  const settings = usePlannerSettings();
  const { digits } = usePreferences();
  const minutes = convertDigits(String(settings.focus.focusMinutes).padStart(2, "0"), digits);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-label={t("focus.landmark")}
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-gutter pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--safe-bottom)+2rem)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/personal/my-day" className={cn(buttonVariants({ variant: "secondary" }))}>
          <Icon icon={ArrowLeft} mirror size={18} />
          {t("focus.leave")}
        </Link>
        <span className="inline-flex min-h-9 items-center rounded-pill bg-surface px-4 text-sm font-semibold text-fg-secondary shadow-island">
          {t("focus.cycle", { current: convertDigits(1, digits), total: convertDigits(settings.focus.cyclesBeforeLongBreak, digits) })}
        </span>
      </div>

      <h1 className="sr-only">{t("pages.focus.title")}</h1>

      <SignatureCard
        preset="focus"
        tone="scope-soft"
        action={<SignatureCardAction icon={Pause} label={t("focus.pause")} disabled />}
      >
        <SignatureCardHeader>
          <p className="type-label text-fg-muted">{t("focus.task")}</p>
        </SignatureCardHeader>
        <p className="mt-2 type-title">
          <bdi dir="auto">{task.data?.title ?? t("focus.noTask")}</bdi>
        </p>
        {/* Clock digits are an LTR island (FaRules / PM04). */}
        <p dir="ltr" className="mt-8 text-[4.5rem] leading-none font-light tabular">
          {minutes}:{convertDigits("00", digits)}
        </p>
      </SignatureCard>

      <p className="text-sm text-fg-secondary">{t("pages.focus.purpose")}</p>
    </main>
  );
}
