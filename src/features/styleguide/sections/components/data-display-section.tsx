"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import { samplePeople, scrollRowCount } from "../../component-samples";
import { DemoGroup } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const rows = Array.from({ length: scrollRowCount }, (_, index) => index + 1);

/** Badges, avatars, separators and a scroll area. */
export function DataDisplaySection() {
  const t = useTranslations("Styleguide.components.dataDisplay");
  const { digits } = usePreferences();
  const badgeId = useId();

  return (
    <StyleguideSection tier="utility" id="data-display" span="half" title={t("title")} description={t("description")}>
      <DemoGroup title={t("badges")}>
        <div className="flex flex-wrap items-center gap-4">
          <span className="relative inline-flex">
            <IconButton icon={Bell} label={t("notifications")} aria-describedby={badgeId} />
            <Badge id={badgeId} count={3} label={t("unread", { count: 3, formatted: formatNumber(3, digits) })} placement="corner" />
          </span>
          <Badge count={12} tone="primary" label={t("unread", { count: 12, formatted: formatNumber(12, digits) })} />
          <Badge count={240} tone="neutral" label={t("unread", { count: 240, formatted: formatNumber(240, digits) })} />
          <Badge dot label={t("newActivity")} />
        </div>
      </DemoGroup>

      <DemoGroup title={t("avatars")}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name="Jane Doe" initials="JD" tone="company" size={48} />
          <Avatar name="Peter Thomas" tone="project" size={40} />
          <Avatar name="Mehran Raeeszade" tone="personal" size={32} />
          <Avatar name="مهران" tone="team" size={40} />
          <Separator orientation="vertical" className="mx-1 h-8 self-center" />
          <AvatarGroup people={samplePeople} max={3} />
        </div>
      </DemoGroup>

      <DemoGroup title={t("separator")}>
        <div className="flex flex-col gap-3 rounded-tile bg-subtle p-4 text-sm">
          <span>{t("above")}</span>
          <Separator />
          <div className="flex h-6 items-center gap-3">
            <span>{t("first")}</span>
            <Separator orientation="vertical" />
            <span>{t("second")}</span>
          </div>
        </div>
      </DemoGroup>

      <DemoGroup title={t("scrollArea")}>
        <ScrollArea type="auto" className="h-44 rounded-tile bg-subtle">
          <ul tabIndex={0} aria-label={t("scrollArea")} className="flex flex-col gap-1 rounded-tile p-2 pe-4">
            {rows.map((row) => (
              <li key={row} className="flex min-h-10 items-center rounded-row bg-surface px-3 text-sm">
                <span>{t("row", { number: formatNumber(row, digits) })}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </DemoGroup>
    </StyleguideSection>
  );
}
