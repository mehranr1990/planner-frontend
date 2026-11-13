"use client";

import { useTranslations } from "next-intl";
import type { ProjectHealth, ProjectLifecycle, ProjectRole } from "@/data/project-domain";

/** Translated role / status / lifecycle labels shared by every Project surface (ContextShell namespace). */
export function useProjectLabels() {
  const t = useTranslations("ContextShell");
  return {
    role: (role: ProjectRole) => t(`roles.${role}`),
    /** null = unknown (no approved health definition in live mode). */
    health: (health: ProjectHealth | null) => t(health ? `health.${health}` : "health.unknown"),
    lifecycle: (lifecycle: ProjectLifecycle) => t(`lifecycle.${lifecycle}`),
  };
}
