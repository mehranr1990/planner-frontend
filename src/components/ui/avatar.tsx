"use client";

import { useTranslations } from "next-intl";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/locale/digits";
import { usePreferences } from "@/features/preferences/use-preferences";
import type { Scope } from "@/design-system/tokens/colors";

export type AvatarSize = 32 | 40 | 48;
export type AvatarTone = Scope | "neutral";

const sizeClassName: Record<AvatarSize, string> = {
  32: "size-8 text-[11px]",
  40: "size-10 text-xs",
  48: "size-12 text-sm",
};

const toneClassName: Record<AvatarTone, string> = {
  personal: "bg-personal-soft text-personal-deep",
  project: "bg-project-soft text-project-deep",
  team: "bg-team-soft text-team-deep",
  company: "bg-company-soft text-company-deep",
  neutral: "bg-raised text-fg-secondary",
};

/** "Mehran Raeeszade" → "MR", "مهران" → "م". Up to two letters. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters
    .map((word) => Array.from(word ?? "")[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

export interface AvatarProps {
  /** Person's name: the accessible label and the source of the initials. */
  name: string;
  src?: string;
  /** Override the computed initials (e.g. "PT"). */
  initials?: string;
  size?: AvatarSize;
  tone?: AvatarTone;
  /** Hide from assistive tech when a visible name sits next to it. */
  decorative?: boolean;
  className?: string;
}

/** Round avatar: image when it loads, otherwise initials on a scope tint. */
export function Avatar({
  name,
  src,
  initials,
  size = 40,
  tone = "neutral",
  decorative = false,
  className,
}: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-pill font-bold",
        sizeClassName[size],
        toneClassName[tone],
        className,
      )}
    >
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback aria-hidden className="leading-none" delayMs={src ? 300 : undefined}>
        {initials ?? getInitials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export interface AvatarGroupPerson {
  name: string;
  src?: string;
  initials?: string;
  tone?: AvatarTone;
}

export interface AvatarGroupProps {
  people: readonly AvatarGroupPerson[];
  /** Avatars shown before the "+N" bubble. */
  max?: number;
  size?: AvatarSize;
  /** Accessible group label. Defaults to "N people". */
  label?: string;
  className?: string;
}

/** Overlapping cluster with a "+N" overflow bubble ("KF JK SP +2"). */
export function AvatarGroup({ people, max = 3, size = 32, label, className }: AvatarGroupProps) {
  const t = useTranslations("Feedback.avatarGroup");
  const { digits } = usePreferences();
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div
      role="group"
      aria-label={label ?? t("label", { count: people.length, formatted: formatNumber(people.length, digits) })}
      className={cn("inline-flex items-center", className)}
    >
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          src={person.src}
          initials={person.initials}
          tone={person.tone}
          size={size}
          className={cn("ring-2 ring-surface", index > 0 && "-ms-2")}
        />
      ))}
      {overflow > 0 ? (
        <span
          role="img"
          aria-label={t("more", { formatted: formatNumber(overflow, digits) })}
          className={cn(
            "-ms-2 inline-flex shrink-0 items-center justify-center rounded-pill bg-raised font-bold text-fg-secondary ring-2 ring-surface",
            sizeClassName[size],
          )}
        >
          {/* dir=ltr keeps the plus sign before the number in RTL. */}
          <span aria-hidden dir="ltr">
            +{formatNumber(overflow, digits)}
          </span>
        </span>
      ) : null}
    </div>
  );
}
