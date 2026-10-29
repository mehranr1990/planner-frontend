import type { Scope, TimeBlockKind } from "@/data/domain";
import { cn } from "@/lib/cn";

/*
 * Timeline block styling from design tokens only (soft / deep / dot per
 * scope, neutrals, danger, volt), so light and dark both follow. The class
 * strings are written out in full so Tailwind can see them.
 *
 *   tint     scope soft surface + deep ink            (personal, project, team, company)
 *   break    neutral grey, no scope colour             (lunch, routines that are not work)
 *   done     135° hatch, muted ink, struck-through title
 *   current  white surface, 2px deep inset outline, soft deep shadow, "Now" chip
 *   overlap  rose soft surface + 1.5px rose outline (and the "overlaps 30m" text, supplied by the block)
 *
 * Volt is never used here: the now-dot on the timeline is the one documented
 * volt mark and belongs to the now line, not to a block.
 */

export type BlockTone = Scope | "break";

interface ToneClasses {
  surface: string;
  ink: string;
  meta: string;
  dot: string;
  /** The "Now · 14:35" chip. */
  chip: string;
  /** 2px inset outline + lifted shadow of the current block. */
  current: string;
}

const TONES: Record<BlockTone, ToneClasses> = {
  personal: {
    surface: "bg-personal-soft",
    ink: "text-personal-deep",
    meta: "text-personal-deep",
    dot: "bg-personal-dot",
    chip: "bg-personal-deep text-on-accent",
    current: "ring-2 ring-inset ring-personal-deep shadow-[0_6px_18px_color-mix(in_oklab,var(--personal-deep)_22%,transparent)] dark:shadow-none",
  },
  project: {
    surface: "bg-project-soft",
    ink: "text-project-deep",
    meta: "text-project-deep",
    dot: "bg-project-dot",
    chip: "bg-project-deep text-on-accent",
    current: "ring-2 ring-inset ring-project-deep shadow-[0_6px_18px_color-mix(in_oklab,var(--project-deep)_22%,transparent)] dark:shadow-none",
  },
  team: {
    surface: "bg-team-soft",
    ink: "text-team-deep",
    meta: "text-team-deep",
    dot: "bg-team-dot",
    chip: "bg-team-deep text-on-accent",
    current: "ring-2 ring-inset ring-team-deep shadow-[0_6px_18px_color-mix(in_oklab,var(--team-deep)_22%,transparent)] dark:shadow-none",
  },
  company: {
    surface: "bg-company-soft",
    ink: "text-company-deep",
    meta: "text-company-deep",
    dot: "bg-company-dot",
    chip: "bg-company-deep text-on-accent",
    current: "ring-2 ring-inset ring-company-deep shadow-[0_6px_18px_color-mix(in_oklab,var(--company-deep)_22%,transparent)] dark:shadow-none",
  },
  break: {
    surface: "bg-subtle",
    ink: "text-fg-secondary",
    meta: "text-fg-muted",
    dot: "bg-icon-muted",
    chip: "bg-fg-secondary text-on-accent",
    current: "ring-2 ring-inset ring-fg-secondary shadow-[0_6px_18px_color-mix(in_oklab,var(--text-secondary)_18%,transparent)] dark:shadow-none",
  },
};

/** Completed blocks: hatched 135° from neutral surfaces. */
const DONE_SURFACE =
  "bg-[repeating-linear-gradient(135deg,var(--surface-subtle)_0_2px,var(--surface)_2px_7px)]";

const OVERLAP_SURFACE = "bg-danger-soft";
const OVERLAP_RING = "ring-[1.5px] ring-inset ring-danger";

/** Breaks are neutral whatever their scope; everything else follows its scope. */
export function blockTone(scope: Scope, kind: TimeBlockKind): BlockTone {
  return kind === "break" ? "break" : scope;
}

export interface BlockStyleInput {
  scope: Scope;
  kind: TimeBlockKind;
  done?: boolean;
  current?: boolean;
  overlap?: boolean;
}

export interface BlockStyle {
  /** Surface, outline and ink of the block card. */
  root: string;
  /** Title: ink, struck through when done. */
  title: string;
  /** The meta line ("45m · Teams · Design team"). */
  meta: string;
  /** The small scope dot. */
  dot: string;
  /** The "Now · 14:35" chip (only meaningful when `current`). */
  nowChip: string;
}

/** Variant precedence: done hatches the surface; overlap and current add outlines on top. */
export function blockStyle({ scope, kind, done = false, current = false, overlap = false }: BlockStyleInput): BlockStyle {
  const tone = TONES[blockTone(scope, kind)];
  const surface = done ? DONE_SURFACE : overlap ? OVERLAP_SURFACE : current ? "bg-surface" : tone.surface;
  return {
    root: cn(
      surface,
      overlap && OVERLAP_RING,
      current && !overlap && tone.current,
      done ? "text-fg-muted" : overlap ? "text-danger-text" : tone.ink,
    ),
    title: cn(done && "line-through decoration-1"),
    meta: done ? "text-fg-muted" : overlap ? "text-danger-text" : tone.meta,
    dot: tone.dot,
    nowChip: tone.chip,
  };
}

/** Dashed placeholder for the next free slot and fit-hint gaps. */
export const SLOT_PLACEHOLDER_STYLE = "rounded-[16px] border-[1.5px] border-dashed border-outline text-fg-muted";

/** The ghost left at the snap target while dragging: hatched, 1.5px deep outline. */
export const DRAG_GHOST_STYLE = cn(DONE_SURFACE, "ring-[1.5px] ring-inset ring-personal-deep");
