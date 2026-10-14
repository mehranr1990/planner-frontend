import type { Direction } from "@/lib/locale/direction";

/*
 * Geometry for the notched card (design guide §4). Pure, so the Step 2
 * <NotchedCard> only adds measuring (ResizeObserver) and clip-path wiring.
 * The notch sits top-right in LTR and top-left in RTL.
 */

export interface NotchGeometry {
  width: number;
  height: number;
  /** Outer corner radius. */
  radius?: number;
  notchWidth?: number;
  notchHeight?: number;
  /** Concave fillet radius where the notch meets the card. */
  fillet?: number;
  direction?: Direction;
}

type Segment =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "A"; r: number; sweep: 0 | 1; x: number; y: number };

function serialize(segments: Segment[], width: number, direction: Direction): string {
  const mirror = direction === "rtl";
  const x = (value: number) => (mirror ? width - value : value);
  const parts = segments.map((segment) => {
    if (segment.type === "A") {
      const sweep = mirror ? 1 - segment.sweep : segment.sweep;
      return `A ${segment.r} ${segment.r} 0 0 ${sweep} ${x(segment.x)} ${segment.y}`;
    }
    return `${segment.type} ${x(segment.x)} ${segment.y}`;
  });
  return `${parts.join(" ")} Z`;
}

function roundedRect(W: number, H: number, C: number): Segment[] {
  return [
    { type: "M", x: C, y: 0 },
    { type: "L", x: W - C, y: 0 },
    { type: "A", r: C, sweep: 1, x: W, y: C },
    { type: "L", x: W, y: H - C },
    { type: "A", r: C, sweep: 1, x: W - C, y: H },
    { type: "L", x: C, y: H },
    { type: "A", r: C, sweep: 1, x: 0, y: H - C },
    { type: "L", x: 0, y: C },
    { type: "A", r: C, sweep: 1, x: C, y: 0 },
  ];
}

/** True when the box is large enough to hold the notch without overlapping corners. */
export function canNotch({
  width: W,
  height: H,
  radius: C = 32,
  notchWidth: nw = 64,
  notchHeight: nh = 64,
  fillet: f = 30,
}: NotchGeometry): boolean {
  return f * 2 <= Math.min(nw, nh) && W - nw - f >= C && nh + f <= H - C;
}

/**
 * SVG path for `clip-path: path()`. Falls back to a plain rounded rectangle
 * when the box is too small to notch (e.g. while it is still being measured).
 */
export function notchPath(geometry: NotchGeometry): string {
  const {
    width: W,
    height: H,
    radius: C = 32,
    notchWidth: nw = 64,
    notchHeight: nh = 64,
    fillet: f = 30,
    direction = "ltr",
  } = geometry;

  if (!canNotch(geometry)) {
    return serialize(roundedRect(W, H, Math.min(C, W / 2, H / 2)), W, direction);
  }

  return serialize(
    [
      { type: "M", x: C, y: 0 },
      { type: "L", x: W - nw - f, y: 0 },
      { type: "A", r: f, sweep: 1, x: W - nw, y: f },
      { type: "L", x: W - nw, y: nh - f },
      { type: "A", r: f, sweep: 0, x: W - nw + f, y: nh },
      { type: "L", x: W - f, y: nh },
      { type: "A", r: f, sweep: 1, x: W, y: nh + f },
      { type: "L", x: W, y: H - C },
      { type: "A", r: C, sweep: 1, x: W - C, y: H },
      { type: "L", x: C, y: H },
      { type: "A", r: C, sweep: 1, x: 0, y: H - C },
      { type: "L", x: 0, y: C },
      { type: "A", r: C, sweep: 1, x: C, y: 0 },
    ],
    W,
    direction,
  );
}
