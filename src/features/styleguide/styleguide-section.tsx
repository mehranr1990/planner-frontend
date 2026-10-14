import type { ReactNode } from "react";
import { Surface } from "@/design-system/surfaces/surface";
import { cn } from "@/lib/cn";
import { TierBadge, type Tier } from "./tier-badge";

const SPAN = {
  full: "lg:col-span-12",
  wide: "lg:col-span-7",
  narrow: "lg:col-span-5",
  half: "lg:col-span-6",
  third: "lg:col-span-4",
  twoThirds: "lg:col-span-8",
} as const;

interface StyleguideSectionProps {
  id: string;
  title: string;
  description?: ReactNode;
  span?: keyof typeof SPAN;
  /** Control rendered at the inline-end of the header. */
  action?: ReactNode;
  /** Design-system tier of what the section documents (see the Rules page). */
  tier?: Tier;
  children: ReactNode;
  className?: string;
}

export function StyleguideSection({
  id,
  title,
  description,
  span = "full",
  action,
  tier,
  children,
  className,
}: StyleguideSectionProps) {
  const titleId = `${id}-title`;
  return (
    <Surface asChild padding="lg">
      <section
        id={id}
        aria-labelledby={titleId}
        className={cn("flex min-w-0 scroll-mt-28 flex-col gap-6", SPAN[span], className)}
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            {tier ? <TierBadge tier={tier} className="mb-2" /> : null}
            <h2 id={titleId} className="type-title">
              {title}
            </h2>
            {description ? (
              <p className="type-caption mt-1 text-fg-muted">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
        {children}
      </section>
    </Surface>
  );
}
