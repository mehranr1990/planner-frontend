import type { Metadata } from "next";
import { ComponentsView } from "@/features/styleguide/components-view";
import { styleguideMetadata } from "../styleguide-metadata";

// Localised from the preferences cookie, so navigating here waits for the
// server (same decision as the root layout): opt out of instant validation.
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return styleguideMetadata("components");
}

export default function StyleguideComponentsPage() {
  return <ComponentsView />;
}
