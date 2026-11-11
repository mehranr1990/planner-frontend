"use client";

import { MessageCircle, UserPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { PeopleWorkload, type PeopleWorkloadPerson } from "@/components/context/people-workload";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { presenceStatuses } from "@/data/team-domain";
import { useTeamCapacity, useTeamMembers, useTeamPresence } from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { useTeamLabels } from "../labels";
import { useOpenTeamSheet } from "../sheets/team-sheet-params";
import { useTeam } from "../team-gate";

/*
 * TM-01 People & workload: the shared PeopleWorkload, full width at the top,
 * in the team accent. Data: members (role + title), manual presence (status,
 * note, "now working on" only when shared) and this week's booking
 * (estimates of team + project work / capacity; never Personal focus or time
 * blocks). Viewers get status-only rows (OPEN default: no booking). Action:
 * Message (Messages does not exist yet: coming soon) or Set status for
 * yourself (?sheet=team-status).
 */
export function TeamPeopleCard() {
  const t = useTranslations("Team");
  const labels = useTeamLabels();
  const { team, capabilities } = useTeam();
  const members = useTeamMembers(team.id);
  const presence = useTeamPresence(team.id);
  const capacity = useTeamCapacity(team.id, capabilities.seeBooking);
  const openSheet = useOpenTeamSheet();
  const soonId = useId();
  const [selectedId, setSelectedId] = useState<string>();

  if (!members.data || !presence.data) return <Skeleton className="h-72 rounded-[2rem]" />;

  const people: PeopleWorkloadPerson[] = members.data.map((member) => {
    const status = presence.data.find((entry) => entry.personId === member.person.id);
    const booked = capacity.data?.find((entry) => entry.personId === member.person.id);
    return {
      id: member.person.id,
      name: member.person.name,
      initials: member.person.initials,
      role: member.title,
      status: status?.status ?? null,
      note: status?.note || undefined,
      workingOn: status?.workingOn ?? null,
      bookedPercent:
        booked && booked.capacityHours > 0 ? Math.round((booked.bookedHours / booked.capacityHours) * 100) : null,
      isSelf: member.person.id === "me",
    };
  });

  return (
    <PeopleWorkload
      title={t("people.title")}
      scope="team"
      people={people}
      selectedId={selectedId}
      onSelect={setSelectedId}
      statusLabel={labels.status}
      legend={presenceStatuses}
      statusOnly={!capabilities.seeBooking}
      moreHref={teamHref(team.id, "people")}
      footnote={t("people.footnote")}
      action={(person) =>
        person.isSelf ? (
          capabilities.setOwnStatus ? (
            <Button
              variant="secondary"
              className="bg-surface"
              aria-haspopup="dialog"
              onClick={() => openSheet("team-status")}
            >
              <Icon icon={UserPen} size={16} />
              {t("setStatus")}
            </Button>
          ) : null
        ) : (
          <>
            <Button variant="secondary" className="bg-surface" aria-disabled="true" aria-describedby={soonId}>
              <Icon icon={MessageCircle} size={16} />
              {t("people.message")}
            </Button>
            <span id={soonId} className="sr-only">
              {t("people.messageSoon")}
            </span>
          </>
        )
      }
    />
  );
}
