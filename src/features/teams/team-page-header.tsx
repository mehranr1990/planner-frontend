"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { teamHref } from "@/features/navigation/contexts";
import type { NavItemId } from "@/features/navigation/types";
import { TeamBanner, useTeam } from "./team-gate";

/*
 * Page header for every team screen (same anatomy as Projects): breadcrumb
 * Teams › team › module › resource, title, actions, and the one banner
 * directly under it.
 */
export interface TeamPageHeaderProps {
  module?: NavItemId;
  resource?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function TeamPageHeader({ module, resource, title, subtitle, actions }: TeamPageHeaderProps) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("Teams");
  const { team } = useTeam();
  const items: BreadcrumbItem[] = [
    { label: t("breadcrumb"), href: "/teams" },
    { label: team.name, href: teamHref(team.id) },
  ];
  if (module && module !== "overview") items.push({ label: tNav(`items.${module}`), href: teamHref(team.id, module) });
  if (resource) items.push({ label: resource });
  else items[items.length - 1] = { label: items[items.length - 1]!.label };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        breadcrumb={<Breadcrumbs scope="team" items={items} middleTruncate />}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      <TeamBanner />
    </div>
  );
}
