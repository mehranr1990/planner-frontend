import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { ProjectTemplate } from "../project-domain";
import { createApiProjectCreateRepository } from "./api-project-create-repository";
import { createApiProjectRepositories } from "./api-project-repositories";
import { createApiTeamRepositories } from "./api-team-repositories";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Env-gated live check of Create Project from a Team (team-owned create,
 * TB-6) against the local backend (never production). Uses the synthetic
 * Development accounts from the backend's ignored
 * `.tools/company-development-accounts.json` (API_LIVE_COMPANY_ACCOUNTS;
 * secrets never logged): the primary creates a synthetic team (Owner ⇒
 * settings.manage) and one project per template under it; the second
 * account is not a member and must be refused (create, portfolio read).
 * Everything created is archived at the end.
 */

type Outcome = "PASS" | "FAIL" | "NOT VERIFIED";
const results: { op: string; outcome: Outcome; note: string }[] = [];
async function step(op: string, run: () => Promise<string | void>) {
  try {
    results.push({ op, outcome: "PASS", note: (await run()) ?? "" });
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    results.push({ op, outcome: "FAIL", note: `${e.code ?? e.status ?? ""} ${e.message ?? String(error)}`.trim() });
  }
}
afterAll(() => {
  console.log("TEAM PROJECT CREATE LIVE RESULTS\n" + results.map((r) => `${r.outcome.padEnd(12)} ${r.op}${r.note ? " — " + r.note : ""}`).join("\n"));
});

const accounts = (() => {
  const path = process.env.API_LIVE_COMPANY_ACCOUNTS;
  if (!path) return undefined;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { primary: { email: string; password: string }; second: { email: string; password: string } };
  return { primary: { email: raw.primary.email, password: raw.primary.password }, second: { email: raw.second.email, password: raw.second.password } };
})();

describe.skipIf(!liveConfigured || !accounts)("Create Project from Team (live)", () => {
  it("settings.manage member creates team-owned Blank/Kanban/Scrum projects; non-members are refused", async () => {
    const owner = await liveSession(accounts!.primary);
    const teams = createApiTeamRepositories(owner.client);
    const create = createApiProjectCreateRepository(owner.client);
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    const projectIds: string[] = [];
    let teamId = "";
    try {
      await step("synthetic team created; Owner has createProject (settings.manage)", async () => {
        teamId = (await teams.teams.create({ name: `Live team project ${stamp}`, planningMode: "weekly" })).id;
        const access = await teams.teams.access(teamId);
        if (access.status !== "ok") throw new Error(`access ${access.status}`);
        expect(access.capabilities.createProject).toBe(true);
        return `team ${teamId.slice(0, 8)}`;
      });
      for (const [index, template] of (["blank", "kanban", "scrum"] as ProjectTemplate[]).entries())
        await step(`create ${template} project under the team (the sheet's path)`, async () => {
          const project = await create.create({ name: `Live ${template} ${stamp}`, key: `L${stamp}${index}`, startDate: owner.today, endDate: owner.today, template, ownerTeamId: teamId });
          projectIds.push(project.id);
          return `project ${project.id.slice(0, 8)}`;
        });
      await step("all three appear in the Team project list (associated with the team)", async () => {
        const listed = (await teams.teams.projects(teamId)).filter((project) => projectIds.includes(project.id));
        expect(listed).toHaveLength(3);
        return listed.map((project) => `${project.name}: ${project.relation}`).join("; ");
      });

      const outsider = await liveSession(accounts!.second);
      try {
        const outsiderTeams = createApiTeamRepositories(outsider.client);
        await step("non-member cannot open the team or read its project list", async () => {
          const access = await outsiderTeams.teams.access(teamId);
          expect(access.status).not.toBe("ok");
          const read = await outsiderTeams.teams.projects(teamId).then(
            () => "allowed",
            (error: { code?: string }) => error.code ?? "refused",
          );
          expect(read).not.toBe("allowed");
          return `access ${access.status}; portfolio ${read}`;
        });
        await step("non-member team-owned create is refused and creates nothing", async () => {
          const attemptId = crypto.randomUUID();
          const outcome = await createApiProjectCreateRepository(outsider.client)
            .create({ name: `Live denied ${stamp}`, key: `D${stamp}`, startDate: outsider.today, endDate: outsider.today, template: "blank", ownerTeamId: teamId, attemptId })
            .then(
              (project) => {
                projectIds.push(project.id);
                return "created";
              },
              (error: { code?: string }) => error.code ?? "refused",
            );
          expect(outcome).not.toBe("created");
          const visible = (await teams.teams.projects(teamId)).some((project) => project.id === attemptId);
          expect(visible).toBe(false);
          return `refused (${outcome}); not in the team list`;
        });
      } finally {
        outsider.end();
      }
    } finally {
      const projects = createApiProjectRepositories(owner.client, { today: () => owner.today });
      for (const id of projectIds)
        await projects.settings.archive(id).then(
          () => results.push({ op: `cleanup: archive project ${id.slice(0, 8)}`, outcome: "PASS", note: "" }),
          (error: unknown) => results.push({ op: `cleanup: archive project ${id.slice(0, 8)}`, outcome: "FAIL", note: String((error as { code?: string }).code ?? error) }),
        );
      if (teamId)
        await teams.teamSettings.archive(teamId).then(
          () => results.push({ op: `cleanup: archive team ${teamId.slice(0, 8)}`, outcome: "PASS", note: "" }),
          (error: unknown) => results.push({ op: `cleanup: archive team ${teamId.slice(0, 8)}`, outcome: "FAIL", note: String((error as { code?: string }).code ?? error) }),
        );
      owner.end();
    }
    expect(results.filter((r) => r.outcome === "FAIL")).toEqual([]);
  }, 300_000);
});
