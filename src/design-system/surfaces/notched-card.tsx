import { IconButton, type IconButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  SignatureCard,
  SignatureCardHeader,
  type SignatureCardPreset,
  type SignatureCardProps,
  type SignatureCardTone,
} from "./signature-card";

/*
 * Deprecated compatibility layer for the Wave 0/1A NotchedCard API, kept only
 * so existing shell imports compile until they move to SignatureCard in 1C.
 * It maps the retired props onto SignatureCard; new code must not use it.
 */

export { notchMask } from "./signature-card";

/** @deprecated use SignatureCardPreset */
export type NotchPreset = SignatureCardPreset;

type LegacyTone = "surface" | "raised" | "elevated" | "volt" | "scope-soft" | "scope-deep";

const legacyTones: Record<LegacyTone, { tone: SignatureCardTone; className?: string }> = {
  surface: { tone: "surface" },
  volt: { tone: "volt" },
  "scope-soft": { tone: "scope-soft" },
  "scope-deep": { tone: "deep" },
  raised: { tone: "surface", className: "bg-raised" },
  elevated: { tone: "surface", className: "bg-elevated" },
};

const legacyPadding = { none: "none", sm: "compact", md: "default", lg: "default" } as const;

/** @deprecated use SignatureCardProps */
export type NotchedCardProps = Omit<SignatureCardProps, "tone" | "padding"> & {
  tone?: LegacyTone;
  padding?: keyof typeof legacyPadding;
  /** @deprecated ignored: a signature card is always rounded-signature (32px). */
  radius?: "card" | "card-sm";
};

/** @deprecated use SignatureCard */
export function NotchedCard({ tone = "surface", padding = "md", radius, contentClassName, ...props }: NotchedCardProps) {
  void radius; // Accepted for compatibility only; never forwarded to the DOM.
  const mapped = legacyTones[tone];
  return (
    <SignatureCard
      {...props}
      tone={mapped.tone}
      padding={legacyPadding[padding]}
      contentClassName={cn(mapped.className, contentClassName)}
    />
  );
}

/** @deprecated use SignatureCardHeader */
export const NotchedCardHeader = SignatureCardHeader;

/** @deprecated use SignatureCardAction */
export type NotchedCardButtonProps = Omit<IconButtonProps, "size">;

/** @deprecated use SignatureCardAction (round icon button sized by --notch-button). */
export function NotchedCardButton({ variant = "outline", className, ...props }: NotchedCardButtonProps) {
  return <IconButton variant={variant} className={cn("size-(--notch-button) after:absolute after:-inset-1 after:content-['']", className)} {...props} />;
}
