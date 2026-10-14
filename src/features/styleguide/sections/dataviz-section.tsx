"use client";

import { useTranslations } from "next-intl";
import {
  deepCardTokens,
  vizCategoryTokens,
  vizSeriesTokens,
  type ColorToken,
  type VizToken,
} from "@/design-system/tokens/colors";
import { useCssVariable } from "@/hooks/use-css-variable";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

type VizName =
  | "housing"
  | "food"
  | "transport"
  | "lifestyle"
  | "work"
  | "health"
  | "other"
  | "mood"
  | "energy"
  | "focus";

/** "--viz-housing" → "housing", the message key of the swatch name. */
const vizKey = (token: VizToken) => token.cssVar.replace("--viz-", "") as VizName;

function TokenValue({ cssVar }: { cssVar: `--${string}` }) {
  const value = useCssVariable(cssVar);
  return (
    <span dir="ltr" className="text-end text-xs">
      <code className="block font-semibold text-fg-secondary">{cssVar}</code>
      <code className="tabular block uppercase text-fg-muted">{value || "—"}</code>
    </span>
  );
}

function DeepCardRow({ token }: { token: ColorToken }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-row bg-subtle px-3 py-2">
      <span aria-hidden className={cn("size-9 rounded-row border border-hairline", token.swatch)} />
      <span className="min-w-0">
        <span lang="en" className="block text-sm font-semibold">
          {token.name}
        </span>
        <span lang="en" className="block truncate text-xs text-fg-muted">
          {token.role}
        </span>
      </span>
      <TokenValue cssVar={token.cssVar} />
    </li>
  );
}

/** The name is always visible next to the swatch: colour is never the only cue. */
function VizRow({ token, name }: { token: VizToken; name: string }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-row bg-subtle px-3 py-2">
      <span aria-hidden className={cn("size-9 rounded-row", token.swatch)} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{name}</span>
        <span lang="en" className="block truncate text-xs text-fg-muted">
          {token.hue}
        </span>
      </span>
      <TokenValue cssVar={token.cssVar} />
    </li>
  );
}

export function DatavizSection() {
  const t = useTranslations("Styleguide.dataviz");
  return (
    <StyleguideSection id="dataviz" title={t("title")} description={t("description")}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-3">
          <h3 className="type-label text-fg-muted">{t("deepCard")}</h3>
          <div className="flex flex-col gap-2 rounded-signature bg-deep-card p-6">
            <p className="text-lg font-semibold text-on-deep-card">{t("deepCardTitle")}</p>
            <p className="text-sm text-on-deep-card-muted">{t("deepCardBody")}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {deepCardTokens.map((token) => (
              <DeepCardRow key={token.cssVar} token={token} />
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h3 className="type-label text-fg-muted">{t("categories")}</h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {vizCategoryTokens.map((token) => (
                <VizRow key={token.cssVar} token={token} name={t(`names.${vizKey(token)}`)} />
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="type-label text-fg-muted">{t("series")}</h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {vizSeriesTokens.map((token) => (
                <VizRow key={token.cssVar} token={token} name={t(`names.${vizKey(token)}`)} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </StyleguideSection>
  );
}
