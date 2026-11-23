import { addDaysToDay, diffDays, weekdayOfDay } from "@/lib/dates/clock-time";
import type { ProjectCapacityDay, ProjectMemberCapacity } from "../project-domain";
import type { ProjectCapacityRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";

/*
 * Mock member capacity: no owning Team in the fixtures, so inherited weekdays
 * use the default (Sat–Wed 480 min, Thu / Fri 0). Allocations are empty here
 * (the mock keeps no dated per-day work); revisions behave like the API.
 */

const DEFAULT_MINUTES = [480, 480, 480, 480, 0, 0, 480] as const;

export function createMockProjectCapacityRepository(): ProjectCapacityRepository {
  const store = new Map<string, ProjectMemberCapacity>();
  const key = (projectId: string, personId: string) => `${projectId}:${personId}`;
  const read = (projectId: string, personId: string): ProjectMemberCapacity => store.get(key(projectId, personId)) ?? { personId, template: null, revision: 1 };
  return {
    template: async (projectId, personId) => structuredClone(read(projectId, personId)),
    saveTemplate: async (projectId, current, template) => {
      const stored = read(projectId, current.personId);
      if (stored.revision !== current.revision) throw new RepositoryError("conflict", "Changed elsewhere");
      if (template && (template.weekdays.length !== 7 || template.weekdays.some((m) => m !== null && (!Number.isInteger(m) || m < 0 || m > 1440))))
        throw new RepositoryError("invalid", "weekdays");
      const next: ProjectMemberCapacity = { personId: current.personId, template: template ? structuredClone(template) : null, revision: stored.revision + 1 };
      store.set(key(projectId, current.personId), next);
      return structuredClone(next);
    },
    effective: async (projectId, personId, range) => {
      const { template } = read(projectId, personId);
      const days: ProjectCapacityDay[] = [];
      for (let at = 0; at < diffDays(range.from, range.to); at += 1) {
        const date = addDaysToDay(range.from, at);
        const weekday = weekdayOfDay(date);
        const own = template && date >= template.effectiveFrom ? template.weekdays[weekday] : null;
        const capacityMinutes = own ?? DEFAULT_MINUTES[weekday];
        days.push({ date, capacityMinutes, allocatedMinutes: 0, overbookedMinutes: 0, taskCount: 0, estimatedMinutes: 0, unknownEstimates: 0 });
      }
      return days;
    },
  };
}
