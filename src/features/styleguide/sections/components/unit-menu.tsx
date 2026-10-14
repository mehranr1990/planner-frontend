"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { Currency } from "@/lib/locale/money";

function isCurrency(value: string): value is Currency {
  return value === "toman" || value === "rial";
}

interface UnitMenuProps {
  value: Currency;
  onValueChange: (value: Currency) => void;
}

/** The "Toman ▾" unit control that sits inside the amount field (Utility board). */
export function UnitMenu({ value, onValueChange }: UnitMenuProps) {
  const t = useTranslations("Styleguide");
  const label = t(`controls.${value}`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("components.fields.unit", { unit: label })}
        className="relative inline-flex h-9 items-center gap-1 rounded-pill bg-surface px-3 text-xs font-bold text-fg transition-colors after:absolute after:-inset-1.5 hover:bg-subtle"
      >
        {label}
        <Icon icon={ChevronDown} size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (isCurrency(next)) onValueChange(next);
          }}
        >
          <DropdownMenuRadioItem value="toman">{t("controls.toman")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="rial">{t("controls.rial")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
