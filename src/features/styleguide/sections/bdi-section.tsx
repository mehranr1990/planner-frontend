"use client";

import { useTranslations } from "next-intl";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { convertDigits } from "@/lib/locale/digits";
import { Bdi } from "@/lib/locale/bdi";
import { StyleguideSection } from "../styleguide-section";

function Example({ label, tone, children }: { label: string; tone: "danger" | "success"; children: React.ReactNode }) {
  return (
    <figure
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-tile p-4",
        tone === "danger" ? "bg-danger-soft" : "bg-success-soft",
      )}
    >
      <figcaption
        dir="ltr"
        className={cn("text-xs font-semibold", tone === "danger" ? "text-danger-text" : "text-success-text")}
      >
        {label}
      </figcaption>
      {children}
    </figure>
  );
}

export function BdiSection() {
  const t = useTranslations("Styleguide.bdi");
  const { digits } = usePreferences();
  const tag = "<bdi>";

  return (
    <StyleguideSection id="bdi" span="half" title={t("title")} description={t("description", { tag })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Example label={t("without")} tone="danger">
          <p lang="fa" dir="rtl" className="type-body font-semibold">
            جلسه با Katy (Design) 2:30 امروز
          </p>
        </Example>
        <Example label={t("with", { tag })} tone="success">
          <p lang="fa" dir="rtl" className="type-body font-semibold">
            جلسه با <Bdi lang="en">Katy (Design)</Bdi> ساعت <Bdi>{convertDigits("14:30", digits)}</Bdi> امروز
          </p>
        </Example>
      </div>
      <p lang="en" dir="ltr" className="rounded-tile bg-subtle p-4 text-sm font-medium">
        Review with <Bdi lang="fa">نیلا</Bdi> (Design): 3 tasks left.
      </p>
    </StyleguideSection>
  );
}
