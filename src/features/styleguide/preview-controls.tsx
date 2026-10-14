"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import { useIsClient } from "@/hooks/use-is-client";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";

type ThemeChoice = "light" | "dark" | "system";

function isThemeChoice(value: string | undefined): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span aria-hidden className="type-caption ps-3 text-fg-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Theme · direction · language · digits · currency, as one floating panel. */
export function PreviewControls() {
  const t = useTranslations("Styleguide.controls");
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();
  const preferences = usePreferences();
  const { update, setLocale } = usePreferenceActions();
  const themeValue: ThemeChoice = isClient && isThemeChoice(theme) ? theme : "system";

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card bg-surface p-2 shadow-island xl:rounded-pill"
    >
      <ControlGroup label={t("theme")}>
        <Segmented
          label={t("theme")}
          value={themeValue}
          onValueChange={setTheme}
          options={[
            { value: "light", label: t("light") },
            { value: "dark", label: t("dark") },
            { value: "system", label: t("system") },
          ]}
        />
      </ControlGroup>

      <ControlGroup label={t("direction")}>
        <Segmented
          label={t("direction")}
          value={preferences.direction}
          onValueChange={(direction) => update({ direction })}
          options={[
            { value: "ltr", label: "LTR" },
            { value: "rtl", label: "RTL" },
          ]}
        />
      </ControlGroup>

      <ControlGroup label={t("language")}>
        <Segmented
          label={t("language")}
          value={preferences.locale}
          onValueChange={setLocale}
          options={[
            { value: "en", label: "EN", ariaLabel: "English", lang: "en" },
            { value: "fa", label: "FA", ariaLabel: "فارسی", lang: "fa" },
          ]}
        />
      </ControlGroup>

      <ControlGroup label={t("digits")}>
        <Segmented
          label={t("digits")}
          value={preferences.digits}
          onValueChange={(digits) => update({ digits })}
          options={[
            { value: "latn", label: "123", ariaLabel: t("latinDigits") },
            { value: "fa", label: "۱۲۳", ariaLabel: t("persianDigits"), lang: "fa" },
          ]}
        />
      </ControlGroup>

      <ControlGroup label={t("currency")}>
        <Segmented
          label={t("currency")}
          value={preferences.currency}
          onValueChange={(currency) => update({ currency })}
          options={[
            { value: "toman", label: t("toman") },
            { value: "rial", label: t("rial") },
          ]}
        />
      </ControlGroup>
    </div>
  );
}
