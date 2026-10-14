"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createMockRepositories } from "./mock";
import type { Repositories } from "./repositories";

/*
 * The single swap point for data: mount DataProvider once inside the
 * QueryClientProvider. Today it serves the mock adapter; pass a typed API
 * client (or an offline store) implementing Repositories to swap it.
 */

const RepositoriesContext = createContext<Repositories | null>(null);

export function DataProvider({ repositories, children }: { repositories?: Repositories; children: ReactNode }) {
  // Read once on mount, like the QueryClient: query caches assume one source.
  const [value] = useState(() => repositories ?? createMockRepositories());
  return <RepositoriesContext.Provider value={value}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);
  if (!repositories) throw new Error("useRepositories must be used inside <DataProvider>.");
  return repositories;
}
