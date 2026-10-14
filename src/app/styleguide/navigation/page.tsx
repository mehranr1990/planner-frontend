import type { Metadata } from "next";
import { NavigationView } from "@/features/styleguide/navigation-view";
import { styleguideMetadata } from "../styleguide-metadata";

// Localised from the preferences cookie, so navigating here waits for the
// server (same decision as the root layout): opt out of instant validation.
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return styleguideMetadata("navigation");
}

export default function StyleguideNavigationPage() {
  return <NavigationView />;
}
