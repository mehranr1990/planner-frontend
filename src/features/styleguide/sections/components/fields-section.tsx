"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePreferences } from "@/features/preferences/use-preferences";
import { parseLocalizedNumber } from "@/lib/locale/digits";
import type { Currency } from "@/lib/locale/money";
import { StateCaption } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";
import { UnitMenu } from "./unit-menu";

/** Text fields in every state (Utility board · Text fields). */
export function FieldsSection() {
  const t = useTranslations("Styleguide.components.fields");
  const tUnits = useTranslations("Styleguide.controls");
  const preferences = usePreferences();
  // Starts invalid on purpose ("O" is not a digit); fixing it clears the error.
  const [amount, setAmount] = useState("12,5OO");
  const [unit, setUnit] = useState<Currency>(preferences.currency);
  const amountError = amount.trim() !== "" && parseLocalizedNumber(amount) === null ? t("amountError") : null;

  return (
    <StyleguideSection tier="utility" id="fields" span="third" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Field>
            <FieldLabel>{t("taskName")}</FieldLabel>
            <Input placeholder={t("taskPlaceholder")} />
          </Field>
          <StateCaption>{t("default")}</StateCaption>
        </div>

        <div className="flex flex-col gap-1.5">
          <Field>
            <FieldLabel>{t("project")}</FieldLabel>
            {/* Static ring so the focus state is visible without focusing. */}
            <Input defaultValue="Website Redesign" className="border-primary focus-ring" />
          </Field>
          <StateCaption>{t("focus")}</StateCaption>
        </div>

        <div className="flex flex-col gap-1.5">
          <Field>
            <FieldLabel hint={tUnits(unit)}>
              {t("amount")}
            </FieldLabel>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              endAdornment={<UnitMenu value={unit} onValueChange={setUnit} />}
            />
            <FieldError>{amountError}</FieldError>
          </Field>
          <StateCaption>{t("invalid")}</StateCaption>
        </div>

        <div className="flex flex-col gap-1.5">
          <Field disabled>
            <FieldLabel>{t("workspace")}</FieldLabel>
            <Input defaultValue="Euroly" />
          </Field>
          <StateCaption>{t("disabled")}</StateCaption>
        </div>

        <div className="flex flex-col gap-1.5">
          <Field readOnly>
            <FieldLabel>{t("reference")}</FieldLabel>
            <Input defaultValue="INV-2041" />
          </Field>
          <StateCaption>{t("readOnly")}</StateCaption>
        </div>

        <div className="flex flex-col gap-1.5">
          <Field>
            <FieldLabel>{t("handle")}</FieldLabel>
            <Input defaultValue="araxitis" loading />
          </Field>
          <StateCaption>{t("loading")}</StateCaption>
        </div>

        <Field>
          <FieldLabel marker="optional">{t("notes")}</FieldLabel>
          <Textarea placeholder={t("notesPlaceholder")} />
        </Field>
      </div>
    </StyleguideSection>
  );
}
