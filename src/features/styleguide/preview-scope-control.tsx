"use client";

import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import { scopes, type Scope } from "@/design-system/tokens/colors";

interface PreviewScopeControlProps {
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  /** Explains what the switch retints on this page. */
  description: string;
}

/** Page-level context switch: retints every preview below through data-scope. */
export function PreviewScopeControl({ scope, onScopeChange, description }: PreviewScopeControlProps) {
  const t = useTranslations("Styleguide");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-surface p-2 ps-4 xl:rounded-pill">
      <span aria-hidden className="type-caption font-semibold text-fg-secondary">
        {t("preview.scope")}
      </span>
      <Segmented
        label={t("preview.scope")}
        variant="neutral"
        value={scope}
        onValueChange={onScopeChange}
        options={scopes.map((value) => ({ value, label: t(`context.${value}`) }))}
      />
      <p className="type-caption min-w-0 flex-1 basis-60 text-fg-muted">{description}</p>
    </div>
  );
}
