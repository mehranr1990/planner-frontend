import type { Locale } from "@/lib/locale/config";
import enStyleguide from "./en/styleguide.json";
import faStyleguide from "./fa/styleguide.json";

/*
 * The Styleguide namespace (the largest catalogue). Only the styleguide pages
 * import it, so it stays out of every other route's client bundle.
 */
export type StyleguideMessages = typeof enStyleguide;

export const styleguideMessages: Record<Locale, StyleguideMessages> = {
  en: enStyleguide,
  fa: faStyleguide,
};
