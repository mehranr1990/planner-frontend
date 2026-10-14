"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { FormErrorSummary, fieldErrorsToSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber, parseLocalizedNumber } from "@/lib/locale/digits";
import { SAMPLE_LATENCY_MS, priorityOptions, wait } from "../../component-samples";
import { StyleguideSection } from "../../styleguide-section";

interface SampleFormValues {
  title: string;
  amount: string;
  priority: string;
  notes: string;
}

const EMPTY: SampleFormValues = { title: "", amount: "", priority: "", notes: "" };
const NOTES_MAX = 140;
const fieldId = (name: string) => `sg-form-${name}`;

/** React Hook Form + Zod: Field family, error summary and a busy submit. */
export function FormSection() {
  const t = useTranslations("Styleguide.components.form");
  const { digits } = usePreferences();

  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(3, t("errors.title")),
        amount: z
          .string()
          .trim()
          .min(1, t("errors.amountRequired"))
          .refine((value) => (parseLocalizedNumber(value) ?? 0) > 0, t("errors.amount")),
        priority: z.string().min(1, t("errors.priority")),
        notes: z.string().max(NOTES_MAX, t("errors.notes")),
      }),
    [t],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<SampleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
    // FormErrorSummary takes focus after a failed submit (focusKey) and links to
    // each field; RHF's own focus on the first invalid field would steal it.
    shouldFocusError: false,
  });

  const onSubmit = async (values: SampleFormValues) => {
    await wait(SAMPLE_LATENCY_MS);
    toast({ tone: "success", title: t("saved"), description: values.title });
    reset(EMPTY);
  };

  return (
    <StyleguideSection tier="utility" id="form" span="twoThirds" title={t("title")} description={t("description")}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-label={t("formLabel")}>
        <FormErrorSummary errors={fieldErrorsToSummary(errors, fieldId)} focusKey={submitCount} />

        <Field controlId={fieldId("title")} required invalid={Boolean(errors.title)}>
          <FieldLabel>{t("fields.title")}</FieldLabel>
          <Input placeholder={t("placeholders.title")} autoComplete="off" {...register("title")} />
          <FieldError>{errors.title?.message}</FieldError>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field controlId={fieldId("amount")} required invalid={Boolean(errors.amount)}>
            <FieldLabel>{t("fields.amount")}</FieldLabel>
            <Input inputMode="decimal" placeholder={t("placeholders.amount")} autoComplete="off" {...register("amount")} />
            <FieldError>{errors.amount?.message}</FieldError>
          </Field>

          <Field controlId={fieldId("priority")} required invalid={Boolean(errors.priority)}>
            <FieldLabel>{t("fields.priority")}</FieldLabel>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select
                  ref={field.ref}
                  name={field.name}
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                >
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} dotClassName={option.dot}>
                      {t(`priorities.${option.value}`)}
                    </SelectItem>
                  ))}
                </Select>
              )}
            />
            <FieldError>{errors.priority?.message}</FieldError>
          </Field>
        </div>

        <Field controlId={fieldId("notes")} invalid={Boolean(errors.notes)}>
          <FieldLabel marker="optional">{t("fields.notes")}</FieldLabel>
          <Textarea rows={2} {...register("notes")} />
          <FieldDescription>{t("notesHint", { max: formatNumber(NOTES_MAX, digits) })}</FieldDescription>
          <FieldError>{errors.notes?.message}</FieldError>
        </Field>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => reset(EMPTY)} disabled={isSubmitting}>
            {t("reset")}
          </Button>
          <Button type="submit" loading={isSubmitting} loadingText={t("saving")}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </StyleguideSection>
  );
}
