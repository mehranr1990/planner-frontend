"use client";

import { useTranslations } from "next-intl";
import { Calendar } from "@/components/ui/calendar";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDate } from "@/lib/dates/format";
import { SAMPLE_DATE } from "../../samples";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

// Fixed sample days with event dots: 7, 14 and 26 Oct 2026.
const markedDays = new Set([7, 14, 26]);
const hasMarker = (date: Date) => date.getFullYear() === 2026 && date.getMonth() === 9 && markedDays.has(date.getDate());

// Only the next three weeks are selectable in the bare calendar sample.
const MIN = new Date(2026, 9, 13);
const MAX = new Date(2026, 10, 3);

/**
 * Jalali / Gregorian date picker that follows the calendar preference, and
 * the bare month grid. The section is two thirds wide so the two sit side by
 * side where they fit (md, and xl+ next to Toasts): one calendar tall, like
 * its row neighbour, instead of a single column twice as tall.
 */
export function DatePickerSection() {
  const t = useTranslations("Styleguide.components.datePicker");
  const preferences = usePreferences();

  return (
    <StyleguideSection tier="utility" id="date-picker" span="twoThirds" title={t("title")} description={t("description")}>
      <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {/* Remounts when the preference changes, so the picker follows it. */}
        <DatePicker
          key={preferences.calendar}
          today={SAMPLE_DATE}
          defaultValue={SAMPLE_DATE}
          defaultMonth={SAMPLE_DATE}
          hasMarker={hasMarker}
          onConfirm={(date) =>
            toast({
              tone: "success",
              title: t("dateSet"),
              description: formatDate(date, "full", preferences),
            })
          }
        />
        <PreviewFrame label={t("bare")} contentClassName="bg-surface">
          <Calendar
            today={SAMPLE_DATE}
            defaultMonth={SAMPLE_DATE}
            min={MIN}
            max={MAX}
            showOutsideDays
            fixedWeeks
          />
        </PreviewFrame>
      </div>
    </StyleguideSection>
  );
}
