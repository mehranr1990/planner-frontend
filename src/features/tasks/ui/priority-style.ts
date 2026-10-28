import type { TaskPriority } from "@/data/domain";

/*
 * Priority marks from design tokens only, so light and dark both follow.
 * Urgent is red, High amber, Medium blue, Low neutral grey. The mark is
 * always a dot AND a word (`label`), never colour alone, and the label text
 * uses the "text" tokens, which clear AA on the list's white surface in both
 * themes. Class strings are written out in full so Tailwind sees them.
 *
 *   dot    the 8px dot
 *   label  the word beside it (text colour only)
 *   chip   soft pill (filters, inline editor, bulk menu): tinted surface + text token
 */

export interface PriorityStyle {
  dot: string;
  label: string;
  chip: string;
}

export const PRIORITY_STYLE: Record<TaskPriority | "none", PriorityStyle> = {
  urgent: {
    dot: "bg-danger",
    label: "text-danger-text",
    chip: "bg-danger-soft text-danger-text",
  },
  high: {
    dot: "bg-warning",
    label: "text-warning-text",
    chip: "bg-warning-soft text-warning-text",
  },
  medium: {
    dot: "bg-project-dot",
    label: "text-info-text",
    chip: "bg-info-soft text-info-text",
  },
  low: {
    dot: "bg-fg-muted",
    label: "text-fg-secondary",
    chip: "bg-subtle text-fg-secondary",
  },
  none: {
    dot: "bg-outline",
    label: "text-fg-muted",
    chip: "bg-subtle text-fg-muted",
  },
};

export function priorityStyle(priority: TaskPriority | null): PriorityStyle {
  return PRIORITY_STYLE[priority ?? "none"];
}
