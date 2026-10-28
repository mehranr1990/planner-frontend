import { KeyboardSensor, type KeyboardSensorProps } from "@dnd-kit/core";

/*
 * dnd-kit's KeyboardSensor treats every arrow key as a relative step and, when
 * the page can scroll, "helps" by scrolling the page and cancelling that much
 * of the card's move. This screen's coordinate getter returns the absolute
 * position of the target instead (a jump from the rail to the timeline), so
 * with a scrollable page the lifted card froze after the first key. This
 * sensor hides the scrollable ancestors from the base class: it only moves
 * the card, and the coordinate getter scrolls the target into view itself.
 */
export class DayKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    const source = props.context;
    super({
      ...props,
      context: {
        get current() {
          return { ...source.current, scrollableAncestors: [] };
        },
        set current(value) {
          source.current = value;
        },
      },
    });
  }
}

/** The room kept between a revealed target and the edge of its scroll area. */
const REVEAL_MARGIN_PX = 96;

/**
 * Scrolls the phone's timeline scroller and then the page, instantly, so the
 * band [top, top + height] is comfortably visible. Returns nothing: callers
 * re-read the target's position afterwards.
 */
export function revealBand(top: number, height: number): void {
  if (typeof document === "undefined") return;
  const scroller = document.querySelector<HTMLElement>('[data-slot="timeline-scroller"]');
  if (scroller && scroller.clientHeight > 0) {
    const rect = scroller.getBoundingClientRect();
    const overflow =
      top < rect.top
        ? top - rect.top - REVEAL_MARGIN_PX / 2
        : top + height > rect.bottom
          ? top + height - rect.bottom + REVEAL_MARGIN_PX / 2
          : 0;
    if (overflow !== 0) scroller.scrollBy({ top: overflow, behavior: "instant" });
  }
  const viewport = window.innerHeight;
  if (top < REVEAL_MARGIN_PX || top + height > viewport - REVEAL_MARGIN_PX) {
    window.scrollBy({ top: top + height / 2 - viewport / 2, behavior: "instant" });
  }
}
