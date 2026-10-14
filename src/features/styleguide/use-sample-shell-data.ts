"use client";

import { useMemo } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { getSampleShellData, type SampleShellData } from "@/fixtures/shell";

/** Sample shell content (workspaces, schedule) in the current UI language. */
export function useSampleShellData(): SampleShellData {
  const { locale } = usePreferences();
  return useMemo(() => getSampleShellData(locale), [locale]);
}
