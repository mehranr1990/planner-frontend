"use client";

import { CalendarDays, CheckCircle2, Link2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { AvatarGroup } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { Surface } from "@/design-system/surfaces/surface";
import { usePreferences } from "@/features/preferences/use-preferences";
import { convertDigits } from "@/lib/locale/digits";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const people = [
  { name: "Katy Fischer", initials: "KF", tone: "project" },
  { name: "Jonathan Kelly", initials: "JK", tone: "personal" },
  { name: "Sara Park", initials: "SP", tone: "team" },
  { name: "Ali Rezaei" },
  { name: "Nila Ahmadi" },
] as const;

/**
 * PRODUCT card: a plain sculpted card with no notch (Rationale: "Plain
 * sculpted card, scope tint as cue"). Anatomy from the Rationale board:
 * tag row → title → meta → footer (people · progress · counts). Mirrors the
 * Cards board's "Revamp Sidebar" task card.
 */
export function ProductCardSection() {
  const t = useTranslations("Styleguide.components.productCard");
  const { digits } = usePreferences();
  const n = (value: string | number) => convertDigits(String(value), digits);

  return (
    <StyleguideSection id="product-card" span="half" tier="product" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("caption")} contentClassName="p-4 sm:p-6">
        <Surface asChild radius="card" padding="md" className="flex max-w-md flex-col gap-4">
          <article aria-label={t("label")}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="danger">{t("urgent")}</StatusChip>
              <span className="inline-flex min-h-7 items-center gap-1.5 rounded-pill border border-outline px-3 text-xs font-semibold text-fg-secondary">
                <Icon icon={CalendarDays} size={14} />
                {t("due")}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-project-deep">
                <span aria-hidden className="size-1.5 rounded-full bg-project-dot" />
                Planner App
              </span>
              <h3 className="type-title">{t("cardTitle")}</h3>
              <p className="type-body text-fg-secondary">{t("cardBody")}</p>
            </div>
            <AvatarGroup people={people} max={3} />
            <div className="flex items-center gap-4 border-t border-line pt-3 text-sm font-semibold text-fg-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Icon icon={MessageSquare} size={16} label={t("comments")} />
                <span className="tabular">{n(10)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon icon={Link2} size={16} label={t("links")} />
                <span className="tabular">{n(2)}</span>
              </span>
              <span className="ms-auto inline-flex items-center gap-1.5">
                <Icon icon={CheckCircle2} size={16} label={t("subtasks")} />
                <span className="tabular">{n("0/2")}</span>
              </span>
            </div>
          </article>
        </Surface>
      </PreviewFrame>
    </StyleguideSection>
  );
}
