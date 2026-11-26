import type { ReactElement } from "react";
import { CompanyDataProvider } from "@/data/company-provider";
import { createMockCompanies } from "@/data/mock/mock-companies";
import { renderWithProviders, type ProvidersRenderOptions } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { CompanyGate } from "./company-gate";

/** Renders a company screen inside a fresh mock store and the company gate (Euroly by default). */
export function renderCompanyScreen(
  ui: ReactElement,
  {
    path = "/companies/euroly",
    search = "",
    repository = createMockCompanies(),
    ...options
  }: ProvidersRenderOptions & { path?: string; search?: string; repository?: ReturnType<typeof createMockCompanies> } = {},
) {
  setMockPathname(path);
  setMockSearch(search);
  return {
    repository,
    ...renderWithProviders(
      <CompanyDataProvider repository={repository}>
        <CompanyGate>{ui}</CompanyGate>
      </CompanyDataProvider>,
      options,
    ),
  };
}

/** Desktop (lg) for the duration of a test: editors that are read-only on phones. Returns the restore function. */
export function asDesktop(): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes("min-width") })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}
