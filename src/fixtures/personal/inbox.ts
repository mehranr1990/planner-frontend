/*
 * SAMPLE DATA — Inbox captures from the P07 Inbox board: six untriaged items
 * (the "6" badge on every final board's rail), two snoozed (P07 "Snoozed 2",
 * until options from the snooze popover) and one archived.
 * Replace with the inbox API when the backend lands.
 */

import type { InboxItem } from "@/data/domain";
import { sampleDays, sampleInstant } from "./sample-day";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

const { saturday, sunday, yesterday, today, tomorrow, nextSaturday } = sampleDays;

export const sampleInboxItems: readonly InboxItem[] = [
  // To triage · 6 (newest first, as listed on P07)
  {
    id: "i-call-ali-lease",
    text: "Call Ali about the apartment lease before Friday",
    source: "voice",
    capturedAt: sampleInstant(today, 8, 12),
    state: "untriaged",
    suggested: "task",
  },
  {
    id: "i-calm-dashboards-link",
    text: "medium.com/… “Designing calm dashboards”",
    source: "share",
    capturedAt: sampleInstant(yesterday, 22, 15),
    state: "untriaged",
  },
  {
    id: "i-printer-ink",
    text: "Buy printer ink",
    source: "quick-add",
    capturedAt: sampleInstant(yesterday, 21, 40),
    state: "untriaged",
    suggested: "task",
  },
  {
    id: "i-dinner-sara-reza",
    text: "Dinner with Sara & Reza next Thursday",
    source: "quick-add",
    capturedAt: sampleInstant(yesterday, 12, 20),
    state: "untriaged",
    suggested: "event",
  },
  {
    id: "i-weekly-review-wins",
    text: "Idea: weekly review should start with wins",
    source: "note",
    capturedAt: sampleInstant(sunday, 10, 5),
    state: "untriaged",
    suggested: "note",
  },
  {
    id: "i-renew-passport",
    text: "Renew passport — expires in Dey",
    source: "quick-add",
    capturedAt: sampleInstant(saturday, 19, 30),
    state: "untriaged",
    suggested: "reminder",
  },
  // Snoozed · 2
  {
    id: "i-dentist",
    text: "dentist!!",
    source: "brain-dump",
    capturedAt: sampleInstant(today, 9, 40),
    state: "snoozed",
    snoozedUntil: sampleInstant(tomorrow, 9),
    suggested: "task",
  },
  {
    id: "i-standing-desk",
    text: "Compare standing desk options",
    source: "share",
    capturedAt: sampleInstant(saturday, 11, 20),
    state: "snoozed",
    snoozedUntil: sampleInstant(nextSaturday, 9),
  },
  // Archived
  {
    id: "i-darband-hike",
    text: "weekend: darband hike if weather ok",
    source: "brain-dump",
    capturedAt: sampleInstant(sunday, 21, 10),
    state: "archived",
    suggested: "event",
  },
];
