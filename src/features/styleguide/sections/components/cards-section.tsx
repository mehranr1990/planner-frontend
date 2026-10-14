"use client";

import { ArrowUpRight, Pause, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/toast";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { notchPresets, type NotchPresetName } from "@/design-system/tokens/radii";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDate, formatDuration, formatTime } from "@/lib/dates/format";
import { convertDigits, formatNumber, formatPercent } from "@/lib/locale/digits";
import { StateCaption } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/* P00 sample: the Now block of My Day and the Launch Planner v1 beta date (20 Aban 1405). */
const NOW_START = new Date(2026, 9, 14, 14, 0);
const NOW_END = new Date(2026, 9, 14, 16, 0);
const NOW_REMAINING_MINUTES = 35;
const BETA_DATE = new Date(2026, 10, 11);
/** preset="auto" switches at Tailwind lg (SIGNATURE_DESKTOP_QUERY). */
const AUTO_BREAKPOINT = 1024;

/** Single-action presets; the double notch is shown by the Insight card (two actions). */
const PRESETS = ["desktop", "mobile", "focus"] as const satisfies readonly NotchPresetName[];

const RULES = ["oneAction", "twoActions", "density", "never"] as const;

/**
 * SIGNATURE cards (P00 "Card geometry · A"): the three board demos, then the
 * notch presets. Shown on the canvas: the notch is a real cut-out to whatever
 * is behind the card, so on a white surface a white card's notch would vanish.
 * The Now card is the only volt area on the page.
 */
export function CardsSection() {
  const t = useTranslations("Styleguide.components.cards");
  const preferences = usePreferences();
  const { digits } = preferences;
  const n = (value: string | number) => convertDigits(String(value), digits);
  const sampleAction = () => toast({ tone: "neutral", title: t("sampleAction") });

  return (
    <StyleguideSection id="cards" tier="signature" title={t("title")} description={t("description")}>
      <div className="grid gap-6 rounded-card bg-canvas p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
          <SignatureCard
            as="article"
            aria-label={t("now.label")}
            tone="volt"
            contentClassName="flex min-h-57.5 flex-col"
            action={
              <SignatureCardAction
                icon={Play}
                iconClassName="fill-volt text-volt"
                label={t("now.start")}
                onClick={sampleAction}
              />
            }
          >
            <SignatureCardHeader>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-2.5 py-1 text-xs font-bold text-on-accent">
                <span aria-hidden className="size-2 rounded-full bg-volt" />
                {t("now.chip")}
              </span>
            </SignatureCardHeader>
            <h3 className="mt-auto pt-8 text-[1.625rem] leading-tight font-semibold">{t("now.title")}</h3>
            <p className="mt-1 text-xs font-semibold text-on-volt-2">
              {t("now.meta", {
                start: formatTime(NOW_START, preferences),
                end: formatTime(NOW_END, preferences),
                remaining: formatDuration(NOW_REMAINING_MINUTES, preferences),
              })}
            </p>
          </SignatureCard>
          <StateCaption>{t("actionCaption")}</StateCaption>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <SignatureCard
            as="article"
            aria-label={t("insight.label")}
            tone="deep"
            contentClassName="flex min-h-57.5 flex-col"
            // P01 Insight: Dismiss and See pattern are its two real actions.
            action={[
              <SignatureCardAction
                key="open"
                variant="neutral"
                icon={ArrowUpRight}
                mirror
                label={t("insight.open")}
                onClick={sampleAction}
              />,
              <SignatureCardAction
                key="stop"
                variant="danger"
                icon={Square}
                iconClassName="fill-current"
                label={t("insight.stop")}
                onClick={sampleAction}
              />,
            ]}
          >
            <SignatureCardHeader>
              <span className="type-label text-on-deep-card-muted">{t("insight.kicker")}</span>
            </SignatureCardHeader>
            <h3 className="mt-6 type-title text-on-deep-card">
              {t("insight.body", { from: n("09"), to: n("12") })}
            </h3>
          </SignatureCard>
          <StateCaption>{t("doubleCaption")}</StateCaption>
        </div>

        <div className="flex min-w-0 flex-col gap-2 md:col-span-2 xl:col-span-1">
          <SignatureCard
            as="article"
            aria-label={t("goal.label")}
            contentClassName="flex min-h-57.5 flex-col"
            action={
              <SignatureCardAction
                variant="neutral"
                icon={ArrowUpRight}
                mirror
                label={t("goal.open")}
                onClick={sampleAction}
              />
            }
          >
            <SignatureCardHeader>
              <span className="type-label text-fg-muted">{t("goal.kicker")}</span>
            </SignatureCardHeader>
            <h3 className="mt-6 type-title">{t("goal.title")}</h3>
            <p className="mt-1.5 text-xs font-semibold text-fg-muted">
              {t("goal.meta", {
                percent: formatPercent(0.64, digits),
                date: formatDate(BETA_DATE, "dayMonth", preferences),
              })}
            </p>
          </SignatureCard>
          <StateCaption>{t("navigationCaption")}</StateCaption>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="type-label text-fg-secondary">{t("presets.title")}</h3>
        <p className="type-caption text-fg-muted">{t("presets.auto", { breakpoint: n(AUTO_BREAKPOINT) })}</p>
        <div className="grid gap-6 rounded-card bg-canvas p-4 sm:p-6 md:grid-cols-3">
          {PRESETS.map((preset) => (
            <PresetDemo key={preset} preset={preset} onAction={sampleAction} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="type-label text-fg-secondary">{t("rules.title")}</h3>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {RULES.map((rule) => (
            <li key={rule} className="rounded-utility bg-subtle px-4 py-3.5 type-caption text-fg-secondary">
              {t(`rules.${rule}`)}
            </li>
          ))}
        </ul>
      </div>
    </StyleguideSection>
  );
}

/** One fixed preset: the active numbers come from notchPresets, so the caption cannot drift. */
function PresetDemo({ preset, onAction }: { preset: (typeof PRESETS)[number]; onAction: () => void }) {
  const t = useTranslations("Styleguide.components.cards.presets");
  const { digits } = usePreferences();
  const { notchWidth, notchHeight, fillet, button } = notchPresets[preset];
  const name = t(`names.${preset}`);
  const focus = preset === "focus";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SignatureCard
        as="article"
        aria-label={t("label", { name })}
        preset={preset}
        tone={focus ? "scope-soft" : "surface"}
        contentClassName="flex min-h-44 flex-col"
        action={
          focus ? (
            <SignatureCardAction icon={Pause} label={t("pause")} onClick={onAction} />
          ) : (
            <SignatureCardAction variant="neutral" icon={ArrowUpRight} mirror label={t("open")} onClick={onAction} />
          )
        }
      >
        <SignatureCardHeader>
          <h4 className="text-sm font-bold">{name}</h4>
        </SignatureCardHeader>
        {focus ? (
          <span dir="ltr" className="mt-auto self-start pt-4 type-display font-light tabular">
            {convertDigits("18:42", digits)}
          </span>
        ) : (
          <p className="mt-auto pt-4 type-caption text-fg-secondary">{t(`uses.${preset}`)}</p>
        )}
      </SignatureCard>
      <p className="type-caption text-fg-muted">
        {t("spec", {
          width: formatNumber(notchWidth, digits),
          height: formatNumber(notchHeight, digits),
          fillet: formatNumber(fillet, digits),
          button: formatNumber(button, digits),
        })}
      </p>
      {focus ? <p className="type-caption text-fg-muted">{t(`uses.${preset}`)}</p> : null}
    </div>
  );
}
