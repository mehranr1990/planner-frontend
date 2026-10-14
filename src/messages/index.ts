import type { Locale } from "@/lib/locale/config";
import { clientMessages } from "./client";
import enHome from "./en/home.json";
import faHome from "./fa/home.json";
import { styleguideMessages } from "./styleguide";

/*
 * The full catalogue: one file per namespace and locale, so each area of the
 * app owns its own strings. The server (src/i18n/request.ts) and the
 * next-intl AppConfig typing use it. Client bundles import the narrower sets
 * in ./client.ts and ./styleguide.ts instead.
 *
 * English is the reference shape; messages.test.ts checks that Persian has
 * exactly the same keys and ICU placeholders.
 */
const en = {
  ...clientMessages.en,
  Home: enHome,
  Styleguide: styleguideMessages.en,
};

export type Messages = typeof en;

const fa: Messages = {
  ...clientMessages.fa,
  Home: faHome,
  Styleguide: styleguideMessages.fa,
};

export const messages: Record<Locale, Messages> = { en, fa };
