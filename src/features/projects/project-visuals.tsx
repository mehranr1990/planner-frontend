"use client";

import { Circle } from "lucide-react";
import { StatusChip } from "@/design-system/feedback/status-chip";
import type { StatusTone } from "@/design-system/tokens/colors";
import type { ProjectHealth, ProjectLifecycle, ProjectTint } from "@/data/project-domain";
import { cn } from "@/lib/cn";
import { useProjectLabels } from "./labels";

/*
 * Small visuals shared by Project screens: the initials tile (the project's
 * own colour) and the status chip (On track / At risk / Off track from a
 * Manager, Paused / Archived from the lifecycle). Status is never colour
 * alone: the chip always carries its label.
 */

const TINTS: Record<ProjectTint, string> = {
  blue: "bg-project-soft text-project-deep",
  indigo: "bg-team-soft text-team-deep",
  amber: "bg-warning-soft text-warning-text",
  purple: "bg-company-soft text-company-deep",
};

export function ProjectTile({
  initials,
  tint,
  size = "md",
  muted = false,
  className,
}: {
  initials: string;
  tint: ProjectTint;
  size?: "sm" | "md";
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-tile font-bold",
        size === "md" ? "size-11 text-sm" : "size-9 text-xs",
        TINTS[tint],
        muted && "opacity-70",
        className,
      )}
    >
      <bdi>{initials}</bdi>
    </span>
  );
}

const HEALTH_TONE: Record<ProjectHealth, StatusTone> = {
  "on-track": "success",
  "at-risk": "warning",
  "off-track": "danger",
};

/** The project's status chip: lifecycle (paused/archived) wins over the manual health. */
export function ProjectStatusChip({
  health,
  lifecycle,
  className,
}: {
  health: ProjectHealth | null;
  lifecycle: ProjectLifecycle;
  className?: string;
}) {
  const labels = useProjectLabels();
  const tone: StatusTone = lifecycle === "active" && health ? HEALTH_TONE[health] : "neutral";
  const label = lifecycle === "active" ? labels.health(health) : labels.lifecycle(lifecycle);
  return (
    <StatusChip tone={tone} className={cn("shrink-0", className)}>
      <Circle aria-hidden size={7} className="fill-current" strokeWidth={0} />
      {label}
    </StatusChip>
  );
}
