"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Checkbox, type CheckedState } from "@/components/ui/checkbox";
import { Segmented } from "@/components/ui/segmented";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import { DemoGroup } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const notifyOptions = ["mentions", "dueDates", "comments"] as const;
type NotifyOption = (typeof notifyOptions)[number];
type View = "day" | "week" | "month";

/** Switches, checkboxes (incl. indeterminate + locked), segmented and range. */
export function ControlsSection() {
  const t = useTranslations("Styleguide.components.controls");
  const { digits } = usePreferences();
  const [notify, setNotify] = useState<readonly NotifyOption[]>(["mentions"]);
  const [view, setView] = useState<View>("week");

  const allState: CheckedState =
    notify.length === notifyOptions.length ? true : notify.length === 0 ? false : "indeterminate";

  return (
    <StyleguideSection tier="utility" id="controls" span="third" title={t("title")} description={t("description")}>
      <DemoGroup title={t("switches")}>
        <div className="flex flex-col">
          <Switch label={t("reminders")} defaultChecked />
          <Switch label={t("weeklyEmail")} />
          <Switch label={t("syncContacts")} description={t("adminOnly")} disabled />
        </div>
      </DemoGroup>

      <Separator />

      <DemoGroup title={t("checkboxes")}>
        <div className="flex flex-col">
          <Checkbox label={t("showWeekends")} defaultChecked />
          <Checkbox label={t("hideCompleted")} />
          <Checkbox label={t("locked")} description={t("lockedReason")} locked defaultChecked />
        </div>
        <div className="flex flex-col rounded-tile bg-subtle px-3 py-1">
          <Checkbox
            label={t("notifyAll")}
            checked={allState}
            onCheckedChange={(checked) => setNotify(checked === true ? notifyOptions : [])}
          />
          <div className="flex flex-col ps-8">
            {notifyOptions.map((option) => (
              <Checkbox
                key={option}
                label={t(`notify.${option}`)}
                checked={notify.includes(option)}
                onCheckedChange={(checked) =>
                  setNotify((current) =>
                    checked === true
                      ? notifyOptions.filter((item) => item === option || current.includes(item))
                      : current.filter((item) => item !== option),
                  )
                }
              />
            ))}
          </div>
        </div>
      </DemoGroup>

      <Separator />

      <DemoGroup title={t("segmented")}>
        <Segmented<View>
          label={t("segmented")}
          variant="neutral"
          value={view}
          onValueChange={setView}
          className="w-full *:flex-1"
          options={[
            { value: "day", label: t("day") },
            { value: "week", label: t("week") },
            { value: "month", label: t("month") },
          ]}
        />
      </DemoGroup>

      <Slider
        label={t("capacity")}
        defaultValue={8}
        min={1}
        max={12}
        formatValue={(value) => t("hours", { value: formatNumber(value, digits) })}
      />
    </StyleguideSection>
  );
}
