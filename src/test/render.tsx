import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { Providers } from "@/app/providers";
import { defaultPreferences, type Preferences } from "@/features/preferences/preferences-store";

interface ProvidersRenderOptions extends Omit<RenderOptions, "wrapper"> {
  preferences?: Partial<Preferences>;
}

/**
 * Renders inside the real app providers (theme, preferences, next-intl,
 * Radix direction, motion, tooltips). Pass preferences to test Persian/RTL.
 */
export function renderWithProviders(ui: ReactElement, { preferences, ...options }: ProvidersRenderOptions = {}) {
  const resolved: Preferences = { ...defaultPreferences, ...preferences };
  return render(ui, {
    wrapper: ({ children }) => <Providers preferences={resolved}>{children}</Providers>,
    ...options,
  });
}
