import Link from "next/link";
import { cn } from "@/lib/cn";

/*
 * Mobile "Today" (PM01): one bottom-nav tab holds Overview and Plan (My Day)
 * as a segmented switch — both answer "what about today?". Desktop has both
 * in the rail, so the switch is hidden from lg up. They are destinations, so
 * these are links with aria-current, styled like the Segmented track.
 */
export interface TodaySwitchProps {
  current: "overview" | "myday";
  /** Localised: the nav name and the two segment labels. */
  labels: { nav: string; overview: string; plan: string };
}

export function TodaySwitch({ current, labels }: TodaySwitchProps) {
  const items = [
    { id: "overview", href: "/personal", label: labels.overview },
    { id: "myday", href: "/personal/my-day", label: labels.plan },
  ] as const;

  return (
    <nav aria-label={labels.nav} data-slot="today-switch" className="lg:hidden">
      <ul className="inline-flex items-center gap-1 rounded-pill bg-raised p-1">
        {items.map((item) => {
          const active = item.id === current;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-touch min-w-touch items-center justify-center rounded-pill px-4 text-body font-semibold transition-[background-color,color,box-shadow]",
                  active ? "bg-primary text-on-accent" : "text-fg-secondary hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
