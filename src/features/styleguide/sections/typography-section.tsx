"use client";

import { useTranslations } from "next-intl";
import { typeScale, type TypeStyle } from "@/design-system/tokens/typography";
import { usePreferences } from "@/features/preferences/use-preferences";
import { convertDigits } from "@/lib/locale/digits";
import { StyleguideSection } from "../styleguide-section";

const LATIN_SAMPLES: Record<TypeStyle, string> = {
  display: "20:10",
  h1: "Dashboard",
  title: "Revamp Sidebar",
  body: "Body copy for descriptions and longer notes.",
  caption: "Personal · 35 min left",
  label: "Section label",
};

function persianSamples(minutes: string): Record<TypeStyle, string> {
  return {
    display: "برنامه‌ی امروز",
    h1: "نمای کلی پروژه",
    title: "کارهای در حال انجام",
    body: "این هفته سه ساعت زمان آزاد داری که می‌شود برای مرور هزینه‌ها گذاشت.",
    caption: `شخصی · ${minutes} دقیقه مانده`,
    label: "برچسب بخش",
  };
}

function ScaleColumn({
  heading,
  lang,
  samples,
  spec,
}: {
  heading: string;
  lang: "en" | "fa";
  samples: Record<TypeStyle, string>;
  spec: (style: TypeStyle) => string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <h3 className="type-label mb-2 text-fg-muted">{heading}</h3>
      <ul lang={lang} dir={lang === "fa" ? "rtl" : "ltr"} className="flex flex-col divide-y divide-line">
        {typeScale.map((token) => (
          <li key={token.style} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <span className={`${token.className} min-w-0 break-words`}>{samples[token.style]}</span>
            <code lang="en" dir="ltr" className="text-xs text-fg-muted">
              {spec(token.style)}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TypographySection() {
  const t = useTranslations("Styleguide.typography");
  const { digits } = usePreferences();
  const specFor = (style: TypeStyle, field: "latin" | "persian") =>
    typeScale.find((token) => token.style === style)?.[field] ?? "";

  return (
    <StyleguideSection id="typography" title={t("title")} description={t("description")}>
      <div className="grid gap-8 lg:grid-cols-2">
        <ScaleColumn heading={t("latin")} lang="en" samples={LATIN_SAMPLES} spec={(style) => specFor(style, "latin")} />
        <ScaleColumn
          heading={t("persian")}
          lang="fa"
          samples={persianSamples(convertDigits(35, digits))}
          spec={(style) => specFor(style, "persian")}
        />
      </div>
    </StyleguideSection>
  );
}
