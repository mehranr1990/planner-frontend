"use client";

import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { styleguideMessages } from "@/messages/styleguide";

/**
 * Adds the Styleguide namespace for the styleguide pages only, so its
 * catalogue never ships in other routes' client bundles.
 *
 * A nested IntlProvider replaces `messages` rather than merging them
 * (use-intl: `messages === undefined ? prevContext.messages : messages`),
 * so the parent's namespaces are spread in. Locale, time zone, formats and
 * the formatter cache are inherited from the root provider.
 */
export function StyleguideMessages({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const parent = useMessages();
  const messages = useMemo(() => ({ ...parent, Styleguide: styleguideMessages[locale] }), [parent, locale]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
