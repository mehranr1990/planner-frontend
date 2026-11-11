"use client";

import { useTranslations } from "next-intl";
import { UnavailableState } from "@/components/feedback/state-views";
import type { NavItemId } from "@/features/navigation/types";
import { useTeam } from "./team-gate";
import { TeamPageHeader } from "./team-page-header";

/*
 * Team screens not built yet render the "coming soon" page state until their
 * prompt (TS-01: routes /teams/[id]/… exist from T1). Unknown segments 404.
 */
export function TeamModulePlaceholder({ module }: { module: NavItemId }) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("Teams.comingSoon");
  const { team } = useTeam();
  const label = module === "overview" ? team.name : tNav(`items.${module}`);
  return (
    <>
      <TeamPageHeader module={module} title={label} />
      <UnavailableState title={t("title", { module: label })} description={t("description")} titleAs="h2" />
    </>
  );
}
