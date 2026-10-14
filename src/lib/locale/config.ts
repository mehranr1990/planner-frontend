export const locales = ["en", "fa"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** BCP 47 tags handed to Intl APIs. */
export const intlLocale: Record<Locale, string> = {
  en: "en-US",
  fa: "fa-IR",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
