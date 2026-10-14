"use client";

import { useTranslations } from "next-intl";
import { scopes, scopeTokens } from "@/design-system/tokens/colors";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

function Tile({ eyebrow, name, token, className }: { eyebrow: string; name: string; token: string; className: string }) {
  return (
    <div className={cn("flex min-h-32 flex-col justify-between rounded-tile p-4 text-on-volt", className)}>
      <span className="type-label">{eyebrow}</span>
      <span>
        <span lang="en" className="type-title block">
          {name}
        </span>
        <code dir="ltr" className="text-xs font-semibold">
          {token}
        </code>
      </span>
    </div>
  );
}

export function SweepSection() {
  const t = useTranslations("Styleguide.sweep");
  const tc = useTranslations("Styleguide.context");

  return (
    <StyleguideSection id="sweep" title={t("title")} description={t("description")}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 flex flex-col gap-2 md:col-span-1">
          <Tile eyebrow={t("now")} name="Volt" token="--volt" className="bg-volt" />
          <p className="type-caption text-fg-muted">{t("voltUsage")}</p>
        </div>
        {scopes.map((scope) => {
          const token = scopeTokens[scope];
          return (
            <div key={scope} className="flex min-w-0 flex-col gap-2">
              <Tile eyebrow={tc(scope)} name={token.hue} token={`--${scope}-dot`} className={token.dot} />
              <div className={cn("flex items-center justify-between gap-2 rounded-row px-3 py-2", token.soft, token.text)}>
                <span className="text-lg font-semibold">Aa</span>
                <code dir="ltr" className="truncate text-[0.6875rem] font-semibold">
                  soft · deep
                </code>
              </div>
              <p lang="en" className="type-caption text-fg-muted">
                {token.usage}
              </p>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex h-2 overflow-hidden rounded-pill">
        <span className="flex-1 bg-volt" />
        {scopes.map((scope) => (
          <span key={scope} className={cn("flex-1", scopeTokens[scope].dot)} />
        ))}
      </div>
    </StyleguideSection>
  );
}
