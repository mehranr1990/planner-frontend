"use client";

import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { useEffect, type ReactNode } from "react";
import { APP_TIME_ZONE } from "@/lib/dates/zone";
import { clientMessages } from "@/messages/client";
import type { Preferences } from "./preferences-store";
import { PreferencesProvider, usePreferences } from "./use-preferences";

function LocaleBridge({ children }: { children: ReactNode }) {
  const { locale, direction } = usePreferences();

  // The server already rendered lang/dir; this keeps <html> in step with
  // in-session changes until the refreshed server render lands.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = direction;
  }, [locale, direction]);

  // Both locales' client namespaces are bundled, so switching language is
  // instant. Server-only strings (Home) are left out, and the styleguide
  // nests its own provider for its namespace (StyleguideMessages).
  return (
    <NextIntlClientProvider locale={locale} messages={clientMessages[locale]} timeZone={APP_TIME_ZONE}>
      <Direction.Provider dir={direction}>{children}</Direction.Provider>
    </NextIntlClientProvider>
  );
}

/** Preferences store + next-intl + Radix direction, seeded by the server. */
export function LocaleRoot({ preferences, children }: { preferences: Preferences; children: ReactNode }) {
  return (
    <PreferencesProvider initial={preferences}>
      <LocaleBridge>{children}</LocaleBridge>
    </PreferencesProvider>
  );
}
