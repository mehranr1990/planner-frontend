"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getApiClient, isLiveApi } from "@/api/runtime";
import { createApiBillsRepository, createApiFinanceReportsRepository } from "./api/api-bills-repository";
import { createApiBlocksRepository } from "./api/api-blocks-repository";
import { createApiNotificationsRepository } from "./api/api-notifications-repository";
import { createApiRemindersRepository } from "./api/api-reminders-repository";
import { createApiRoutinesRepository } from "./api/api-routines-repository";
import { createApiTaskFilesRepository } from "./api/api-task-files-repository";
import { createApiBrainDumpRepository } from "./api/api-brain-dump-repository";
import { createApiFinanceRepository } from "./api/api-finance-repository";
import { createApiFocus } from "./api/api-focus";
import { createApiGoalsRepository, withGoalLinks } from "./api/api-goals-repository";
import { createApiInboxRepository } from "./api/api-inbox-repository";
import { createApiInsightsRepository } from "./api/api-insights-repository";
import { createApiJournalRepository } from "./api/api-journal-repository";
import { createApiHabitsRepository } from "./api/api-habits-repository";
import { createDayPlans } from "./api/api-day-plans";
import { createApiPlanRepository } from "./api/api-plan-repository";
import { createApiProjectRepositories } from "./api/api-project-repositories";
import { createApiTeamRepositories } from "./api/api-team-repositories";
import { createApiReviewRepository } from "./api/api-review-repository";
import { withBlockFollow } from "./api/api-task-block-follow";
import { createApiTasksRepository } from "./api/api-tasks-repository";
import { getPlannerToday } from "./clock";
import { createMockRepositories } from "./mock";
import type { Repositories } from "./repositories";

/*
 * The single swap point for data: mount DataProvider once inside the
 * QueryClientProvider. Mock mode serves the in-memory adapter. Live API mode
 * swaps in each integrated module (Phase 01–02: tasks; Phase 03: Day plans; Phase 04: calendar blocks; Phase 05+: one module adapter each) and keeps the mock
 * adapter for the modules that are not integrated yet.
 */

const RepositoriesContext = createContext<Repositories | null>(null);

export function createRepositories(): Repositories {
  const mock = createMockRepositories();
  if (!isLiveApi()) return mock;
  const client = getApiClient();
  const dayPlans = createDayPlans(client);
  const tasks = createApiTasksRepository(client, { today: getPlannerToday, dayPlans });
  // The blocks adapter writes Tasks through the unwrapped repository; the UI gets the block-following one.
  const blocks = createApiBlocksRepository(client, { tasks });
  // Goals read linked tasks through the unwrapped repository; the UI's tasks carry their goal link.
  const goals = createApiGoalsRepository(client, { today: getPlannerToday, tasks });
  const inbox = createApiInboxRepository(client);
  return {
    ...mock,
    // Projects: only what the contract answers truthfully; the rest is refused, never mock data.
    ...createApiProjectRepositories(client, { today: getPlannerToday }),
    // Teams: same rule; the mock Teams adapters are never served in live mode.
    ...createApiTeamRepositories(client),
    tasks: withGoalLinks(withBlockFollow(tasks, blocks.followTask), goals),
    blocks,
    plan: createApiPlanRepository(dayPlans, tasks, createApiFocus(client)),
    habits: createApiHabitsRepository(client, { today: getPlannerToday }),
    goals,
    inbox,
    brainDump: createApiBrainDumpRepository(client, { today: getPlannerToday, inbox }),
    journal: createApiJournalRepository(client, { today: getPlannerToday }),
    finance: createApiFinanceRepository(client, { today: getPlannerToday }),
    insights: createApiInsightsRepository(client),
    review: createApiReviewRepository(client),
    // Personal services (gap closure): API only in live mode, never the mock stores.
    notifications: createApiNotificationsRepository(client),
    reminders: createApiRemindersRepository(client),
    routines: createApiRoutinesRepository(client),
    taskFiles: createApiTaskFilesRepository(client),
    bills: createApiBillsRepository(client),
    financeReports: createApiFinanceReportsRepository(client),
  };
}

export function DataProvider({ repositories, children }: { repositories?: Repositories; children: ReactNode }) {
  // Read once on mount, like the QueryClient: query caches assume one source.
  const [value] = useState(() => repositories ?? createRepositories());
  return <RepositoriesContext.Provider value={value}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);
  if (!repositories) throw new Error("useRepositories must be used inside <DataProvider>.");
  return repositories;
}
