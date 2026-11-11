"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { MoreTile } from "@/components/shell/personal-mobile";
import { Icon } from "@/components/ui/icon";
import type { AppContext } from "@/features/navigation/types";
import { useNavItemFilter } from "@/features/navigation/use-nav-state";
import { useOpenTeamSheet } from "../sheets/team-sheet-params";
import { useCurrentTeamAccess } from "../use-current-team";

/*
 * The Teams "More" sheet (TS-01 Mobile, T11): inside a team, a 3-column grid
 * of every module not in the bottom bar (Planning, Projects, Goals, People,
 * Analytics, Check-ins, Recognition, Files, Settings) under the team name,
 * capability-filtered like the rail (hidden, not disabled). No Assistant.
 * On the collection it offers New team.
 */
export function TeamMoreContent({ context, onNavigate }: { context: AppContext; onNavigate: () => void }) {
  const tNav = useTranslations("Navigation");
  const visible = useNavItemFilter(context);
  const { team } = useCurrentTeamAccess();
  const openSheet = useOpenTeamSheet();
  const items = context.nav.filter((item) => item.mobileOrder === undefined && visible(item));

  return (
    <div className="flex flex-col gap-2" data-scope="team">
      {team ? (
        <p className="px-3.5 pt-1 type-title text-fg">
          <bdi>{team.name}</bdi>
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul aria-label={tNav("moreLabel", { context: tNav(context.labelKey) })} className="grid grid-cols-3 gap-1">
          {items.map((item) => (
            <MoreTile key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
      {context.workspaceId ? null : (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            onNavigate();
            openSheet("team-new");
          }}
          className="flex h-12 w-full items-center gap-3 rounded-pill px-3.5 text-start text-sm font-medium text-fg transition-colors hover:bg-subtle"
        >
          <Icon icon={Plus} className="text-fg-secondary" />
          <span className="min-w-0 flex-1 truncate">{tNav("contexts.team.add")}</span>
        </button>
      )}
    </div>
  );
}
