"use client";

import { Bell, Settings } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

export function FocusSection() {
  const t = useTranslations("Styleguide.focus");
  const tc = useTranslations("Styleguide.context");

  return (
    <StyleguideSection id="focus" span="half" title={t("title")} description={t("description")}>
      <div className="flex flex-wrap items-center gap-3">
        <Button>{tc("primary")}</Button>
        <Button variant="secondary">{tc("secondary")}</Button>
        <Button variant="outline">{tc("outline")}</Button>
        <Tooltip content={t("notifications")}>
          <Button variant="secondary" size="icon" aria-label={t("notifications")}>
            <Icon icon={Bell} />
          </Button>
        </Tooltip>
        <Tooltip content={t("settings")}>
          <Button variant="ghost" size="icon" aria-label={t("settings")}>
            <Icon icon={Settings} />
          </Button>
        </Tooltip>
        <Link
          href="/"
          className="inline-flex min-h-touch items-center rounded-row px-2 font-semibold text-scope-deep underline decoration-2 underline-offset-4"
        >
          {t("link")}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-tile bg-subtle p-4">
        {/* Static, non-interactive preview of the ring for screenshots and review. */}
        <span aria-hidden className={cn(buttonVariants({ variant: "primary" }), "focus-ring")}>
          {tc("primary")}
        </span>
        <span aria-hidden className={cn(buttonVariants({ variant: "outline" }), "focus-ring")}>
          {tc("outline")}
        </span>
        <span className="type-caption text-fg-muted">{t("forced")}</span>
      </div>
    </StyleguideSection>
  );
}
