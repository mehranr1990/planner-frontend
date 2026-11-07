"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isLiveApi } from "@/api/runtime";
import { DataProvider } from "@/data/provider";
import { handleApiErrorGlobally } from "@/features/auth/session";
import { MotionProvider } from "@/design-system/motion/motion-provider";
import { DEFAULT_PLANNER_SETTINGS, type PlannerSettings } from "@/features/planner-settings/planner-settings";
import { PlannerSettingsProvider } from "@/features/planner-settings/use-planner-settings";
import { LocaleRoot } from "@/features/preferences/locale-root";
import type { Preferences } from "@/features/preferences/preferences-store";

function createQueryClient() {
  // Live API: a 401 from any query or mutation ends the session (clears caches, goes to sign-in).
  const onError = (error: unknown, meta?: Record<string, unknown>) => {
    if (isLiveApi()) handleApiErrorGlobally(client, error, meta);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => onError(error, query.meta) }),
    mutationCache: new MutationCache({ onError: (error, _variables, _context, mutation) => onError(error, mutation.meta) }),
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false },
    },
  });
  return client;
}

interface ProvidersProps {
  preferences: Preferences;
  /** Server-resolved planner settings; defaults (nothing hidden) when omitted, e.g. the styleguide's tests. */
  plannerSettings?: PlannerSettings;
  children: ReactNode;
}

export function Providers({ preferences, plannerSettings = DEFAULT_PLANNER_SETTINGS, children }: ProvidersProps) {
  // One client per browser session; never shared between server requests.
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {/* The data seam: mock repositories until the API client replaces them. */}
        <DataProvider>
          <LocaleRoot preferences={preferences}>
            <PlannerSettingsProvider initial={plannerSettings}>
              <MotionProvider>
                <TooltipProvider delayDuration={300}>
                  {children}
                  <Toaster />
                </TooltipProvider>
              </MotionProvider>
            </PlannerSettingsProvider>
          </LocaleRoot>
        </DataProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
