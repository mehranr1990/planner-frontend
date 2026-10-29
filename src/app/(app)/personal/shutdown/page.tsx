import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { ShutdownScreen } from "@/features/shutdown/shutdown-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("shutdown");
}

/** P10 · Daily shutdown: a contextual flow (no nav item). ?step=tomorrow|reflect is read by the screen. */
export default function DailyShutdownPage() {
  return (
    <Suspense fallback={null}>
      <ShutdownScreen />
    </Suspense>
  );
}
