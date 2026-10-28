"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { PillGroup } from "@/components/ui/pills";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { UtilityField } from "@/design-system/surfaces/utility-card";
import {
  cyclesBeforeLongBreakOptions,
  focusMinuteOptions,
  longBreakMinuteOptions,
  shortBreakMinuteOptions,
} from "@/features/planner-settings/planner-settings";
import { usePlannerSettingsActions } from "@/features/planner-settings/use-planner-settings";
import type { FocusConfig } from "./domain/timer";
import { useFocusFormat } from "./use-focus-format";

/*
 * Focus settings (sheet): the same values as Settings › Focus. A change
 * applies to this session at once; "Save as default?" writes it back.
 */

type Field = "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "cyclesBeforeLongBreak";

const fields: readonly { key: Field; label: "focus" | "short" | "long" | "cycles"; options: readonly number[] }[] = [
  { key: "focusMinutes", label: "focus", options: focusMinuteOptions },
  { key: "shortBreakMinutes", label: "short", options: shortBreakMinuteOptions },
  { key: "longBreakMinutes", label: "long", options: longBreakMinuteOptions },
  { key: "cyclesBeforeLongBreak", label: "cycles", options: cyclesBeforeLongBreakOptions },
];

export function FocusSettingsSheet({ config, onChange }: { config: FocusConfig; onChange: (config: FocusConfig) => void }) {
  const t = useTranslations("Focus");
  const format = useFocusFormat();
  const { update } = usePlannerSettingsActions();
  const [state, setState] = useState<"clean" | "dirty" | "saved">("clean");

  const saveDefault = () => {
    update({
      focus: {
        focusMinutes: config.focusMinutes as (typeof focusMinuteOptions)[number],
        shortBreakMinutes: config.shortBreakMinutes as (typeof shortBreakMinuteOptions)[number],
        longBreakMinutes: config.longBreakMinutes as (typeof longBreakMinuteOptions)[number],
        cyclesBeforeLongBreak: config.cyclesBeforeLongBreak as (typeof cyclesBeforeLongBreakOptions)[number],
      },
    });
    setState("saved");
  };

  return (
    <Sheet onOpenChange={(open) => open && setState("clean")}>
      <SheetTrigger asChild>
        <IconButton icon={Settings} label={t("settings")} variant="secondary" className="bg-surface shadow-island" />
      </SheetTrigger>
      <SheetContent title={t("settings")} description={t("settingsSheet.description")} mobileSide="bottom">
        <div className="flex flex-col gap-3">
          {fields.map((field) => (
            <UtilityField key={field.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t(`settingsSheet.${field.label}`)}</span>
              <PillGroup
                label={t(`settingsSheet.${field.label}`)}
                value={String(config[field.key])}
                onValueChange={(value) => {
                  onChange({ ...config, [field.key]: Number(value) });
                  setState("dirty");
                }}
                options={field.options.map((option) => ({
                  value: String(option),
                  label: format.digits(option),
                  ariaLabel: field.key === "cyclesBeforeLongBreak" ? undefined : t("settingsSheet.minutes", { value: format.digits(option) }),
                }))}
              />
            </UtilityField>
          ))}
          <div role="status" className="flex min-h-10 flex-wrap items-center gap-3">
            {state === "dirty" ? (
              <>
                <span className="text-sm text-fg-secondary">{t("settingsSheet.saveDefault")}</span>
                <Button size="sm" variant="secondary" onClick={saveDefault}>
                  {t("settingsSheet.saveDefaultAction")}
                </Button>
              </>
            ) : state === "saved" ? (
              <span className="text-sm text-fg-secondary">{t("settingsSheet.savedDefault")}</span>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
