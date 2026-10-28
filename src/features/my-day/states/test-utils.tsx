/*
 * Test helpers for the header, reschedule and state components: render inside
 * the app providers with an isolated mock store per demo state and a My Day
 * provider that does not touch the URL. Tests only.
 */

import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { DataProvider } from "@/data/provider";
import { createMockRepositories } from "@/data/mock";
import type { Repositories } from "@/data/repositories";
import type { EnergyLevel } from "@/data/domain";
import type { PlannerSettings } from "@/features/planner-settings/planner-settings";
import type { Preferences } from "@/features/preferences/preferences-store";
import { preferencesForLocale } from "@/features/preferences/preferences-store";
import { myDayStateFixtures, type MyDayState } from "@/fixtures/personal/my-day-states";
import { renderWithProviders } from "@/test/render";
import { MyDayProvider, useMyDay, type MyDayView } from "../my-day-context";

export interface RenderMyDayOptions {
  state?: MyDayState;
  preferences?: Partial<Preferences>;
  plannerSettings?: PlannerSettings;
  initialDay?: string;
  initialView?: MyDayView;
  initialEnergy?: EnergyLevel;
  /** Replaces the state's mock store (e.g. one with latency). */
  repositories?: Repositories;
}

/** Persian, RTL, Persian digits, Jalali: the product default. */
export const persian: Partial<Preferences> = preferencesForLocale("fa");

/** English with the Jalali calendar (the product default calendar), as the boards print it. */
const jalaliEnglish: Partial<Preferences> = { calendar: "jalali" };

export function renderMyDay(ui: ReactElement, options: RenderMyDayOptions = {}) {
  const repositories =
    options.repositories ?? createMockRepositories({ fixtures: myDayStateFixtures(options.state ?? "normal") });
  const result = renderWithProviders(
    <DataProvider repositories={repositories}>
      <MyDayProvider
        syncUrl={false}
        initialDay={options.initialDay}
        initialView={options.initialView}
        initialEnergy={options.initialEnergy}
      >
        {ui}
      </MyDayProvider>
    </DataProvider>,
    { preferences: { ...jalaliEnglish, ...options.preferences }, plannerSettings: options.plannerSettings },
  );
  return { ...result, repositories };
}

/** Prints the parts of the My Day context a test wants to read back. */
export function ContextProbe() {
  const { day, energy, reschedule } = useMyDay();
  return (
    <output data-testid="probe">
      {JSON.stringify({
        day,
        energy,
        target: reschedule?.target ?? null,
        preselect: reschedule?.preselect ?? null,
        anchorRole: reschedule?.anchor?.getAttribute("role") ?? null,
      })}
    </output>
  );
}

export function readProbe(): {
  day: string;
  energy: EnergyLevel;
  target: unknown;
  preselect: string | null;
  /** The role of the element Reschedule will return focus to. */
  anchorRole: string | null;
} {
  return JSON.parse(screen.getByTestId("probe").textContent ?? "{}");
}

/** matchMedia that answers the lg breakpoint query; the setup file's stub says "mobile" for everything. */
export function mockViewport(width: "desktop" | "mobile") {
  const matches = width === "desktop";
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("min-width") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
