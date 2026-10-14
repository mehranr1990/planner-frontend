"use client";

import { ArrowUpRight, Bell, Flame, Square, Timer, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { NotchedCard, NotchedCardButton, NotchedCardHeader } from "@/design-system/surfaces/notched-card";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatTime } from "@/lib/dates/format";
import { convertDigits } from "@/lib/locale/digits";
import { StateCaption } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const CALL_START = new Date(2026, 9, 13, 14, 0);
const CALL_END = new Date(2026, 9, 13, 14, 30);

/**
 * SIGNATURE notched cards, mirroring the Cards board (static sample text).
 * Shown on the canvas: the notch is a real cut-out to whatever is behind the
 * card, so on a white surface a white card's notch would be invisible.
 */
export function CardsSection() {
  const t = useTranslations("Styleguide.components.cards");
  const preferences = usePreferences();
  const sampleAction = () => toast({ tone: "neutral", title: t("sampleAction") });

  return (
    <StyleguideSection id="cards" tier="signature" title={t("title")} description={t("description")}>
      <div className="grid gap-6 rounded-card bg-canvas p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
          <NotchedCard
            as="article"
            aria-label={t("lead.label")}
            contentClassName="flex min-h-64 flex-col"
            action={<NotchedCardButton icon={ArrowUpRight} mirror label={t("lead.open")} onClick={sampleAction} />}
          >
            <NotchedCardHeader>
              <Avatar name="Jane Doe" initials="JD" tone="company" size={48} decorative />
            </NotchedCardHeader>
            <div className="mt-6 flex flex-col gap-1">
              <h3 className="type-title">Jane Doe</h3>
              <p className="type-caption text-fg-secondary">{t("lead.role")}</p>
            </div>
            <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-6">
              <div className="flex flex-col gap-1.5">
                <span className="type-caption text-fg-muted">{t("lead.source")}</span>
                <div className="flex flex-wrap gap-1.5">
                  <Chip size="sm">LinkedIn</Chip>
                  <Chip size="sm">{t("lead.email")}</Chip>
                </div>
              </div>
              <StatusChip tone="warning" icon={Flame}>
                {t("lead.hot")}
              </StatusChip>
            </div>
          </NotchedCard>
          <StateCaption>{t("defaultPreset")}</StateCaption>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <NotchedCard
            as="article"
            aria-label={t("live.label")}
            preset="double"
            tone="volt"
            contentClassName="flex min-h-64 flex-col"
            action={
              <>
                <NotchedCardButton icon={Bell} label={t("live.remind")} onClick={sampleAction} />
                <NotchedCardButton icon={ArrowUpRight} mirror label={t("live.open")} onClick={sampleAction} />
              </>
            }
          >
            <NotchedCardHeader>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-2.5 py-1 text-xs font-bold text-on-accent">
                <span aria-hidden className="size-1.5 rounded-full bg-volt" />
                {t("live.now")}
              </span>
              <span className="text-xs font-semibold">{t("live.soon")}</span>
            </NotchedCardHeader>
            <h3 className="mt-6 type-h1">{t("live.title")}</h3>
            <p className="mt-1 text-sm font-semibold">
              {t("live.meta", {
                person: "Peter Thomas",
                start: formatTime(CALL_START, preferences),
                end: formatTime(CALL_END, preferences),
              })}
            </p>
            <div className="mt-auto flex items-center gap-2 pt-6">
              <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-pill bg-on-volt/10 ps-1.5 pe-4">
                <Avatar name="Peter Thomas" initials="PT" size={40} decorative className="bg-surface text-fg" />
                <span className="truncate text-sm font-bold">{t("live.scheduled")}</span>
              </div>
              <IconButton icon={Video} label={t("live.join")} variant="primary" onClick={sampleAction} />
            </div>
          </NotchedCard>
          <StateCaption>{t("doublePreset")}</StateCaption>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <NotchedCard
            as="article"
            aria-label={t("timer.label")}
            preset="compact"
            tone="scope-deep"
            radius="card-sm"
            contentClassName="flex min-h-48 flex-col"
            action={<NotchedCardButton icon={Square} label={t("timer.stop")} variant="primary" onClick={sampleAction} />}
          >
            <NotchedCardHeader>
              <span aria-hidden className="grid size-10 place-items-center rounded-full bg-on-accent/15">
                <Icon icon={Timer} size={20} />
              </span>
              <h3 className="type-title">{t("timer.title")}</h3>
            </NotchedCardHeader>
            <div className="mt-auto flex items-end justify-between gap-3 pt-6">
              <span dir="ltr" className="type-display font-light tabular">
                {convertDigits("20:10", preferences.digits)}
              </span>
              <span className="pb-2 text-xs font-bold">{t("timer.running")}</span>
            </div>
          </NotchedCard>
          <StateCaption>{t("compactPreset")}</StateCaption>
        </div>
      </div>
    </StyleguideSection>
  );
}
