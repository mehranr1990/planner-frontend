import type { ReactNode } from "react";

interface BdiProps {
  children: ReactNode;
  /** Language of the isolated run, e.g. "en" for a Latin name in Persian text. */
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";
  className?: string;
}

/**
 * Isolates a run of opposite-direction text (a Latin name or time inside a
 * Persian sentence) so the surrounding punctuation stays in place.
 */
export function Bdi({ children, lang, dir, className }: BdiProps) {
  return (
    <bdi lang={lang} dir={dir} className={className}>
      {children}
    </bdi>
  );
}
