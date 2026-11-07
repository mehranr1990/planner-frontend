"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { projectHref } from "@/features/navigation/contexts";
import type { NavItemId } from "@/features/navigation/types";
import { ProjectBanner, useProject } from "./project-gate";

/*
 * Page header for every project screen: the SH01 breadcrumb (Projects ›
 * project › module › resource; long names truncate in the middle on phones),
 * title, actions, and the one SH-02 banner directly under it.
 */
export interface ProjectPageHeaderProps {
  /** Module of the page; omitted on the project overview. */
  module?: NavItemId;
  /** The resource after the module (e.g. a task title). */
  resource?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function ProjectPageHeader({ module, resource, title, subtitle, actions }: ProjectPageHeaderProps) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("ContextShell.breadcrumb");
  const { project } = useProject();
  const items: BreadcrumbItem[] = [
    { label: t("projects"), href: "/projects" },
    { label: project.name, href: projectHref(project.id) },
  ];
  if (module && module !== "overview")
    items.push({
      label: tNav(`items.${module}`),
      href: projectHref(project.id, module),
    });
  if (resource) items.push({ label: resource });
  else items[items.length - 1] = { label: items[items.length - 1]!.label };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        breadcrumb={<Breadcrumbs scope="project" items={items} middleTruncate />}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      <ProjectBanner />
    </div>
  );
}
