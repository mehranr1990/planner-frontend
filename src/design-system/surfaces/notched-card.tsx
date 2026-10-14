"use client";

import { cva, type VariantProps } from "class-variance-authority";
import {
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { IconButton, type IconButtonProps } from "@/components/ui/button";
import { notchPresets } from "@/design-system/tokens/radii";
import { cn } from "@/lib/cn";
import type { Direction } from "@/lib/locale/direction";
import { notchPath } from "./notch-path";

/*
 * The notched card (design guide §4): the top inline-end corner is cut out
 * and holds one or two round action buttons.
 *
 * Shape, in two stages so there is no first-paint jump:
 * 1. Server HTML / first paint: a CSS mask built from fixed-size gradient
 *    tiles anchored to the notch corner. The notch geometry is constant in px
 *    and only the rest of the card stretches, so the mask reproduces the shape
 *    exactly (concave fillets included) without measuring anything, and the
 *    rtl: variant puts it top-left under dir="rtl" before any JS runs.
 * 2. After mount: a ResizeObserver measures the surface and applies the
 *    canonical `clip-path: path()` from notchPath(), mirrored by the element's
 *    computed direction (so a nested dir attribute works), and drops the mask.
 *    One vector shape gives cleaner anti-aliasing than abutting mask tiles.
 * The layout effect runs before paint, so client-rendered cards never show
 * stage 1 at all.
 *
 * The action layer is a sibling of the clipped surface, never clipped itself.
 */

export type NotchPreset = keyof typeof notchPresets;

const RADIUS = { card: 32, "card-sm": 28 } as const;

type NotchShape = { notchWidth: number; notchHeight: number; fillet: number };

/** CSS `mask` value that cuts the notch out of the top inline-end corner. */
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
    "relative min-w-0",
    "[mask:var(--notch-mask-ltr)] rtl:[mask:var(--notch-mask-rtl)] data-[notch=path]:[mask:none]",
  ],
  {
    variants: {
      tone: {
        surface: "bg-surface text-fg",
        raised: "bg-raised text-fg",
        elevated: "bg-elevated text-fg",
        volt: "bg-volt text-on-volt",
        "scope-soft": "bg-scope-soft text-fg",
        "scope-deep": "bg-scope-deep text-on-accent",
      },
      radius: {
        card: "rounded-card",
        "card-sm": "rounded-card-sm",
      },
      padding: {
        none: "[--notch-pad:0px]",
        sm: "p-4 [--notch-pad:1rem]",
        md: "p-card [--notch-pad:1.5rem]",
        lg: "p-card [--notch-pad:1.5rem] lg:p-card-lg lg:[--notch-pad:1.75rem]",
      },
    },
    defaultVariants: { tone: "surface", radius: "card", padding: "md" },
  },
);

type RootElement = "div" | "article" | "section" | "aside" | "li";

export type NotchedCardProps = Omit<HTMLAttributes<HTMLElement>, "children"> &
  VariantProps<typeof surfaceVariants> & {
    /** Notch geometry: default 64×64 (52px button), compact 60×60 (48px), double 112×60 (two 48px). */
    preset?: NotchPreset;
    /** One or two buttons placed in the notch corner (see NotchedCardButton). */
    action?: ReactNode;
    /** Semantic element for the root. */
    as?: RootElement;
    /** Classes for the clipped surface (layout of the card's content). */
    contentClassName?: string;
    children?: ReactNode;
  };

export function NotchedCard({
  preset = "default",
  tone,
  radius,
  padding,
  action,
  as: Root = "div",
  className,
  contentClassName,
  style,
  children,
  ...props
}: NotchedCardProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { notchWidth, notchHeight, fillet, button } = notchPresets[preset];
  const cornerRadius = RADIUS[radius ?? "card"];

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    let size = { width: element.offsetWidth, height: element.offsetHeight };

    const apply = () => {
      if (!size.width || !size.height) return;
      const direction: Direction = getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
      const path = notchPath({ ...size, radius: cornerRadius, notchWidth, notchHeight, fillet, direction });
      element.style.clipPath = `path("${path}")`;
      element.dataset.notch = "path";
      element.dataset.notchDirection = direction;
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
    const unsubscribe = subscribeToDirection(apply);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [cornerRadius, notchWidth, notchHeight, fillet]);

  const shape = { notchWidth, notchHeight, fillet };
  const vars = {
    "--notch-w": `${notchWidth}px`,
    "--notch-h": `${notchHeight}px`,
    "--notch-button": `${button}px`,
    "--notch-mask-ltr": notchMask("ltr", shape),
    "--notch-mask-rtl": notchMask("rtl", shape),
    ...style,
  } as CSSProperties;

  return (
    <Root className={cn("relative grid min-w-0", className)} style={vars} data-preset={preset} {...props}>
      <div ref={surfaceRef} data-slot="notched-surface" className={cn(surfaceVariants({ tone, radius, padding }), contentClassName)}>
        {children}
      </div>
      {action ? (
        <div data-slot="notch-action" className="absolute end-0 top-0 flex gap-2">
          {action}
        </div>
      ) : null}
    </Root>
  );
}

/**
 * The title row of a notched card. Reserves the notch's width at inline-end
 * and its height, so text never runs under the cut-out or the buttons.
 */
export function NotchedCardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-[calc(var(--notch-h)-var(--notch-pad))] items-center gap-2.5",
        "pe-[calc(var(--notch-w)-var(--notch-pad)+0.5rem)]",
        className,
      )}
      {...props}
    />
  );
}

export type NotchedCardButtonProps = Omit<IconButtonProps, "size">;

/** Round icon button sized for the notch preset it sits in (52px or 48px). */
export function NotchedCardButton({ variant = "outline", className, ...props }: NotchedCardButtonProps) {
  return <IconButton variant={variant} className={cn("size-(--notch-button)", className)} {...props} />;
}
