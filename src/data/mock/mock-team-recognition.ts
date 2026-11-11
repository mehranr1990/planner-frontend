import { feedbackNoteFixtures, feedbackRequestFixtures } from "@/fixtures/team-feedback";
import { thanksFixtures } from "@/fixtures/team-work";
import { RepositoryError } from "../repositories";
import type { FeedbackNote, FeedbackRequest, TeamPerson, TeamRole, TeamThanks, ThanksLink } from "../team-domain";
import type { TeamAccessOptions, TeamFeedbackRepository, TeamRecognitionRepository } from "../team-repositories";

/*
 * Mock recognitionRepo + feedbackRepo (TM-10). Thanks: team-visible (feed) or
 * private (writer + recipients). A recipient may hide it from the team feed;
 * the author deletes their own; Owner/Admin remove any (audited). Links point
 * only at things the viewer can see (a project they cannot open drops out).
 * Feedback is private 1:1 (T9): the viewer only ever gets what they wrote or
 * received. No counts per person anywhere.
 */

export interface MockTeamRecognitionOptions {
  respond<T>(value: T): Promise<T>;
  now: string;
  team(teamId: string): { members: readonly TeamPerson[]; role: TeamRole; lifecycle: "active" | "archived" };
  canOpenProject(projectId: string): boolean;
}

/** Audit entries for policy removals (mock-only). */
export interface ThanksAudit {
  thanksId: string;
  teamId: string;
  by: string;
  at: string;
}

export function createMockTeamRecognition(options: MockTeamRecognitionOptions): {
  teamRecognition: TeamRecognitionRepository;
  teamFeedback: TeamFeedbackRepository;
  audit: ThanksAudit[];
} {
  const { respond, now, team, canOpenProject } = options;
  const thanks = new Map<string, TeamThanks[]>(Object.entries(structuredClone(thanksFixtures)).map(([id, list]) => [id, [...list]]));
  const requests = new Map<string, FeedbackRequest[]>(Object.entries(structuredClone(feedbackRequestFixtures)).map(([id, list]) => [id, [...list]]));
  const notes = new Map<string, FeedbackNote[]>(Object.entries(structuredClone(feedbackNoteFixtures)).map(([id, list]) => [id, [...list]]));
  const audit: ThanksAudit[] = [];
  let counter = 0;

  const listOf = <T,>(map: Map<string, T[]>, teamId: string) => {
    if (!map.has(teamId)) map.set(teamId, []);
    return map.get(teamId)!;
  };
  const writer = (teamId: string, preview?: TeamAccessOptions) => {
    const info = team(teamId);
    const role = preview?.previewRole ?? info.role;
    const active = !preview?.previewArchived && info.lifecycle === "active";
    return { ...info, role, canWrite: active && role !== "viewer", canRemoveAny: active && (role === "owner" || role === "admin") };
  };
  const involvesMe = (item: TeamThanks) => item.from.id === "me" || item.to.some((person) => person.id === "me");
  const visibleLink = (link: ThanksLink | null | undefined) =>
    link && (link.kind !== "project" || canOpenProject(link.id)) ? link : null;
  const view = (item: TeamThanks, teamId: string, preview?: TeamAccessOptions): TeamThanks => {
    const me = writer(teamId, preview);
    return {
      ...structuredClone(item),
      link: visibleLink(item.link),
      can: {
        delete: me.canWrite && item.from.id === "me",
        hide: me.canWrite && item.visibility === "team" && item.to.some((person) => person.id === "me"),
        remove: me.canRemoveAny && item.from.id !== "me",
      },
    };
  };
  const findThanks = (teamId: string, id: string) => {
    const item = listOf(thanks, teamId).find((entry) => entry.id === id);
    if (!item || (item.visibility === "private" && !involvesMe(item))) throw new RepositoryError("not-found", "Thanks not found");
    return item;
  };
  const person = (teamId: string, id: string) => {
    const found = team(teamId).members.find((item) => item.id === id);
    if (!found) throw new RepositoryError("invalid", "Not a team member");
    return found;
  };

  const teamRecognition: TeamRecognitionRepository = {
    async recent(teamId, limit = 5) {
      team(teamId);
      // Private thanks stay between writer and recipient: never on the team feed.
      return respond(
        listOf(thanks, teamId)
          .filter((item) => item.visibility === "team" && !item.hidden)
          .slice(0, limit)
          .map((item) => view(item, teamId)),
      );
    },
    async list(teamId, preview) {
      team(teamId);
      return respond(
        listOf(thanks, teamId)
          .filter((item) => (item.visibility === "team" && !item.hidden) || involvesMe(item))
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
          .map((item) => view(item, teamId, preview)),
      );
    },
    async give(teamId, input) {
      const me = writer(teamId);
      if (!me.canWrite) throw new RepositoryError("forbidden", "Viewers read thanks");
      const text = input.text.trim();
      const toIds = [...new Set(input.toIds)];
      if (!text || !toIds.length || toIds.includes("me")) throw new RepositoryError("invalid", "Recipient and text required");
      const item: TeamThanks = {
        id: `th-new-${++counter}`,
        from: person(teamId, "me"),
        to: toIds.map((id) => person(teamId, id)),
        text,
        visibility: input.visibility,
        link: visibleLink(input.link),
        at: now,
      };
      listOf(thanks, teamId).unshift(item);
      return respond(view(item, teamId));
    },
    async hide(teamId, thanksId, hidden) {
      const item = findThanks(teamId, thanksId);
      if (!view(item, teamId).can?.hide) throw new RepositoryError("forbidden", "Only a recipient can hide it");
      item.hidden = hidden;
      return respond(view(item, teamId));
    },
    async remove(teamId, thanksId) {
      const item = findThanks(teamId, thanksId);
      const can = view(item, teamId).can!;
      if (!can.delete && !can.remove) throw new RepositoryError("forbidden", "Cannot remove");
      if (!can.delete) audit.push({ thanksId, teamId, by: "me", at: now });
      const list = listOf(thanks, teamId);
      list.splice(list.indexOf(item), 1);
      return respond(undefined);
    },
  };

  const teamFeedback: TeamFeedbackRepository = {
    async inbox(teamId) {
      team(teamId);
      const reqs = listOf(requests, teamId);
      const all = listOf(notes, teamId);
      const newest = <T extends { at: string }>(list: T[]) => list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return respond(
        structuredClone({
          asked: newest(reqs.filter((item) => item.to.id === "me" && item.status === "open")),
          requested: newest(reqs.filter((item) => item.from.id === "me")),
          received: newest(all.filter((item) => item.recipient.id === "me")),
          sent: newest(all.filter((item) => item.author.id === "me")),
        }),
      );
    },
    async request(teamId, input) {
      if (!writer(teamId).canWrite) throw new RepositoryError("forbidden", "Viewers cannot request feedback");
      const question = input.question.trim();
      if (!question || input.toId === "me") throw new RepositoryError("invalid", "Person and question required");
      const item: FeedbackRequest = {
        id: `fr-new-${++counter}`,
        from: person(teamId, "me"),
        to: person(teamId, input.toId),
        about: input.about.trim(),
        question,
        due: null,
        at: now,
        status: "open",
      };
      listOf(requests, teamId).push(item);
      return respond(structuredClone(item));
    },
    async write(teamId, input) {
      if (!writer(teamId).canWrite) throw new RepositoryError("forbidden", "Viewers cannot write feedback");
      const body = input.body.trim();
      if (!body || input.toId === "me") throw new RepositoryError("invalid", "Person and feedback required");
      const request = input.requestId ? listOf(requests, teamId).find((item) => item.id === input.requestId) : undefined;
      if (input.requestId && (!request || request.to.id !== "me")) throw new RepositoryError("not-found", "Request not found");
      const note: FeedbackNote = {
        id: `fb-new-${++counter}`,
        author: person(teamId, "me"),
        recipient: person(teamId, input.toId),
        about: input.about.trim(),
        body,
        at: now,
        requestId: input.requestId ?? null,
      };
      listOf(notes, teamId).push(note);
      if (request) request.status = "answered";
      return respond(structuredClone(note));
    },
  };

  return { teamRecognition, teamFeedback, audit };
}
