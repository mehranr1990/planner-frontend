"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { repeatOptions } from "../../component-samples";
import { StyleguideSection } from "../../styleguide-section";

type Repeat = (typeof repeatOptions)[number];

function isRepeat(value: string): value is Repeat {
  return (repeatOptions as readonly string[]).includes(value);
}

/** Radio group with descriptions (Utility board · Repeat). */
export function ChoicesSection() {
  const t = useTranslations("Styleguide.components.choices");
  const [repeat, setRepeat] = useState<Repeat>("workweek");

  return (
    <StyleguideSection tier="utility" id="choices" span="third" title={t("title")} description={t("description")}>
      <Field>
        <FieldLabel>{t("repeat")}</FieldLabel>
        <RadioGroup
          value={repeat}
          onValueChange={(value) => {
            if (isRepeat(value)) setRepeat(value);
          }}
        >
          {repeatOptions.map((option) => (
            <RadioGroupItem
              key={option}
              value={option}
              label={t(`options.${option}.label`)}
              description={t(`options.${option}.description`)}
            />
          ))}
        </RadioGroup>
      </Field>
      <p className="rounded-row bg-subtle px-3.5 py-3 type-caption text-fg-secondary" aria-live="polite">
        <span className="font-bold text-fg">{t("summary")}</span> · {t(`options.${repeat}.label`)}
      </p>
    </StyleguideSection>
  );
}
