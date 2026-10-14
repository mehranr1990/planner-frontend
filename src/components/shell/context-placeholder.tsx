import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { NotchedCard, NotchedCardButton, NotchedCardHeader } from "@/design-system/surfaces/notched-card";
import type { ContextId } from "@/features/navigation/types";
import { cn } from "@/lib/cn";

/*
 * STEP 2 PLACEHOLDER — delete this file when Step 3 builds the real overviews.
 *
 * Mirrors the Shell board's zones for a context overview: one signature hero
 * (notched), three product cards, and a dashed utility strip. Every zone is
 * labelled "Placeholder · Step 3" and shows only what the zone will hold,
 * never metrics. Server-compatible; text comes from Shell.placeholder.*.
 */

function ZoneChips({ zone, emphasis = false }: { zone: string; emphasis?: boolean }) {
  const t = useTranslations("Shell.placeholder");
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex min-h-7 items-center rounded-pill px-3 type-label",
          emphasis ? "bg-scope-deep text-on-accent" : "bg-scope-soft text-scope-deep",
        )}
      >
        {zone}
      </span>
      <span className="inline-flex min-h-7 items-center rounded-pill border border-dashed border-outline px-3 text-xs font-semibold text-fg-secondary">
        {t("badge")}
      </span>
    </span>
  );
}

function ProductCard({ title, note, zone }: { title: ReactNode; note: ReactNode; zone: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-6 rounded-card bg-surface p-card">
      <ZoneChips zone={zone} />
      <div className="mt-auto flex flex-col gap-1">
        <h3 className="text-lg font-bold text-fg">{title}</h3>
        <p className="type-caption text-fg-secondary">{note}</p>
      </div>
    </li>
  );
}

export function ContextPlaceholder({ context }: { context: ContextId }) {
  const t = useTranslations("Shell.placeholder");
  const products = [
    { title: t(`${context}.p1Title`), note: t(`${context}.p1Note`) },
    { title: t(`${context}.p2Title`), note: t(`${context}.p2Note`) },
    { title: t(`${context}.p3Title`), note: t(`${context}.p3Note`) },
  ];

  return (
    <section aria-label={t("region")} data-placeholder="step-3" className="flex min-w-0 flex-col gap-4">
      <NotchedCard
        as="article"
        padding="lg"
        action={
          <NotchedCardButton label={t("openHero")} variant="primary" disabled>
            <Icon icon={ArrowUpRight} mirror size={22} />
          </NotchedCardButton>
        }
      >
        <NotchedCardHeader>
          <ZoneChips zone={t("hero")} emphasis />
        </NotchedCardHeader>
        <div className="mt-10 flex max-w-2xl flex-col gap-2">
          <h2 className="type-h1 text-fg">{t(`${context}.hero`)}</h2>
          <p className="type-body text-fg-secondary">{t(`${context}.heroNote`)}</p>
        </div>
      </NotchedCard>

      {/* Shell board: three product cards on a four-column grid at desktop, the fourth slot left empty. */}
      <ul className="grid min-w-0 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {products.map((product, index) => (
          <ProductCard key={index} zone={t("product")} title={product.title} note={product.note} />
        ))}
      </ul>

      <div data-zone="utility" className="flex min-w-0 flex-col gap-3 rounded-card border-[1.5px] border-dashed border-outline p-card sm:flex-row sm:items-center sm:gap-4">
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-7 items-center rounded-pill bg-raised px-3 type-label text-fg-secondary">
            {t("utility")}
          </span>
          <span className="inline-flex min-h-7 items-center rounded-pill border border-dashed border-outline px-3 text-xs font-semibold text-fg-secondary">
            {t("badge")}
          </span>
        </span>
        <p className="min-w-0 type-body text-fg">{t(`${context}.utility`)}</p>
      </div>
    </section>
  );
}
