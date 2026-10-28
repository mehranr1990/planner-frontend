"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useInsightHighlight } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { cn } from "@/lib/cn";

/*
 * Insight (P01 → Insights, the referenced pattern): one deep story card, no
 * notch (the hero holds the page's notch). Plain words, no AI. Dismiss hides
 * it for this visit and the row re-flows; nothing to show renders nothing.
 */

export function InsightCard({ today, onDismiss, className }: { today: string; onDismiss: () => void; className?: string }) {
  const t = useTranslations("Overview.insight");
  const format = useMyDayFormat();
  const query = useInsightHighlight(today);
  const insight = query.data;
  if (!insight) return null;

  return (
    <ProductCard
      as="section"
      aria-labelledby="overview-insight-title"
      className={cn("flex flex-col gap-3 bg-deep-card text-on-deep-card", className)}
    >
      <p className="text-[0.6875rem] font-bold tracking-wide text-on-deep-card-muted uppercase">{t("eyebrow")}</p>
      <h2 id="overview-insight-title" className="type-title leading-snug">
        {t.rich("bestFocus", {
          range: () => (
            <span dir="ltr" className="tabular">
              {format.clock(insight.startHour * 60).slice(0, 2)}–{format.clock(insight.endHour * 60).slice(0, 2)}
            </span>
          ),
          booked: insight.bookedToday ? "yes" : "no",
        })}
      </h2>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary" className="bg-surface text-fg hover:bg-subtle">
          <Link href="/personal/insights">{t("see")}</Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          className="border-on-deep-card-muted text-on-deep-card hover:bg-on-deep-card/10"
        >
          {t("dismiss")}
        </Button>
      </div>
    </ProductCard>
  );
}
