"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getApiClient, isLiveApi } from "@/api/runtime";
import { createDayPlans } from "./api/api-day-plans";
import { createApiPlanRepository } from "./api/api-plan-repository";
import { createApiTasksRepository } from "./api/api-tasks-repository";
import { getPlannerToday } from "./clock";
import { createMockRepositories } from "./mock";
import type { Repositories } from "./repositories";

/*
 * The single swap point for data: mount DataProvider once inside the
 * QueryClientProvider. Mock mode serves the in-memory adapter. Live API mode
 * swaps in each integrated module (Phase 01–02: tasks; Phase 03: Day plans) and keeps the mock
 * adapter for the modules that are not integrated yet.
 */

const RepositoriesContext = createContext<Repositories | null>(null);

export function createRepositories(): Repositories {
  const mock = createMockRepositories();
  if (!isLiveApi()) return mock;
  const client = getApiClient();
  const dayPlans = createDayPlans(client);
  const tasks = createApiTasksRepository(client, { today: getPlannerToday, fallback: mock.tasks, dayPlans });
  return {
    ...mock,
    tasks,
    plan: createApiPlanRepository(dayPlans, tasks, mock.plan),
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
