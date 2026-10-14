"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { scopes, scopeTokens, type Scope } from "@/design-system/tokens/colors";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

interface ContextSectionProps {
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
}

export function ContextSection({ scope, onScopeChange }: ContextSectionProps) {
  const t = useTranslations("Styleguide.context");

  return (
    <StyleguideSection
      id="context"
      title={t("title")}
      description={t("description")}
      action={
        <Segmented
          label={t("active")}
          variant="neutral"
          value={scope}
          onValueChange={onScopeChange}
          options={scopes.map((value) => ({ value, label: t(value) }))}
        />
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {scopes.map((value) => {
          const token = scopeTokens[value];
          return (
            <div
              key={value}
              className={cn("flex flex-col gap-3 rounded-tile p-4", token.soft)}
              aria-current={value === scope ? "true" : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-semibold", token.text)}>{t(value)}</span>
                {value === scope ? (
                  <span className={cn("rounded-pill px-2 py-0.5 text-xs font-semibold text-on-accent", token.deep)}>
                    {t("active")}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("flex h-9 flex-1 items-center justify-center rounded-pill text-xs font-semibold text-on-accent", token.deep)}>
                  accent
                </span>
                <span aria-hidden className={cn("size-9 rounded-pill", token.dot)} />
              </div>
              <code dir="ltr" className={cn("text-[0.6875rem] font-semibold", token.text)}>
                --{value}-soft · -deep · -dot
              </code>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-tile bg-subtle p-3">
        <Button>
          <Icon icon={Plus} size={18} />
          {t("primary")}
        </Button>
        <Button variant="secondary">{t("secondary")}</Button>
        <Button variant="outline">{t("outline")}</Button>
        <Button variant="destructive">
          <Icon icon={Trash2} size={18} />
          {t("destructive")}
        </Button>
      </div>
    </StyleguideSection>
  );
}
