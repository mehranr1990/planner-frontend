import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { Providers } from "@/app/providers";
import { preferencesForLocale, type Preferences } from "@/features/preferences/preferences-store";

/**
 * English baseline for unit tests, so assertions can read English copy. The
 * product default is Persian (see defaultPreferences); Persian/RTL is tested
 * by passing explicit preferences.
 */
export const testPreferences: Preferences = { ...preferencesForLocale("en"), currency: "toman" };

interface ProvidersRenderOptions extends Omit<RenderOptions, "wrapper"> {
  preferences?: Partial<Preferences>;
}

/**
 * Renders inside the real app providers (theme, preferences, next-intl,
 * Radix direction, motion, tooltips). Defaults to English (testPreferences);
 * pass preferences to test Persian/RTL.
 */
export function renderWithProviders(ui: ReactElement, { preferences, ...options }: ProvidersRenderOptions = {}) {
  const resolved: Preferences = { ...testPreferences, ...preferences };
  return render(ui, {
    wrapper: ({ children }) => <Providers preferences={resolved}>{children}</Providers>,
    ...options,
  });
}
