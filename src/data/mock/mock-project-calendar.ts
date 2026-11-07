import { sampleMyBusy, sampleProjectEvents } from "@/fixtures/project-work";
import type { ProjectCalendarItem, ProjectTask } from "../project-domain";
import type { ProjectAccessOptions, ProjectCalendarRepository } from "../project-repositories";
import { isMine, isTaskDone, type ProjectWorkStore } from "./mock-project-work";

/*
 * Project calendar for the mock adapter (PJ-07): the project as one layer —
 * task due dates (guests: only tasks shared with them), milestones and
 * project events. `myBusy` serves only the current user's own busy blocks,
 * untitled (the A07 projection; nothing about other people).
 */

export interface MockProjectCalendarOptions {
  store: ProjectWorkStore;
  respond<T>(value: T): Promise<T>;
  /** The current user's role (guest = only shared tasks); undefined = no access. */
  roleOf(projectId: string, options?: ProjectAccessOptions): string | undefined;
  withCan(task: ProjectTask, options?: ProjectAccessOptions): ProjectTask;
}

export function createMockProjectCalendar({ store, respond, roleOf, withCan }: MockProjectCalendarOptions) {
  const calendar: ProjectCalendarRepository = {
    range(projectId, from, to, options) {
      const role = roleOf(projectId, options);
      const within = (day: string) => day >= from && day <= to;
      const workflow = store.workflow(projectId);
      const tasks: ProjectCalendarItem[] = (store.tasks.get(projectId) ?? [])
        .filter((task) => task.due !== null && within(task.due) && !isTaskDone(task, workflow))
        .filter((task) => role !== "guest" || isMine(task))
        .map((task) => ({ id: `task:${task.id}`, kind: "task", day: task.due!, title: task.title, task: withCan(task, options) }));
      const milestones: ProjectCalendarItem[] =
        role === "guest"
          ? []
          : (store.milestones.get(projectId) ?? [])
              .filter((milestone) => within(milestone.due))
              .map((milestone) => ({
                id: `milestone:${milestone.id}`,
                kind: "milestone",
                day: milestone.due,
                title: milestone.title,
                milestoneId: milestone.id,
              }));
      const events: ProjectCalendarItem[] =
        role === "guest" || projectId !== "website-redesign"
          ? []
          : sampleProjectEvents
              .filter((event) => within(event.day))
              .map((event) => ({ id: `event:${event.id}`, kind: "event", day: event.day, title: event.title, time: event.time, invited: event.invited }));
      return respond([...events, ...milestones, ...tasks]);
    },
    myBusy: (from, to) => respond(sampleMyBusy.filter((slot) => slot.day >= from && slot.day <= to)),
  };
  return { calendar };
}
