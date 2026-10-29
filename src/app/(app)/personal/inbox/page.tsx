import { Suspense } from "react";
import type { Metadata } from "next";
import { InboxScreen } from "@/features/inbox/inbox-screen";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("inbox");
}

/** P07 · Inbox. ?tab=snoozed|archived is read by the screen. */
export default function InboxPage() {
  return (
    // Inbox is a core module (never hidden); the gate keeps every Personal page on one rule.
    <ModuleGate module="inbox">
      <Suspense fallback={null}>
        <InboxScreen />
      </Suspense>
    </ModuleGate>
  );
}
