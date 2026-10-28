/*
 * SAMPLE DATA — Brain Dump pages from the P08 board: today's page (three
 * lines sorted, five unsorted — the "Clear page" state), yesterday (all
 * sorted), Sun 19 Mehr (five left) and Thu 16 Mehr (two lines).
 * Replace with the Brain Dump API when the backend lands.
 */

import type { BrainDumpPage } from "@/data/domain";
import { sampleDays, sampleInstant } from "./sample-day";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

const { sunday, yesterday, today, thursday, friday } = sampleDays;
/** Thu 16 Mehr 1405. */
const lastThursday = "2026-10-08";

export const sampleBrainDumpPages: readonly BrainDumpPage[] = [
  {
    day: today,
    savedAt: sampleInstant(today, 14, 32),
    lines: [
      { id: "bd-lease", text: "need to sort out the lease with ali — call him?", sortedTo: "task", sortedDay: thursday },
      { id: "bd-dashboard", text: "the dashboard feels loud. maybe one hero, everything else quiet" },
      { id: "bd-gap-1", text: "" },
      { id: "bd-gift", text: "birthday gift for sara — she mentioned ceramics" },
      { id: "bd-reading", text: "why do i always skip reading on mondays… too many meetings?", sortedTo: "journal", sortedDay: today },
      { id: "bd-book", text: "book idea: “calm planning” — collect examples" },
      { id: "bd-dentist", text: "dentist!!" },
      { id: "bd-gym", text: "[] renew gym membership" },
      { id: "bd-gap-2", text: "" },
      { id: "bd-hike", text: "weekend: darband hike if weather ok", sortedTo: "event", sortedDay: friday },
    ],
  },
  {
    day: yesterday,
    savedAt: sampleInstant(yesterday, 21, 10),
    lines: [
      { id: "bd-y-invoice", text: "send the october invoice", sortedTo: "task", sortedDay: yesterday },
      { id: "bd-y-tired", text: "tired after the review — slept badly", sortedTo: "journal", sortedDay: yesterday },
      { id: "bd-y-colors", text: "palette idea: mint + graphite", sortedTo: "note" },
      { id: "bd-y-bread", text: "bread", struck: true },
    ],
  },
  {
    day: sunday,
    savedAt: sampleInstant(sunday, 9, 40),
    lines: [
      { id: "bd-s-1", text: "plan the week before monday", sortedTo: "task", sortedDay: sunday },
      { id: "bd-s-2", text: "call grandma", sortedTo: "task", sortedDay: sunday },
      { id: "bd-s-3", text: "fix the balcony light", sortedTo: "inbox" },
      { id: "bd-s-4", text: "felt calm on the walk", sortedTo: "journal", sortedDay: sunday },
      { id: "bd-s-5", text: "article on slow productivity", sortedTo: "note" },
      { id: "bd-s-6", text: "team dinner thursday?", sortedTo: "event", sortedDay: thursday },
      { id: "bd-s-7", text: "old chargers", struck: true },
      { id: "bd-s-8", text: "- try the new tea place" },
      { id: "bd-s-9", text: "- backup photos to the drive" },
      { id: "bd-s-10", text: "maybe learn the setar again" },
      { id: "bd-s-11", text: "ask nima about the bike" },
      { id: "bd-s-12", text: "too many tabs open — close them" },
    ],
  },
  {
    day: lastThursday,
    savedAt: sampleInstant(lastThursday, 22, 5),
    lines: [
      { id: "bd-t-1", text: "what would a slower month look like?" },
      { id: "bd-t-2", text: "sketch a reading corner" },
    ],
  },
];
