import type { Metadata } from "next";
import { StyleguideView } from "@/features/styleguide/styleguide-view";
import { styleguideMetadata } from "./styleguide-metadata";

// Localised from the preferences cookie, so navigating here waits for the
// server (same decision as the root layout): opt out of instant validation.
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return styleguideMetadata("foundations");
}

export default function StyleguidePage() {
  return <StyleguideView />;
}
