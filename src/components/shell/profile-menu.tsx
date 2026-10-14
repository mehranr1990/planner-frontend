"use client";

import {
  ArrowLeftRight,
  CalendarDays,
  Coins,
  Hash,
  Languages,
  Palette,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePreferenceActions, usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { useShell } from "./shell-provider";
import { useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * Avatar → account menu (Shell board profile popover). Each display
 * preference is a submenu with a radio group (role=menuitemradio +
 * aria-checked), the current value shown on its row. Language and direction
 * are separate settings: choosing a language applies its usual direction,
 * digits and calendar as defaults, and each stays overridable on its own.
 *
 * Non-modal (modal={false}): a modal Radix menu aria-hides the rest of the
 * page, including the shell wrapper that still holds tabbable content
 * (axe aria-hidden-focus). Escape, outside click and focus return to the
 * avatar work the same without it.
 *
 * Submenus are controlled. A mouse pick refreshes the server output and can
 * shift what sits under the pointer, which Radix reads as "focus left the
 * submenu"; close requests right after a pointer pick are ignored, so the
 * submenu stays open to change the value again. Keyboard use is unaffected.
 */

type ThemeChoice = "light" | "dark" | "system";
type PreferenceId = "theme" | "language" | "direction" | "digits" | "currency" | "calendar";

const themeChoices: readonly ThemeChoice[] = ["light", "dark", "system"];

/** How long after a pointer pick a submenu ignores Radix's close requests. */
const POINTER_PICK_GRACE_MS = 1000;

interface PreferenceRowProps<T extends string> {
  icon: LucideIcon;
  label: string;
  value: T;
  options: readonly { value: T; label: string; lang?: string }[];
  onChange: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A radio item is being picked with a pointer. */
  onPointerPick: () => void;
  /** A key was pressed inside the submenu. */
  onKeyboardUse: () => void;
}

function PreferenceRow<T extends string>({
  icon,
  label,
  value,
  options,
  onChange,
  open,
  onOpenChange,
  onPointerPick,
  onKeyboardUse,
}: PreferenceRowProps<T>) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenuSub open={open} onOpenChange={onOpenChange}>
      <DropdownMenuSubTrigger icon={icon}>
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="truncate">{label}</span>
          <span lang={current?.lang} className="shrink-0 text-xs font-semibold text-fg-muted">
            {current?.label}
          </span>
        </span>
      </DropdownMenuSubTrigger>
      {/* A fixed width: the bold checked row never resizes (and re-places) the submenu. */}
      <DropdownMenuSubContent className="w-56 min-w-0" onKeyDown={onKeyboardUse}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-label={label} value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              lang={option.lang}
              onPointerUp={onPointerPick}
              // Keep the menu open so several settings can be changed in a row.
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export interface ProfileMenuProps {
  /** Menu alignment against the avatar: `end` in the top bar, `start` in the mobile header. */
  align?: "start" | "end";
  className?: string;
}

export function ProfileMenu({ align = "end", className }: ProfileMenuProps) {
  const t = useTranslations("Shell.account");
  const tCommon = useTranslations("Common");
  const scope = useShellScope();
  const { profile, sample } = useShell();
  const preferences = usePreferences();
  const { update, setLocale } = usePreferenceActions();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useRouteScopedOpen();
  const [openSub, setOpenSub] = useState<PreferenceId | null>(null);
  const pointerPickAt = useRef(Number.NEGATIVE_INFINITY);
  const themeValue: ThemeChoice = themeChoices.includes(theme as ThemeChoice) ? (theme as ThemeChoice) : "system";

  const onMenuOpenChange = (next: boolean) => {
    // Every opening starts with the submenus closed.
    setOpenSub(null);
    setOpen(next);
  };

  const sub = (id: PreferenceId) => ({
    open: openSub === id,
    onOpenChange: (next: boolean) => {
      if (next) {
        setOpenSub(id);
        return;
      }
      if (performance.now() - pointerPickAt.current < POINTER_PICK_GRACE_MS) return;
      setOpenSub((current) => (current === id ? null : current));
    },
    onPointerPick: () => {
      pointerPickAt.current = performance.now();
    },
    onKeyboardUse: () => {
      pointerPickAt.current = Number.NEGATIVE_INFINITY;
    },
  });

  return (
    <DropdownMenu open={open} onOpenChange={onMenuOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("trigger")}
          className={cn(
            "inline-flex size-touch shrink-0 items-center justify-center rounded-full transition-[box-shadow]",
            "ring-2 ring-transparent aria-expanded:ring-scope-dot",
            className,
          )}
        >
          <Avatar name={profile.name} size={48} tone="personal" decorative />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} data-scope={scope} className="w-72 rounded-card-sm p-2">
        <div data-slot="profile" className="flex items-center gap-3 border-b border-line px-2 pt-1.5 pb-3">
          <Avatar name={profile.name} size={40} tone="personal" decorative />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <bdi className="truncate text-body font-bold">{profile.name}</bdi>
              {sample ? (
                <span
                  data-slot="sample"
                  className="shrink-0 rounded-pill bg-raised px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-muted"
                >
                  {tCommon("sample")}
                </span>
              ) : null}
            </span>
            <bdi className="truncate text-xs text-fg-secondary">{profile.detail}</bdi>
          </div>
        </div>
        <DropdownMenuLabel className="pt-3">{t("menu")}</DropdownMenuLabel>
        <PreferenceRow
          {...sub("theme")}
          icon={Palette}
          label={t("theme")}
          value={themeValue}
          options={themeChoices.map((value) => ({ value, label: t(`options.theme.${value}`) }))}
          onChange={setTheme}
        />
        <PreferenceRow
          {...sub("language")}
          icon={Languages}
          label={t("language")}
          value={preferences.locale}
          options={[
            { value: "en", label: t("options.language.en"), lang: "en" },
            { value: "fa", label: t("options.language.fa"), lang: "fa" },
          ]}
          onChange={setLocale}
        />
        <PreferenceRow
          {...sub("direction")}
          icon={ArrowLeftRight}
          label={t("direction")}
          value={preferences.direction}
          options={[
            { value: "ltr", label: t("options.direction.ltr") },
            { value: "rtl", label: t("options.direction.rtl") },
          ]}
          onChange={(direction) => update({ direction })}
        />
        <PreferenceRow
          {...sub("digits")}
          icon={Hash}
          label={t("digits")}
          value={preferences.digits}
          options={[
            { value: "latn", label: t("options.digits.latn") },
            { value: "fa", label: t("options.digits.fa") },
          ]}
          onChange={(digits) => update({ digits })}
        />
        <PreferenceRow
          {...sub("currency")}
          icon={Coins}
          label={t("currency")}
          value={preferences.currency}
          options={[
            { value: "toman", label: t("options.currency.toman") },
            { value: "rial", label: t("options.currency.rial") },
          ]}
          onChange={(currency) => update({ currency })}
        />
        <PreferenceRow
          {...sub("calendar")}
          icon={CalendarDays}
          label={t("calendar")}
          value={preferences.calendar}
          options={[
            { value: "jalali", label: t("options.calendar.jalali") },
            { value: "gregorian", label: t("options.calendar.gregorian") },
          ]}
          onChange={(calendar) => update({ calendar })}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Settings} comingSoon>
          {t("settings")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
