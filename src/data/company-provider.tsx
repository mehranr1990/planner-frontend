"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getApiClient, isLiveApi } from "@/api/runtime";
import { createApiCompanyRepository } from "./api/api-company-repository";
import type { CompanyRepository } from "./company-repositories";
import { createMockCompanies } from "./mock/mock-companies";

/*
 * Companies data source (Phase 4). Mock Mode: the typed mock adapter. Live
 * API mode: the HTTP adapter (`api/api-company-repository.ts`) — never mock
 * data; what the API cannot serve is refused ("unsupported"). Kept apart from
 * the Personal / Project / Team `Repositories` so it can never write to them.
 * Tests wrap with <CompanyDataProvider repository={…}> for a fresh store.
 */

const CompanyRepositoryContext = createContext<CompanyRepository | null>(null);

let shared: CompanyRepository | null = null;

const createCompanies = (): CompanyRepository => (isLiveApi() ? createApiCompanyRepository(getApiClient()) : createMockCompanies());

export function CompanyDataProvider({ repository, children }: { repository?: CompanyRepository; children: ReactNode }) {
  const [value] = useState(() => repository ?? createCompanies());
  return <CompanyRepositoryContext.Provider value={value}>{children}</CompanyRepositoryContext.Provider>;
}

export function useCompanyRepository(): CompanyRepository {
  const repository = useContext(CompanyRepositoryContext);
  if (repository) return repository;
  shared ??= createCompanies();
  return shared;
}
