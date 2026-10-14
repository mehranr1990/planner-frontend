import type { Transition } from "motion/react";
import { duration, easing, spring } from "../tokens/motion";

export type MotionTokenName = "instant" | "fast" | "standard" | "slow" | "softSpring" | "layoutMorph";

export const transitions: Record<MotionTokenName, Transition> = {
  instant: { duration: duration.instant, ease: easing.standard },
  fast: { duration: duration.fast, ease: easing.standard },
  standard: { duration: duration.standard, ease: easing.standard },
  slow: { duration: duration.slow, ease: easing.emphasized },
  softSpring: { ...spring.soft },
  layoutMorph: { ...spring.layoutMorph },
};
