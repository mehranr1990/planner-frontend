"use client";

import { cva, type VariantProps } from "class-variance-authority";
import {
  Fragment,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { IconButton, type IconButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { notchPresets, type NotchPresetName } from "@/design-system/tokens/radii";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";
import { notchPath } from "./notch-path";

/*
 * Signature card (P00 "Card geometry · A", design guide §4): a 32px card with
 * a sculpted top inline-end corner. A notch is never empty: it holds one
 * circular contextual action, or two when the card genuinely has two closely
 * related ones (Stop + Open, Mute + Open) — then it takes the double notch
 * (112×60, two 48px buttons). Use it for a standalone, important object
 * only (≤3 per desktop viewport, 1–2 on mobile); repeated or dense content is
 * a ProductCard / UtilityCard, and families (KPIs, rows) never notch per item.
 *
 * Shape, in two stages so there is no first-paint jump:
 * 1. Server HTML / first paint: a CSS mask built from fixed-size gradient
 *    tiles anchored to the notch corner. The notch geometry is constant in px
 *    and only the rest of the card stretches, so the mask reproduces the shape
 *    exactly (concave fillets included) without measuring anything. The rtl:
 *    variant puts it top-left under dir="rtl", and preset="auto" swaps the
 *    mobile/desktop masks with max-lg / lg CSS variables, before any JS runs.
 * 2. After mount: a ResizeObserver measures the surface and applies the
 *    canonical `clip-path: path()` from notchPath(), mirrored by the element's
 *    computed direction (so a nested dir attribute works), and drops the mask.
 *    One vector shape gives cleaner anti-aliasing than abutting mask tiles.
 *    For preset="auto" a matchMedia listener re-applies it at the lg breakpoint.
 * The layout effect runs before paint, so client-rendered cards never show
 * stage 1 at all.
 *
 * The action layer is a sibling of the clipped surface, never clipped itself.
 * The active numbers are exposed as --notch-w / --notch-h / --notch-button
 * (per breakpoint for "auto"), so the header and the action follow them.
 */

/** The double notch is chosen by passing two actions, never by preset. */
export type SignatureCardPreset = Exclude<NotchPresetName, "double"> | "auto";
export type SignatureCardSide = "end" | "start";

/** preset="auto" is the mobile notch below this query and the desktop notch from it (Tailwind lg, 1024px). */
export const SIGNATURE_DESKTOP_QUERY = "(min-width: 64rem)";

/** Outer corner radius: signature cards are always rounded-signature (32px). */
const RADIUS = 32;

type NotchShape = { notchWidth: number; notchHeight: number; fillet: number };

/** CSS `mask` value that cuts the notch out of the top-right (ltr) or top-left (rtl) corner. */
export function notchMask(direction: Direction, { notchWidth: nw, notchHeight: nh, fillet: f }: NotchShape): string {
  const rtl = direction === "rtl";
  const end = rtl ? "left" : "right";
  const start = rtl ? "right" : "left";
  const solid = "linear-gradient(#000 0 0)";
  // The card bulges into a fillet tile from its inline-start bottom corner…
  const inside = `radial-gradient(circle at ${rtl ? "100%" : "0"} 100%, #000 ${f - 0.5}px, transparent ${f}px)`;
  // …and wraps around the notch's inner corner (tile's inline-end top corner).
  const outside = `radial-gradient(circle at ${rtl ? "0" : "100%"} 0, transparent ${f - 0.5}px, #000 ${f}px)`;
  const px = (value: number) => `${value}px`;
  return [
    `${solid} ${start} 0 top 0 / calc(100% - ${px(nw + f)}) 100% no-repeat`,
    `${solid} ${start} 0 bottom 0 / 100% calc(100% - ${px(nh + f)}) no-repeat`,
    `${inside} ${end} ${px(nw)} top 0 / ${px(f)} ${px(f)} no-repeat`,
    `${solid} ${end} ${px(nw)} top ${px(f)} / ${px(f)} ${px(nh)} no-repeat`,
    `${outside} ${end} ${px(nw - f)} top ${px(nh - f)} / ${px(f)} ${px(f)} no-repeat`,
    `${solid} ${end} ${px(f)} top ${px(nh)} / ${px(nw - f)} ${px(f)} no-repeat`,
    `${inside} ${end} 0 top ${px(nh)} / ${px(f)} ${px(f)} no-repeat`,
  ].join(", ");
}

const flip = (direction: Direction): Direction => (direction === "rtl" ? "ltr" : "rtl");

/** The physical corner direction for a reading direction: side="start" mirrors the other way. */
function cornerDirection(direction: Direction, side: SignatureCardSide): Direction {
  return side === "end" ? direction : flip(direction);
}

/** --notch-* custom properties for one preset; `infix` namespaces the auto preset's two sets. */
function presetVars(name: NotchPresetName, side: SignatureCardSide, infix = ""): Record<string, string> {
  const { notchWidth, notchHeight, fillet, button } = notchPresets[name];
  const shape = { notchWidth, notchHeight, fillet };
  return {
    [`--notch${infix}-w`]: `${notchWidth}px`,
    [`--notch${infix}-h`]: `${notchHeight}px`,
    [`--notch${infix}-button`]: `${button}px`,
    [`--notch${infix}-mask-ltr`]: notchMask(cornerDirection("ltr", side), shape),
    [`--notch${infix}-mask-rtl`]: notchMask(cornerDirection("rtl", side), shape),
  };
}

/* preset="auto": the root picks the mobile (-sm) or desktop (-lg) set per breakpoint. */
const autoPresetClasses = [
  "[--notch-w:var(--notch-sm-w)] [--notch-h:var(--notch-sm-h)] [--notch-button:var(--notch-sm-button)]",
  "[--notch-mask-ltr:var(--notch-sm-mask-ltr)] [--notch-mask-rtl:var(--notch-sm-mask-rtl)]",
  "lg:[--notch-w:var(--notch-lg-w)] lg:[--notch-h:var(--notch-lg-h)] lg:[--notch-button:var(--notch-lg-button)]",
  "lg:[--notch-mask-ltr:var(--notch-lg-mask-ltr)] lg:[--notch-mask-rtl:var(--notch-lg-mask-rtl)]",
];

/* One shared observer re-applies every card's path when any dir attribute changes. */
const directionListeners = new Set<() => void>();
let directionObserver: MutationObserver | null = null;

function subscribeToDirection(listener: () => void) {
  directionListeners.add(listener);
  if (!directionObserver && typeof MutationObserver !== "undefined") {
    directionObserver = new MutationObserver(() => directionListeners.forEach((notify) => notify()));
    directionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"], subtree: true });
  }
  return () => {
    directionListeners.delete(listener);
    if (directionListeners.size === 0) {
      directionObserver?.disconnect();
      directionObserver = null;
    }
  };
}

const surfaceVariants = cva(
  [
    "relative min-w-0 rounded-signature",
    "[mask:var(--notch-mask-ltr)] rtl:[mask:var(--notch-mask-rtl)] data-[notch=path]:[mask:none]",
  ],
  {
    variants: {
      tone: {
        surface: "bg-surface text-fg",
        /** Insight / story cards: #0E6B57 light, #173A31 dark (never the bright dark scope-deep). */
        deep: "bg-deep-card text-on-deep-card",
        /** Live / now state only: at most one volt area per viewport. */
        volt: "bg-volt text-on-volt",
        "scope-soft": "bg-scope-soft text-fg",
      },
      padding: {
        /** 22px, the P00 board's signature card. */
        default: "p-5.5 [--notch-pad:1.375rem]",
        compact: "p-4.5 [--notch-pad:1.125rem]",
        none: "[--notch-pad:0px]",
      },
      side: {
        end: "[--notch-reserve-start:0px] [--notch-reserve-end:calc(var(--notch-w)-var(--notch-pad)+0.5rem)]",
        start: "[--notch-reserve-end:0px] [--notch-reserve-start:calc(var(--notch-w)-var(--notch-pad)+0.5rem)]",
      },
    },
    defaultVariants: { tone: "surface", padding: "default", side: "end" },
  },
);

export type SignatureCardTone = NonNullable<VariantProps<typeof surfaceVariants>["tone"]>;

type RootElement = "div" | "article" | "section" | "aside" | "li";

export type SignatureCardProps = Omit<HTMLAttributes<HTMLElement>, "children"> &
  Omit<VariantProps<typeof surfaceVariants>, "side"> & {
    /**
     * Notch geometry. "auto" (default): mobile 56×56 / f24 / 46px button below
     * lg, desktop 64×64 / f28 / 54px from lg. "focus": 72×72 / f30 / 56px.
     */
    preset?: SignatureCardPreset;
    /** Corner that holds the notch: "end" (top-right LTR, top-left RTL) or "start". */
    side?: SignatureCardSide;
    /**
     * Required: a notch always holds a circular contextual action (see
     * SignatureCardAction). One element, or a pair of two real, closely
     * related actions (secondary first, primary at the corner), which switches
     * the card to the double notch. Never invent a second action to fill it.
     */
    action: ReactElement | readonly [ReactElement, ReactElement];
    /** Semantic element for the root. */
    as?: RootElement;
    /** Classes for the clipped surface (layout of the card's content). */
    contentClassName?: string;
    children?: ReactNode;
  };

function isActionPair(action: SignatureCardProps["action"]): action is readonly [ReactElement, ReactElement] {
  return Array.isArray(action);
}

export function SignatureCard({
  preset: requestedPreset = "auto",
  side = "end",
  tone,
  padding,
  action,
  as: Root = "div",
  className,
  contentClassName,
  style,
  children,
  ...props
}: SignatureCardProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const actions: readonly ReactElement[] = isActionPair(action) ? action : [action];
  // Two actions take the double notch at every width.
  const preset: SignatureCardPreset | "double" = actions.length === 2 ? "double" : requestedPreset;

  if (process.env.NODE_ENV !== "production" && actions.some((element) => element?.type === Fragment)) {
    console.error("SignatureCard holds one or two actions, each a single button; others belong inside the card.");
  }

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const desktop =
      preset === "auto" && typeof window.matchMedia === "function" ? window.matchMedia(SIGNATURE_DESKTOP_QUERY) : null;
    let size = { width: element.offsetWidth, height: element.offsetHeight };

    const apply = () => {
      if (!size.width || !size.height) return;
      const active: NotchPresetName = preset === "auto" ? (desktop?.matches ? "desktop" : "mobile") : preset;
      const { notchWidth, notchHeight, fillet } = notchPresets[active];
      const reading: Direction = getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
      const corner = cornerDirection(reading, side);
      const path = notchPath({ ...size, radius: RADIUS, notchWidth, notchHeight, fillet, direction: corner });
      element.style.clipPath = `path("${path}")`;
      element.dataset.notch = "path";
      element.dataset.notchPreset = active;
      element.dataset.notchDirection = reading;
      element.dataset.notchCorner = corner === "rtl" ? "top-left" : "top-right";
    };

    apply();
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      size = box
        ? { width: box.inlineSize, height: box.blockSize }
        : { width: element.offsetWidth, height: element.offsetHeight };
      apply();
    });
    observer.observe(element);
    desktop?.addEventListener("change", apply);
    const unsubscribe = subscribeToDirection(apply);
    return () => {
      observer.disconnect();
      desktop?.removeEventListener("change", apply);
      unsubscribe();
    };
  }, [preset, side]);

  const vars = {
    ...(preset === "auto"
      ? { ...presetVars("mobile", side, "-sm"), ...presetVars("desktop", side, "-lg") }
      : presetVars(preset, side)),
    ...style,
  } as CSSProperties;

  return (
    <Root
      className={cn("relative grid min-w-0", preset === "auto" && autoPresetClasses, className)}
      style={vars}
      data-preset={preset}
      data-side={side}
      data-notch-actions={actions.length}
      {...props}
    >
      <div
        ref={surfaceRef}
        data-slot="signature-surface"
        className={cn(surfaceVariants({ tone, padding, side }), contentClassName)}
      >
        {children}
      </div>
      <div data-slot="notch-action" className={cn("absolute top-0 flex gap-2", side === "end" ? "end-0" : "start-0")}>
        {actions}
      </div>
    </Root>
  );
}

/**
 * The title row of a signature card. Reserves the notch's width on its side
 * and its height, so text never runs under the cut-out or the action.
 */
export function SignatureCardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-[calc(var(--notch-h)-var(--notch-pad))] items-center gap-2.5",
        "ps-(--notch-reserve-start) pe-(--notch-reserve-end)",
        className,
      )}
      {...props}
    />
  );
}

const actionVariants = {
  /** The card's primary: scope deep with a white glyph (pass iconClassName="fill-volt text-volt" on a volt card). */
  primary: "",
  /** Navigation (Open, Expand): the page canvas grey, ink glyph. */
  neutral: "bg-canvas text-fg hover:bg-secondary-hover active:bg-secondary-pressed",
  /** Stop / Dismiss: the destructive fill (red in light, red on a dark tint in dark). */
  danger: "",
} as const;

export type SignatureCardActionProps = Omit<IconButtonProps, "size" | "variant" | "label"> & {
  /** Accessible name (required): the action, e.g. "Start focus", "Open goal". */
  label: string;
  variant?: keyof typeof actionVariants;
  /** Classes for the glyph when `icon` is used, e.g. the volt play icon on a volt card. */
  iconClassName?: string;
};

/**
 * A circular action in the notch, sized by the active preset
 * (--notch-button: 54 desktop, 46 mobile, 56 focus, 48 in the double notch). Its hit area extends 4px
 * past the circle so the 46px mobile button still meets the 48px target.
 */
export function SignatureCardAction({
  variant = "primary",
  icon,
  mirror,
  iconClassName,
  className,
  children,
  ...props
}: SignatureCardActionProps) {
  return (
    <IconButton
      {...props}
      variant={variant === "primary" ? "primary" : variant === "danger" ? "destructive" : "secondary"}
      className={cn("size-(--notch-button) after:absolute after:-inset-1", actionVariants[variant], className)}
    >
      {icon ? <Icon icon={icon} mirror={mirror} size={20} className={iconClassName} /> : children}
    </IconButton>
  );
}
