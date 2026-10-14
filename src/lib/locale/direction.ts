export type Direction = "ltr" | "rtl";

const RTL_LANGUAGES = new Set(["fa", "ar", "he", "ur", "ps", "ckb", "yi"]);

/** Writing direction for a BCP 47 tag, decided by its base language. */
export function getDirection(locale: string): Direction {
  const language = locale.toLowerCase().split(/[-_]/)[0] ?? "";
  return RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
}

export function isRtl(locale: string): boolean {
  return getDirection(locale) === "rtl";
}

/**
 * Sign for physical transforms (Motion `x`, translateX) that must follow the
 * inline axis: +1 moves toward inline-end in LTR, -1 in RTL.
 */
export function inlineSign(direction: Direction): 1 | -1 {
  return direction === "rtl" ? -1 : 1;
}

/** Mirror an x coordinate inside a box of `width` for RTL geometry. */
export function mirrorX(x: number, width: number, direction: Direction): number {
  return direction === "rtl" ? width - x : x;
}

/**
 * Icon mirroring rules from FaRules. Directional meaning mirrors; real-world
 * objects, symbols and data axes do not.
 */
export const iconMirroring = {
  mirror: ["chevron", "arrow", "undo", "redo", "send", "list-indent", "panel"],
  keep: ["search", "plus", "play", "clock", "check", "chart-axis", "keyboard-shortcut"],
} as const;
