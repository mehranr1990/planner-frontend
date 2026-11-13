"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getApiClient, isLiveApi } from "@/api/runtime";
import { createApiBlocksRepository } from "./api/api-blocks-repository";
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
import { RepositoryError, type BrainDumpRepository, type Repositories } from "./repositories";

/*
 * The single swap point for data: mount DataProvider once inside the
 * QueryClientProvider. Mock mode serves the in-memory adapter. Live API mode
 * swaps in each integrated module (Phase 01–02: tasks; Phase 03: Day plans; Phase 04: calendar blocks; Phase 05+: one module adapter each) and keeps the mock
 * adapter for the modules that are not integrated yet.
 */

const RepositoriesContext = createContext<Repositories | null>(null);

/**
 * Brain Dump has no API model (pages, lines, sort tags), so it stays on the mock in live mode.
 * Its lines must not look sent to the live Inbox: the two cross-overs are refused instead.
 */
function withoutInboxCrossOver(brainDump: BrainDumpRepository): BrainDumpRepository {
  const refuse = () => Promise.reject(new RepositoryError("unsupported", "Brain Dump is not connected to the live Inbox"));
  return {
    ...brainDump,
    sendToInbox: refuse,
    clear: (day, unsorted) => (unsorted === "inbox" ? refuse() : brainDump.clear(day, unsorted)),
  };
}

export function createRepositories(): Repositories {
  const mock = createMockRepositories();
  if (!isLiveApi()) return mock;
  const client = getApiClient();
  const dayPlans = createDayPlans(client);
  const tasks = createApiTasksRepository(client, { today: getPlannerToday, fallback: mock.tasks, dayPlans });
  // The blocks adapter writes Tasks through the unwrapped repository; the UI gets the block-following one.
  const blocks = createApiBlocksRepository(client, { tasks });
  // Goals read linked tasks through the unwrapped repository; the UI's tasks carry their goal link.
  const goals = createApiGoalsRepository(client, { today: getPlannerToday, tasks });
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
    inbox: createApiInboxRepository(client),
    brainDump: withoutInboxCrossOver(mock.brainDump),
    journal: createApiJournalRepository(client, { today: getPlannerToday }),
    finance: createApiFinanceRepository(client, { today: getPlannerToday }),
    insights: createApiInsightsRepository(client),
    review: createApiReviewRepository(client),
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
