/*
 * SAMPLE DATA for TM-03 Team calendar (week W42, today Tue 13 Oct 2026).
 * Adds the light-meeting basics (end, organiser, agenda, URL, RSVPs) to the
 * team events of `teamEventFixtures`, plus project events of linked
 * projects (shown only when the viewer can open the project). Titles,
 * agenda lines and URLs are user content (not translated).
 */

import type { TeamAgendaItem, TeamRsvp } from "@/data/team-domain";
import { teamPeople } from "./teams";

const { amelie, harry, sarah } = teamPeople;

export interface TeamEventExtra {
  end?: string | null;
  organiserId?: string;
  agenda?: readonly TeamAgendaItem[];
  url?: string | null;
  /** RSVP per invitee id; missing = no reply. Every member is invited unless `invitees` is set. */
  rsvps?: Readonly<Record<string, TeamRsvp>>;
  invitees?: readonly string[];
}

export const teamEventExtras: Readonly<Record<string, TeamEventExtra>> = {
  "ev-planning": { end: "11:00", organiserId: "harry", rsvps: { harry: "going", amelie: "going", sarah: "going" } },
  "ev-critique": {
    end: "15:30",
    organiserId: "harry",
    url: "https://meet.example.com/design-critique",
    agenda: [
      { id: "ag-1", title: "Onboarding variants", owner: amelie, minutes: 15 },
      { id: "ag-2", title: "Icon stroke 1.5 vs 2 px", owner: sarah, minutes: 10 },
      { id: "ag-3", title: "Next week focus", owner: harry, minutes: 5 },
    ],
    rsvps: {
      harry: "going",
      sarah: "going",
      amelie: "going",
      katy: "going",
      ava: "going",
      jonathan: "going",
      nina: "maybe",
    },
  },
  "ev-icon-review": { organiserId: "sarah", invitees: ["sarah", "katy", "harry", "me"], rsvps: { sarah: "going" } },
  "ev-workshop": { end: "11:00", organiserId: "me", rsvps: { me: "going", amelie: "going" } },
  "ev-standup": {
    end: "11:30",
    organiserId: "me",
    url: "https://meet.example.com/release-sync",
    rsvps: { kian: "going", jonathan: "maybe" },
  },
  "ev-growth-review": { end: "16:00", organiserId: "lena" },
};

/** Events of linked projects (project-scoped; shown only to viewers who can open the project). */
export const teamProjectEventFixtures: Readonly<
  Record<string, readonly { id: string; projectId: string; day: string; time: string; end: string; title: string }[]>
> = {
  design: [
    {
      id: "pe-client-call",
      projectId: "website-redesign",
      day: "2026-10-13",
      time: "15:00",
      end: "16:00",
      title: "Client call",
    },
    // partner-portal: the viewer has no grant → never shown.
    {
      id: "pe-partner-sync",
      projectId: "partner-portal",
      day: "2026-10-12",
      time: "13:00",
      end: "14:00",
      title: "Partner sync",
    },
  ],
  mobile: [
    {
      id: "pe-store-review",
      projectId: "mobile-onboarding",
      day: "2026-10-14",
      time: "10:00",
      end: "11:00",
      title: "Store review",
    },
  ],
};
