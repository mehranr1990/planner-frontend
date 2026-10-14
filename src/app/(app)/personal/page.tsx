import type { Metadata } from "next";
import { ContextOverview } from "@/components/shell/context-overview";
import { contextOverviewMetadata } from "../context-metadata";

// Localised from the preferences cookie, so navigating here waits for the
// server (same decision as the root layout): opt out of instant validation.
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return contextOverviewMetadata("personal");
}

export default function PersonalOverviewPage() {
  return <ContextOverview context="personal" />;
}
