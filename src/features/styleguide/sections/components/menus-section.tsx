"use client";

import { ChevronDown, Copy, Download, Info, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { DemoGroup } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const sortOptions = ["due", "priority", "created"] as const;
type Sort = (typeof sortOptions)[number];

function isSort(value: string): value is Sort {
  return (sortOptions as readonly string[]).includes(value);
}

/** Dropdown menu (radio, checkbox, shortcut, coming-soon, destructive) and a popover. */
export function MenusSection() {
  const t = useTranslations("Styleguide.components.menus");
  const [sort, setSort] = useState<Sort>("due");
  const [showWeekends, setShowWeekends] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <StyleguideSection tier="utility" id="menus" span="twoThirds" title={t("title")} description={t("description")}>
      <div className="grid gap-6 sm:grid-cols-2">
        <DemoGroup title={t("menu")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="self-start">
                {t("viewOptions")}
                <Icon icon={ChevronDown} size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{t("sortBy")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => {
                  if (isSort(value)) setSort(value);
                }}
              >
                {sortOptions.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {t(`sort.${option}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("show")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showWeekends} onCheckedChange={setShowWeekends}>
                {t("weekends")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showCompleted} onCheckedChange={setShowCompleted}>
                {t("completed")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Copy} shortcut="⌘D" onSelect={() => toast({ tone: "neutral", title: t("duplicated") })}>
                {t("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem icon={Download} comingSoon>
                {t("export")}
              </DropdownMenuItem>
              <DropdownMenuItem icon={Trash2} tone="destructive" onSelect={() => toast({ tone: "danger", title: t("deleteSample") })}>
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="type-caption text-fg-muted" aria-live="polite">
            {t("current", {
              sort: t(`sort.${sort}`),
              weekends: showWeekends ? t("on") : t("off"),
              completed: showCompleted ? t("on") : t("off"),
            })}
          </p>
        </DemoGroup>

        <DemoGroup title={t("popover")}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" className="self-start">
                <Icon icon={Info} size={18} />
                {t("energy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="flex w-72 flex-col gap-3">
              <p className="text-sm font-bold">{t("energyTitle")}</p>
              <p className="type-caption text-fg-secondary">{t("energyBody")}</p>
              <PopoverClose asChild>
                <Button size="sm" variant="secondary" className="self-end">
                  {t("gotIt")}
                </Button>
              </PopoverClose>
            </PopoverContent>
          </Popover>
        </DemoGroup>
      </div>
    </StyleguideSection>
  );
}
