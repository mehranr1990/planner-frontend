"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/*
 * Design-system tiers. SIGNATURE / PRODUCT / UTILITY are the three card
 * levels of P00CardsTabs; SPECIALIZED VISUALIZATION marks patterns that exist
 * only where a final board draws them (Today ring, Habit RingCard, DataViz).
 */
export const tiers = ["utility", "product", "signature", "specialized"] as const;

export type Tier = (typeof tiers)[number];

const tierClass: Record<Tier, string> = {
  utility: "bg-hairline text-fg-secondary",
  product: "border border-outline text-fg-secondary",
  signature: "bg-scope-soft text-scope-deep",
  specialized: "border border-dashed border-outline text-fg-secondary",
};

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const t = useTranslations("Styleguide.tiers");
  return (
    <span
      data-tier={tier}
      className={cn("inline-flex min-h-6 items-center rounded-pill px-2.5 type-label text-[0.6875rem]", tierClass[tier], className)}
    >
      {t(`${tier}.name`)}
    </span>
  );
}
