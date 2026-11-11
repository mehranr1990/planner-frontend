/*
 * SAMPLE DATA for TM-10 feedback (private 1:1: only writer and recipient
 * read it; Leads don't see it by default, T9). Text is user content (not
 * translated). Notes between other people never reach the viewer.
 */

import type { FeedbackNote, FeedbackRequest } from "@/data/team-domain";
import { teamPeople } from "./teams";

const { me, amelie, harry, sarah } = teamPeople;

export const feedbackRequestFixtures: Readonly<Record<string, readonly FeedbackRequest[]>> = {
  design: [
    {
      id: "fr-1",
      from: amelie,
      to: me,
      about: "Onboarding flow variants",
      question: "What would you cut to ship by Thursday?",
      due: "2026-10-15",
      at: "2026-10-12T10:00:00+03:30",
      status: "open",
    },
  ],
};

export const feedbackNoteFixtures: Readonly<Record<string, readonly FeedbackNote[]>> = {
  design: [
    {
      id: "fb-1",
      author: harry,
      recipient: me,
      about: "Critique notes W41",
      body: "Clear structure. Next time, open with the decision you need from the room.",
      at: "2026-10-12T16:30:00+03:30",
      requestId: null,
    },
    {
      id: "fb-2",
      author: harry,
      recipient: sarah,
      about: "Icon set v2",
      body: "Private to Sarah and Harry only.",
      at: "2026-10-12T17:00:00+03:30",
      requestId: null,
    },
  ],
};
