"use client";

import { useTranslations } from "next-intl";
import { AccessState } from "@/components/feedback/access-state";
import { UnavailableState } from "@/components/feedback/state-views";
import type { NavItemId } from "@/features/navigation/types";
import { ProjectPageHeader } from "./project-page-header";
import { useProject } from "./project-gate";

/*
 * Project modules not built yet render the "coming soon" page state
 * (UnavailableState, the hourglass) until their prompt. Unknown segments are
 * a 404. Page-level demo states (empty, filtered, pending, conflict, quota)
 * show the SH-02 templates here so every state stays reachable.
 */

/** /projects/[id]/<segment> placeholder; the route resolves the segment (unknown = 404). */
export function ProjectModulePlaceholder({ module }: { module: NavItemId }) {
  return <Placeholder module={module} />;
}

function Placeholder({ module }: { module: NavItemId }) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("ContextShell.comingSoon");
  const { demo } = useProject();
  const label = tNav(`items.${module}`);
  const pageState =
    demo === "empty" || demo === "filtered" || demo === "pending" || demo === "conflict" || demo === "quota"
      ? demo
      : null;
  return (
    <>
      <ProjectPageHeader module={module} title={label} />
      {pageState ? <AccessState kind={pageState} titleAs="h2" /> : null}
      <UnavailableState title={t("title", { module: label })} description={t("description")} titleAs="h2" />
    </>
  );
}
