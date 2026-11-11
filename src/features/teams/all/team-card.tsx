"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AvatarGroup } from "@/components/ui/avatar";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { TeamSummary } from "@/data/team-domain";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { ProjectTile } from "@/features/projects/project-visuals";
import { useTeamLabels } from "../labels";

/*
 * TeamCard (TM-00, product card, no notch): initials tile, name, my role ·
 * people, description, open tasks, "n for you" (my open + pending
 * assignments), linked projects I can open (forbidden = not found, never a
 * hidden count), member avatars, updated. Phones (TMM01) keep name, role ·
 * people, open and "for you". The whole card opens the team.
 */

const chip = "rounded-pill px-2.5 py-1 text-xs font-semibold";

export function TeamCard({ team }: { team: TeamSummary }) {
  const t = useTranslations("Teams");
  const labels = useTeamLabels();
  const format = useProjectFormat();

  return (
    <ProductCard
      as="article"
      className="relative w-full gap-3 transition-shadow focus-within:shadow-island hover:shadow-island"
    >
      <div className="flex items-start gap-3">
        <ProjectTile initials={team.initials} tint={team.tint} className="max-sm:size-9 max-sm:text-xs" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate type-title text-fg">
            <Link
              href={teamHref(team.id)}
              className="rounded-pill outline-none after:absolute after:inset-0 after:rounded-product focus-visible:after:ring-2 focus-visible:after:ring-focus"
            >
              <bdi>{team.name}</bdi>
            </Link>
          </h2>
          <span className="truncate text-xs font-medium text-fg-secondary">
            {labels.role(team.role)} · {t("people", { n: format.number(team.memberCount) })}
          </span>
        </div>
      </div>

      <p className="truncate text-sm text-fg-secondary max-sm:hidden">
        <bdi>{team.description}</bdi>
      </p>

      <ul className="flex flex-wrap gap-1.5">
        <li className={`${chip} bg-subtle text-fg`}>
          <span className="max-sm:hidden">{t("card.openTasks", { n: format.number(team.openTasks) })}</span>
          <span className="sm:hidden">{t("card.openShort", { n: format.number(team.openTasks) })}</span>
        </li>
        {team.forYou > 0 ? (
          <li className={`${chip} bg-scope-soft font-bold text-scope-deep`}>
            {t("forYou", { n: format.number(team.forYou) })}
          </li>
        ) : null}
        {team.projectCount > 0 ? (
          <li className={`${chip} bg-subtle text-fg max-sm:hidden`}>
            {t("card.projects", { n: format.number(team.projectCount) })}
          </li>
        ) : null}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-2 max-sm:hidden">
        <AvatarGroup
          people={team.members.map((member) => ({ name: member.name, initials: member.initials }))}
          max={3}
          size={32}
          label={t("card.members", { team: team.name })}
        />
        <span className="shrink-0 text-xs font-medium text-fg-muted">{format.relative(team.updatedAt)}</span>
      </div>
    </ProductCard>
  );
}
