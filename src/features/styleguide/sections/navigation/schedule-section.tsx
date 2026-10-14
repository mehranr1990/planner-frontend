"use client";

import { useTranslations } from "next-intl";
import { ScheduleIsland } from "@/components/shell/schedule-island";
import { useSampleShellData } from "../../use-sample-shell-data";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/** The top-bar schedule island with the sample day (now = 14:35). */
export function ScheduleSection() {
  const t = useTranslations("Styleguide.navigationPage.schedule");
  const { schedule } = useSampleShellData();
  return (
    <StyleguideSection tier="signature" id="schedule" span="twoThirds" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("wide")}>
        <ScheduleIsland date={schedule.date} now={schedule.now} blocks={schedule.blocks} />
      </PreviewFrame>
      <PreviewFrame label={t("narrow")} contentClassName="flex">
        <div className="w-full max-w-sm">
          <ScheduleIsland
            date={schedule.date}
            now={schedule.now}
            blocks={schedule.blocks}
            label={t("narrowLabel")}
          />
        </div>
      </PreviewFrame>
    </StyleguideSection>
  );
}
