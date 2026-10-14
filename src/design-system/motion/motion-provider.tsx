"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { transitions } from "./transitions";

/** App-wide Motion defaults; honours the OS reduced-motion setting. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={transitions.standard}>
      {children}
    </MotionConfig>
  );
}
