"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/design-system/motion/motion-provider";
import { LocaleRoot } from "@/features/preferences/locale-root";
import type { Preferences } from "@/features/preferences/preferences-store";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false },
    },
  });
}

export function Providers({ preferences, children }: { preferences: Preferences; children: ReactNode }) {
  // One client per browser session; never shared between server requests.
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <LocaleRoot preferences={preferences}>
          <MotionProvider>
            <TooltipProvider delayDuration={300}>
              {children}
              <Toaster />
            </TooltipProvider>
          </MotionProvider>
        </LocaleRoot>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
