import type { Variants } from "motion/react";
import { transitions } from "./transitions";

/*
 * Shared variants. All go `hidden` → `visible` (and `exit` where it applies).
 * `slide` takes `custom` = inlineSign(direction), so it travels toward
 * inline-end in both LTR and RTL.
 */

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.standard },
  exit: { opacity: 0, transition: transitions.fast },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: transitions.standard },
  exit: { opacity: 0, scale: 0.98, transition: transitions.fast },
};

export const slide: Variants = {
  hidden: (sign: 1 | -1 = 1) => ({ opacity: 0, x: -16 * sign }),
  visible: { opacity: 1, x: 0, transition: transitions.standard },
  exit: (sign: 1 | -1 = 1) => ({ opacity: 0, x: 16 * sign, transition: transitions.fast }),
};

export const islandEnter: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transitions.softSpring },
};

/** Pass as `transition` on elements with `layout` / `layoutId`. */
export const morphLayout = transitions.layoutMorph;
