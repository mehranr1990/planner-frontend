"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { transitions, type MotionTokenName } from "@/design-system/motion/transitions";
import { duration, spring } from "@/design-system/tokens/motion";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

const ms = (seconds: number) => `${Math.round(seconds * 1000)}ms`;

const TOKENS: readonly { name: MotionTokenName; spec: string }[] = [
  { name: "instant", spec: `${ms(duration.instant)} · standard ease` },
  { name: "fast", spec: `${ms(duration.fast)} · standard ease` },
  { name: "standard", spec: `${ms(duration.standard)} · standard ease` },
  { name: "slow", spec: `${ms(duration.slow)} · emphasized ease` },
  { name: "softSpring", spec: `spring · stiffness ${spring.soft.stiffness} · damping ${spring.soft.damping}` },
  { name: "layoutMorph", spec: `spring · bounce ${spring.layoutMorph.bounce} · ${ms(spring.layoutMorph.visualDuration)}` },
];

export function MotionSection() {
  const t = useTranslations("Styleguide.motion");
  const [atEnd, setAtEnd] = useState(false);

  return (
    <StyleguideSection
      id="motion"
      title={t("title")}
      description={t("description")}
      action={
        <Button variant="secondary" onClick={() => setAtEnd((value) => !value)}>
          {atEnd ? t("reset") : t("play")}
        </Button>
      }
    >
      <p className="type-caption rounded-row bg-subtle px-3 py-2 text-fg-secondary">
        <span className="motion-reduce:hidden">{t("reducedOff")}</span>
        <span className="hidden motion-reduce:inline" data-testid="reduced-motion-on">
          {t("reducedOn")}
        </span>
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {TOKENS.map((token) => (
          <li key={token.name} className="flex flex-col gap-2">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <code dir="ltr" className="text-sm font-semibold">
                {token.name}
              </code>
              <code dir="ltr" className="text-xs text-fg-muted">
                {token.spec}
              </code>
            </span>
            {/* Layout animation along the inline axis: mirrors in RTL for free. */}
            <span
              aria-hidden
              className={cn("flex h-11 items-center rounded-pill bg-raised p-1.5", atEnd ? "justify-end" : "justify-start")}
            >
              <motion.span layout transition={transitions[token.name]} className="size-8 rounded-pill bg-primary" />
            </span>
          </li>
        ))}
      </ul>
    </StyleguideSection>
  );
}
