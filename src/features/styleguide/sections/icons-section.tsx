"use client";

import {
  ArrowRight,
  ChartLine,
  Check,
  ChevronRight,
  Clock,
  ListIndentIncrease,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  SendHorizontal,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { StyleguideSection } from "../styleguide-section";

type IconKey = "next" | "back" | "undo" | "send" | "indent" | "panel" | "play" | "clock" | "check" | "search" | "add" | "chart";

const MIRRORED: readonly [IconKey, LucideIcon][] = [
  ["next", ChevronRight],
  ["back", ArrowRight],
  ["undo", Undo2],
  ["send", SendHorizontal],
  ["indent", ListIndentIncrease],
  ["panel", PanelLeftClose],
];

const KEPT: readonly [IconKey, LucideIcon][] = [
  ["play", Play],
  ["clock", Clock],
  ["check", Check],
  ["search", Search],
  ["add", Plus],
  ["chart", ChartLine],
];

function IconList({ heading, items, mirror }: { heading: string; items: readonly [IconKey, LucideIcon][]; mirror: boolean }) {
  const t = useTranslations("Styleguide.icons");
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className={mirror ? "text-sm font-semibold text-success-text" : "text-sm font-semibold text-danger-text"}>
        {heading}
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map(([key, glyph]) => (
          <li key={key} className="flex min-h-touch items-center gap-3 rounded-row bg-subtle px-2 py-1.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface text-fg">
              <Icon icon={glyph} mirror={mirror} size={18} />
            </span>
            <span className="text-sm font-medium">{t(key)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IconsSection() {
  const t = useTranslations("Styleguide.icons");
  return (
    <StyleguideSection id="icons" span="half" title={t("title")} description={t("description")}>
      <div className="grid gap-6 sm:grid-cols-2">
        <IconList heading={t("mirror")} items={MIRRORED} mirror />
        <IconList heading={t("keep")} items={KEPT} mirror={false} />
      </div>
      <p className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2.5 text-sm font-medium">
        <span className="flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5">
          <Icon icon={Search} size={16} />
          <kbd className="text-xs font-semibold">⌘K</kbd>
        </span>
        {t("shortcut")}
      </p>
    </StyleguideSection>
  );
}
