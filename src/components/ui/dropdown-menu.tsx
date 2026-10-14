"use client";

import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/*
 * Menu on Radix DropdownMenu: roving focus, typeahead, arrow keys (which
 * follow the Radix Direction provider), Escape and focus return are Radix's.
 * Content renders its own dir attribute, so it mirrors inside the portal.
 */

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuSub = MenuPrimitive.Sub;

const surfaceClassName = cn(
  "z-(--z-overlay) flex min-w-56 flex-col gap-0.5 overflow-y-auto overscroll-contain",
  "rounded-tile border border-hairline bg-elevated p-1.5 text-fg shadow-elevated",
  "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
);

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          surfaceClassName,
          "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

const itemClassName = cn(
  "relative flex min-h-11 w-full cursor-default select-none items-center gap-3 rounded-row px-3 text-start",
  "text-sm font-medium text-fg transition-colors",
  "data-highlighted:bg-subtle data-disabled:pointer-events-none data-disabled:text-fg-muted",
  "[&_svg]:shrink-0",
);

function ItemIcon({ icon }: { icon?: LucideIcon }) {
  return icon ? <Icon icon={icon} size={18} className="text-fg-secondary group-data-[tone=destructive]:text-danger-text" /> : null;
}

/** Keyboard shortcut; shortcuts stay LTR in every language (⌘K). */
export function DropdownMenuShortcut({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      dir="ltr"
      className={cn("ms-auto font-sans text-xs font-semibold tracking-wide text-fg-muted", className)}
      {...props}
    />
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="ms-auto rounded-pill bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg-muted">{children}</span>
  );
}

export type DropdownMenuItemProps = ComponentProps<typeof MenuPrimitive.Item> & {
  icon?: LucideIcon;
  shortcut?: string;
  tone?: "default" | "destructive";
  /**
   * Not available yet: the item stays focusable and announced (so a menu of
   * only upcoming actions is still explorable by keyboard and screen reader),
   * but it is aria-disabled, muted, selecting it does nothing and the menu
   * stays open; shows Common.comingSoon as a hint.
   */
  comingSoon?: boolean;
  /** Trailing hint text (e.g. a reason the item is disabled). */
  hint?: ReactNode;
};

export function DropdownMenuItem({
  icon,
  shortcut,
  tone = "default",
  comingSoon = false,
  hint,
  disabled,
  onSelect,
  className,
  children,
  ...props
}: DropdownMenuItemProps) {
  const t = useTranslations("Common");
  const trailing = hint ?? (comingSoon ? t("comingSoon") : null);
  return (
    <MenuPrimitive.Item
      data-tone={tone}
      disabled={disabled}
      aria-disabled={comingSoon || undefined}
      data-coming-soon={comingSoon || undefined}
      onSelect={(event) => {
        if (comingSoon) {
          event.preventDefault();
          return;
        }
        onSelect?.(event);
      }}
      className={cn(
        "group",
        itemClassName,
        tone === "destructive" && "font-semibold text-danger-text data-highlighted:bg-danger-soft",
        comingSoon && "cursor-not-allowed text-fg-muted [&_svg]:text-fg-muted",
        className,
      )}
      {...props}
    >
      <ItemIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing != null ? <Hint>{trailing}</Hint> : null}
      {shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}
    </MenuPrimitive.Item>
  );
}

function CheckIndicator() {
  return (
    <span className="absolute end-3 inline-flex size-5 items-center justify-center text-scope-deep">
      <MenuPrimitive.ItemIndicator>
        <Icon icon={Check} size={18} />
      </MenuPrimitive.ItemIndicator>
    </span>
  );
}

export function DropdownMenuCheckboxItem({
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem> & { icon?: LucideIcon }) {
  return (
    <MenuPrimitive.CheckboxItem
      className={cn(itemClassName, "group pe-10", "data-[state=checked]:font-semibold", className)}
      {...props}
    >
      <ItemIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <CheckIndicator />
    </MenuPrimitive.CheckboxItem>
  );
}

export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export function DropdownMenuRadioItem({
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem> & { icon?: LucideIcon }) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(
        itemClassName,
        "group pe-10",
        "data-[state=checked]:bg-scope-soft data-[state=checked]:font-semibold",
        className,
      )}
      {...props}
    >
      <ItemIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <CheckIndicator />
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-3 pt-2 pb-1 type-label text-fg-muted", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("mx-2 my-1 h-px bg-line", className)} {...props} />;
}

export function DropdownMenuSubTrigger({
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubTrigger> & { icon?: LucideIcon }) {
  return (
    <MenuPrimitive.SubTrigger className={cn("group", itemClassName, "data-[state=open]:bg-subtle", className)} {...props}>
      <ItemIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Icon icon={ChevronRight} mirror size={16} className="text-fg-muted" />
    </MenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubContent>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent
        collisionPadding={collisionPadding}
        className={cn(
          surfaceClassName,
          "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}
