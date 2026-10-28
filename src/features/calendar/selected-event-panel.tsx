"use client";

import { ArrowUpRight, CalendarClock, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { useMyDay } from "@/features/my-day/my-day-context";
import { focusHref } from "@/features/my-day/rail/focus-entry";
import { useMarkDone } from "@/features/my-day/rail/use-mark-done";
import { ClockText } from "@/features/my-day/timeline/clock-text";
import { taskDetailHref } from "@/features/personal/routes";
import { cn } from "@/lib/cn";
import { isEditableScope } from "./domain/layers";
import type { CalendarData } from "./use-calendar-data";
import { useCalendarFormat } from "./use-calendar-format";

/*
 * The selected event (P04): a scope-tinted Signature card. Notch: Reschedule
 * + Open detail for a task, Close otherwise. Actions: Start focus (tasks
 * only), Mark done (Personal). Other scopes are read-only context here
 * ("Managed in Projects"). Esc closes.
 */

const TINT: Record<DayBlock["scope"], string> = {
  personal: "bg-personal-soft",
  project: "bg-project-soft",
  team: "bg-team-soft",
  company: "bg-company-soft",
};

function findBlock(byDay: CalendarData["byDay"], id: string | null): { day: string; block: DayBlock } | null {
  if (!id) return null;
  for (const [day, blocks] of byDay) {
    const block = blocks.find((item) => item.id === id);
    if (block) return { day, block };
  }
  return null;
}

export function SelectedEventPanel({ data }: { data: CalendarData }) {
  const t = useTranslations("Calendar");
  const format = useCalendarFormat();
  const router = useRouter();
  const markDone = useMarkDone();
  const { selectedBlockId, selectBlock, openReschedule } = useMyDay();
  const headingId = useId();

  const found = findBlock(data.byDay, selectedBlockId);
  const open = found !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) selectBlock(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, selectBlock]);

  if (!found) return null;
  const { day, block } = found;
  const editable = isEditableScope(block.scope);
  const taskId = block.taskId;
  const scopeName = t(`layers.names.${block.scope}`);

  const close = <SignatureCardAction label={t("selected.close")} icon={X} variant="neutral" onClick={() => selectBlock(null)} />;
  const action =
    taskId && editable
      ? ([
          <SignatureCardAction
            key="reschedule"
            label={t("selected.reschedule")}
            icon={CalendarClock}
            variant="neutral"
            onClick={(event) => openReschedule({ kind: "block", id: block.id }, event.currentTarget)}
          />,
          <SignatureCardAction key="open" label={t("selected.open")} icon={ArrowUpRight} onClick={() => router.push(taskDetailHref(taskId))} />,
        ] as const)
      : close;

  return (
    <SignatureCard as="section" aria-labelledby={headingId} contentClassName={cn("flex flex-col gap-3", TINT[block.scope])} action={action}>
      <SignatureCardHeader className="flex-col items-start gap-1">
        <span className="text-xs font-bold text-scope-deep">{t("selected.label")}</span>
        <h2 id={headingId} className="text-[1.375rem] leading-tight font-semibold [&:lang(fa)]:font-bold">
          <bdi dir="auto">{block.title}</bdi>
        </h2>
        <p className="text-sm font-semibold text-fg-secondary">
          {format.kicker(day)} · <ClockText>{format.clockRange(block.startMinutes, block.endMinutes)}</ClockText>
        </p>
      </SignatureCardHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[18px] bg-surface/70 p-3 text-sm">
        <dt className="text-fg-muted">{t("selected.scope")}</dt>
        <dd className="text-end font-semibold">{scopeName}</dd>
        <dt className="text-fg-muted">{t("selected.type")}</dt>
        <dd className="text-end font-semibold">{t(`selected.kinds.${block.kind}`)}</dd>
        <dt className="text-fg-muted">{t("selected.duration")}</dt>
        <dd className="text-end font-semibold">{format.duration(block.durationMinutes)}</dd>
      </dl>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          {taskId ? (
            <Button asChild className="flex-1">
              <Link href={focusHref(taskId)}>{t("selected.startFocus")}</Link>
            </Button>
          ) : null}
          {!block.done ? (
            <Button variant="secondary" className="flex-1" onClick={() => void markDone({ id: block.id, title: block.title })}>
              {t("selected.markDone")}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-semibold text-fg-muted">{t("layers.managed", { module: scopeName })}</p>
      )}
    </SignatureCard>
  );
}
