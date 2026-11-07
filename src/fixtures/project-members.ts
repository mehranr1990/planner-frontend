/*
 * SAMPLE DATA: Website Redesign's people (PJ13 board, PJM03 mobile): the 7
 * members of the project summary plus one verified guest with a task grant.
 * Capacity = weekly project hours (Members page, used by Workload, D13).
 * Emails are sample addresses on reserved example domains.
 */

import type { GuestGrant, ProjectMember } from "@/data/project-domain";
import { projectPeople } from "./projects";

const { me, sara, kamran, jonathan, kian, maryam, arash, ava } = projectPeople;

type Seed = Omit<ProjectMember, "openTasks">;

export const sampleMembers: Readonly<Record<string, readonly Seed[]>> = {
  "website-redesign": [
    { person: sara, email: "sara@studio.example", role: "owner", capacityHours: 32 },
    { person: me, email: "m.raeeszade@studio.example", role: "manager", capacityHours: 24, invitedById: "sara" },
    { person: kian, email: "kian@studio.example", role: "member", capacityHours: 32, invitedById: "me" },
    { person: jonathan, email: "jonathan@studio.example", role: "member", capacityHours: 20, invitedById: "sara" },
    { person: maryam, email: "maryam@studio.example", role: "member", capacityHours: 16, invitedById: "me" },
    { person: arash, email: "arash@studio.example", role: "member", capacityHours: 12, invitedById: "sara" },
    { person: kamran, email: "kamran@studio.example", role: "viewer", capacityHours: null, invitedById: "me" },
    { person: ava, email: "ava@agency.example", role: "guest", capacityHours: null, invitedById: "me" },
  ],
};

export const sampleGrants: Readonly<Record<string, readonly GuestGrant[]>> = {
  "website-redesign": [{ personId: "ava", taskIds: ["empty-states", "icon-set"], expires: "2026-11-30" }],
};
