import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { styleguidePages, type StyleguidePageId } from "./pages";

interface StyleguidePageNavProps {
  current: StyleguidePageId;
  className?: string;
}

/**
 * Capsule tab row linking the styleguide pages. The current page is passed in
 * (not read from the URL), so it renders the same on the server and in tests.
 */
export function StyleguidePageNav({ current, className }: StyleguidePageNavProps) {
  const t = useTranslations("Styleguide.pages");
  return (
    <nav aria-label={t("label")} className={cn("min-w-0", className)}>
      <ul className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-pill bg-raised p-1">
        {styleguidePages.map((page) => {
          const active = page.id === current;
          return (
            <li key={page.id}>
              <Link
                href={page.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-touch items-center rounded-pill px-4 text-body font-semibold transition-[background-color,color,box-shadow]",
                  active ? "bg-surface text-fg shadow-island" : "text-fg-secondary hover:text-fg",
                )}
              >
                {t(page.id)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
