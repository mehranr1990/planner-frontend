"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { MyDayProvider } from "@/features/my-day/my-day-context";
import { MyDayDndProvider } from "@/features/my-day/timeline";
import { myDayStateFixtures, myDayStateNow, type MyDayState } from "@/fixtures/personal/my-day-states";

/*
 * An isolated data stack for one demo state: its own QueryClient and its own
 * in-memory repositories built from the state's fixtures. Mutations (drag,
 * Reschedule, mark done) change only this store, never the app's.
 */

function createDemoQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: false, refetchOnWindowFocus: false } },
  });
}

export function MyDayDemoData({ state, children }: { state: MyDayState; children: ReactNode }) {
  const [queryClient] = useState(createDemoQueryClient);
  const [repositories] = useState(() => createMockRepositories({ fixtures: myDayStateFixtures(state) }));
  return (
    <QueryClientProvider client={queryClient}>
      <DataProvider repositories={repositories}>{children}</DataProvider>
    </QueryClientProvider>
  );
}

/** The state's data plus a My Day provider and drag controller, for pieces of the screen shown on their own (styleguide tiles). */
export function MyDayDemoStack({ state, children }: { state: MyDayState; children: ReactNode }) {
  return (
    <MyDayDemoData state={state}>
      <MyDayProvider syncUrl={false} now={myDayStateNow(state)}>
        <MyDayDndProvider>{children}</MyDayDndProvider>
      </MyDayProvider>
    </MyDayDemoData>
  );
}
