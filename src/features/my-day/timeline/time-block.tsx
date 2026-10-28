"use client";

import { useDraggable } from "@dnd-kit/core";
import { Check, Ellipsis } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { taskDetailHref } from "@/features/personal/routes";
import type { DayBlock, MinuteSpan } from "../domain/day-blocks";
import { blockDragId, isBlockDraggable } from "../drag";
import { useMyDay } from "../my-day-context";
import { EnergyBars } from "../ui/energy-bars";
import { blockStyle } from "../ui/scope-style";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { ClockText } from "./clock-text";
import { useDropActions } from "./drag-state";
import { timelineBlockDragData } from "./drop-plan";
import { blockHeight, blockTop, isRoomyBlock, isShortBlock, type Lane } from "./geometry";
import { useBlockResize } from "./use-block-resize";

/*
 * One block of the day. The whole card is the keyboard and drag target (a
 * single role="button"); the ⋯ menu is a sibling button so no interactive
 * element sits inside another. Variants, from the board: scope tint, break
 * (neutral), done (hatched, struck-through, "done"), current (2px outline,
 * "Now · 14:35" chip), overlap (rose, "overlaps 30m"), short (a single row
 * under ~40px), selected. Its box is positioned from minutes, so a move or a
 * resize is just a new top and height and eases there (instant under
 * reduced motion, and never while the pointer is driving it).
 */

/** The id of the hidden keyboard help every block points to (rendered once by the card). */
export const BLOCK_HELP_ID = "my-day-block-help";

export interface TimeBlockProps {
  block: DayBlock;
  day: string;
  /** The visible window: the box is placed against its start, a resize stays inside it. */
  window: MinuteSpan;
  pxPerMinute: number;
  lane: Lane;
  /** Minutes this open block overlaps another by; null when it does not. */
  overlapMinutes: number | null;
  /** The planner's minute-of-day, set only on the live block (it gets the outline and the "Now" chip). */
  nowMinutes: number | null;
  /** Effort or time left on the current block ("35m left"); null otherwise. */
  leftMinutes: number | null;
  /** Appeared after the first render: pops in. */
  isNew?: boolean;
}

export function TimeBlock({
  block,
  day,
  window,
  pxPerMinute,
  lane,
  overlapMinutes,
  nowMinutes,
  leftMinutes,
  isNew = false,
}: TimeBlockProps) {
  const current = nowMinutes !== null;
  const t = useTranslations("MyDay.block");
  const tEnergy = useTranslations("MyDay.a11y");
  const format = useMyDayFormat();
  const router = useRouter();
  const { selectedBlockId, selectBlock, openReschedule } = useMyDay();
  const actions = useDropActions();

  const root = useRef<HTMLDivElement | null>(null);
  // The focusable card: what Reschedule returns focus to when it was opened from the keyboard or a right-click.
  const activator = useRef<HTMLDivElement | null>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);

  const draggable = isBlockDraggable(block);
  const data = useMemo(() => timelineBlockDragData(block, day), [block, day]);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: blockDragId(block.id),
    data,
    disabled: !draggable,
    attributes: { roleDescription: t("roleDescription") },
  });

  const resize = useBlockResize({
    block,
    day,
    window,
    pxPerMinute,
    disabled: !draggable,
    onKeyChange: (span) =>
      actions.announce(
        t("resizing", { range: format.clockRange(span.startMinutes, span.endMinutes), duration: format.duration(span.endMinutes - span.startMinutes) }),
      ),
  });

  const { span } = resize;
  const duration = span.endMinutes - span.startMinutes;
  const top = blockTop(span.startMinutes, window.startMinutes, pxPerMinute);
  const height = blockHeight(duration, pxPerMinute);
  const short = isShortBlock(height);
  // Tall enough to wrap: a current block on a phone keeps its whole title and meta (PM01).
  const roomy = isRoomyBlock(height);
  const selected = selectedBlockId === block.id;
  const overlap = overlapMinutes !== null;
  const style = blockStyle({ scope: block.scope, kind: block.kind, done: block.done, current, overlap });

  // The check pops once, when this block turns done while on screen.
  const [wasDone, setWasDone] = useState(block.done);
  const [popping, setPopping] = useState(false);
  if (wasDone !== block.done) {
    setWasDone(block.done);
    setPopping(block.done);
  }

  const mergeRoot = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  const mergeActivator = useCallback(
    (node: HTMLDivElement | null) => {
      activator.current = node;
      setActivatorNodeRef(node);
    },
    [setActivatorNodeRef],
  );

  const openDetail = () => {
    if (block.taskId) router.push(taskDetailHref(block.taskId));
  };
  const reschedule = (anchor: HTMLElement | null) => {
    if (!block.done) openReschedule({ kind: "block", id: block.id }, anchor);
  };

  const range = format.clockRange(span.startMinutes, span.endMinutes);
  const scopeLabel = t(`scope.${block.scope}`);
  const labelParts = [
    block.title,
    range,
    format.duration(duration),
    block.energy ? tEnergy("energy", { level: block.energy }) : null,
    block.done ? t("done") : null,
    current ? t("liveNow") : null,
    overlap ? t("overlaps", { duration: format.duration(overlapMinutes) }) : null,
  ].filter((part): part is string => part !== null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // While lifted, Enter and the arrows belong to the drag controller.
    if (isDragging || event.target !== event.currentTarget) return;
    if (resize.onKeyDown(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (block.taskId) openDetail();
      else selectBlock(selected ? null : block.id);
      return;
    }
    // By physical key too, so it still works on a Persian layout.
    if ((event.code === "KeyR" || event.key === "r" || event.key === "R") && !event.ctrlKey && !event.metaKey && !event.altKey && !block.done) {
      event.preventDefault();
      reschedule(activator.current);
      return;
    }
    listeners?.onKeyDown?.(event);
  };

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (block.done) return;
    event.preventDefault();
    // A long-press lifts the block on touch (and the OS then raises a contextmenu): that is not a menu request.
    const touch = (event.nativeEvent as Partial<PointerEvent>).pointerType === "touch";
    if (isDragging || touch) return;
    reschedule(activator.current);
  };

  const meta = metaParts({
    block,
    short,
    current,
    overlapMinutes,
    leftMinutes,
    range,
    duration,
    scopeLabel,
    format,
    t,
  });

  const placement: CSSProperties = { top, height, "--lane": lane.index, "--lanes": lane.count } as CSSProperties;
  const busy = isDragging || resize.active;

  return (
    <div
      ref={mergeRoot}
      data-slot="time-block"
      data-block-id={block.id}
      data-kind={block.kind}
      data-scope={block.scope}
      data-done={block.done || undefined}
      data-current={current || undefined}
      data-overlap={overlap || undefined}
      data-selected={selected || undefined}
      data-short={short || undefined}
      style={placement}
      className={cn(
        "group/block absolute z-1 rounded-[14px]",
        "transition-[top,height] duration-(--motion-standard) ease-(--ease-emphasized) motion-reduce:transition-none",
        // Desktop stacks overlaps at full width; below lg the lanes share it.
        "start-0 end-0",
        lane.count > 1 &&
          "max-lg:end-auto max-lg:w-[calc(100%/var(--lanes))] max-lg:start-[calc(100%*var(--lane)/var(--lanes))]",
        overlap && "z-2",
        current && "z-2",
        busy && "transition-none",
        isDragging && "opacity-40",
        isNew && "animate-pop-in motion-reduce:animate-none",
        resize.active && "z-3",
      )}
    >
      <div
        ref={mergeActivator}
        {...attributes}
        {...(draggable ? listeners : undefined)}
        aria-pressed={selected}
        aria-label={labelParts.join(", ")}
        aria-describedby={draggable ? [attributes["aria-describedby"], BLOCK_HELP_ID].join(" ") : undefined}
        aria-current={current ? "time" : undefined}
        onKeyDown={onKeyDown}
        onBlur={resize.flush}
        onClick={() => selectBlock(selected ? null : block.id)}
        onDoubleClick={openDetail}
        onContextMenu={onContextMenu}
        className={cn(
          "absolute inset-0 flex gap-2.5 overflow-hidden rounded-[14px] px-3 text-start outline-none",
          "touch-manipulation select-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          short ? "items-center py-0" : "items-start py-2",
          selected && !current && "outline-2 outline-offset-1 outline-primary",
          style.root,
        )}
      >
        <span className={cn("flex min-w-0 flex-1", short ? "items-center gap-2" : "flex-col gap-px")}>
          <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px] leading-[1.25] font-bold")}>
            {popping ? (
              <motion.span
                aria-hidden
                className="inline-flex shrink-0 text-primary"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: [0.4, 1.25, 1, 1], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.4, times: [0, 0.14, 0.3, 1] }}
                onAnimationComplete={() => setPopping(false)}
              >
                <Icon icon={Check} size={14} className="stroke-[3]" />
              </motion.span>
            ) : null}
            <span className={cn(roomy ? "line-clamp-2 min-w-0 break-words" : "truncate", style.title)}>
              <bdi dir="auto" className={roomy ? undefined : "inline-block max-w-full truncate align-bottom"}>
                {block.title}
              </bdi>
            </span>
          </span>
          <span className={cn("min-w-0 text-[11px] leading-[1.2] font-semibold", roomy ? "line-clamp-3" : "truncate", style.meta)}>{meta}</span>
        </span>
        <EnergyBars level={block.energy} decorative className={cn("mt-px", short && "mt-0")} />
        {current ? (
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-[11px] font-bold whitespace-nowrap",
              !short && "-mt-0.5",
              style.nowChip,
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-volt" />
            {t("now")}
            <span aria-hidden>·</span>
            <ClockText>{format.clock(nowMinutes)}</ClockText>
          </span>
        ) : null}
        {draggable ? <span aria-hidden className="w-6 shrink-0" /> : null}
      </div>

      {draggable ? (
        <button
          ref={menuButton}
          type="button"
          aria-label={t("reschedule", { title: block.title })}
          onClick={() => reschedule(menuButton.current)}
          className={cn(
            "absolute end-1.5 flex size-6 items-center justify-center rounded-pill text-fg-secondary",
            short ? "top-1/2 -translate-y-1/2" : "top-1.5",
            "bg-surface/80 opacity-0 transition-opacity hover:bg-surface hover:text-fg",
            "group-hover/block:opacity-100 group-focus-within/block:opacity-100 group-data-[selected=true]/block:opacity-100",
            // Touch: an invisible menu button must not swallow taps meant to select the block.
            "pointer-coarse:pointer-events-none pointer-coarse:group-data-[selected=true]/block:pointer-events-auto",
            "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus-ring",
            // A 24px circle with a 44px hit area.
            "after:absolute after:-inset-2.5",
          )}
        >
          <Icon icon={Ellipsis} size={16} />
        </button>
      ) : null}

      {draggable
        ? (["start", "end"] as const).map((edge) => (
            <div
              key={edge}
              aria-hidden
              data-slot="resize-handle"
              data-edge={edge}
              {...resize.handleProps(edge)}
              className={cn(
                "absolute inset-x-3 z-1 flex h-3 cursor-ns-resize touch-none items-center justify-center",
                edge === "start" ? "-top-1.5" : "-bottom-1.5",
                // Touch: handles exist only for the selected block, a 24px hit area just outside its edge,
                // so a short block keeps its body free for the long-press drag and the ⋯ button.
                "pointer-coarse:pointer-events-none pointer-coarse:group-data-[selected=true]/block:pointer-events-auto",
                "pointer-coarse:h-6 pointer-coarse:group-data-[selected=true]/block:h-6",
                edge === "start" ? "pointer-coarse:-top-6 pointer-coarse:items-end" : "pointer-coarse:-bottom-6 pointer-coarse:items-start",
              )}
            >
              <span
                className={cn(
                  "h-1 w-8 rounded-full bg-fg-muted/70 opacity-0 transition-opacity",
                  "group-hover/block:opacity-100 group-data-[selected=true]/block:opacity-100",
                  resize.resizing === edge && "opacity-100",
                )}
              />
            </div>
          ))
        : null}

      {resize.resizing ? (
        <span
          aria-hidden
          data-slot="resize-label"
          className={cn(
            "pointer-events-none absolute end-3 z-3 inline-flex h-6 items-center gap-1.5 rounded-pill bg-fg px-2.5 text-[11px] font-bold whitespace-nowrap text-surface shadow-elevated",
            resize.resizing === "start" ? "-top-3" : "-bottom-3",
          )}
        >
          <ClockText>{range}</ClockText>
          <span>{format.duration(duration)}</span>
        </span>
      ) : null}
    </div>
  );
}

type BlockTranslator = ReturnType<typeof useTranslations<"MyDay.block">>;

/** The second line of a block: "45m · Teams", "09:00 – 11:00 · Personal · done", "overlaps 30m". */
function metaParts(input: {
  block: DayBlock;
  short: boolean;
  current: boolean;
  overlapMinutes: number | null;
  leftMinutes: number | null;
  range: string;
  duration: number;
  scopeLabel: string;
  format: ReturnType<typeof useMyDayFormat>;
  t: BlockTranslator;
}): ReactNode {
  const { block, short, current, overlapMinutes, leftMinutes, range, duration, scopeLabel, format, t } = input;
  const parts: ReactNode[] = [];
  if (overlapMinutes !== null) {
    if (!short) parts.push(format.duration(duration));
    parts.push(t("overlaps", { duration: format.duration(overlapMinutes) }));
  } else if (block.done) {
    parts.push(<ClockText key="range">{range}</ClockText>, scopeLabel, t("done"));
  } else if (current) {
    parts.push(<ClockText key="range">{range}</ClockText>, scopeLabel);
    if (leftMinutes !== null) parts.push(t("left", { duration: format.duration(leftMinutes) }));
  } else {
    parts.push(format.duration(duration), scopeLabel);
  }
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <span aria-hidden> · </span> : null}
      {part}
    </Fragment>
  ));
}
