# Teams (Phase 3) — implementation notes

Result of PROMPTS.md T0 (read-only survey, 2026-11-11). Subagents: read this first; do not re-explore.
Design order: `design/team/README.md` → `SCREENS.md` → `DECISIONS.md` → `PEOPLE_FLOW.md` (when the prompt mentions it) → only the SPEC.md section of the current screen (grep/line ranges). Never open `boards/*.dc.html`; only the current screen's screenshots (light + Dark, tab captures if needed).
**Also read `design/project/IMPL_NOTES.md` → "Learned during implementation"**: it is the map of every Project seam/component Team must reuse.

## Stack & gates (same as Projects)
- Next.js 16.4 App Router (pages export `instant = false`), TS, Tailwind 4, React Query 5, next-intl 4, @dnd-kit, date-fns(-jalali), lucide-react, Vitest. No new dependencies.
- Per prompt: `npm run typecheck`, `npx eslint <touched paths>`, `npx vitest run <targeted tests>`. No e2e / Playwright. Commit with explicit `git add <paths>` only (never `-A`, never `chatgpt-context.zip`), don't push, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never run prettier on existing files. Logical CSS only (a test enforces it). en/fa message keys identical (`messages.test.ts`); new client namespaces go in `src/messages/client.ts`.
- Build + full vitest were green at `88ad295` (1873 passed, 5 skipped).

## Key paths
| Area | Path |
|---|---|
| Context registry | `src/features/navigation/contexts.ts` (`appContexts`; project pattern: `projectRail`, `getProjectContext(id)`, `projectHref(id, item)`), `types.ts` (`navItemIds`, `RailLayout`), `paths.ts` (`getProjectIdFromPathname`, `resolveContext`, `getMobileNavItems`) |
| Team context today | `contexts.ts` `id: "team"`: basePath `/teams`, flat nav `[overview, work, people, calendar, checkins, activity, files]`, mobile `[overview, work, calendar]`, all items "planned" |
| Team route today | `src/app/(app)/teams/page.tsx` → `ContextOverview` placeholder |
| Shell | `components/shell/shell-frame.tsx`, `floating-rail.tsx` (grouped when `context.rail`), `mobile-shell.tsx`, switcher `components/navigation/context-switcher-panel.tsx` + `features/projects/shell/project-switcher-list.tsx` (pattern for a Teams list), `project-mobile.tsx` (More sheet), `project-quick-create.tsx` |
| Assistant | `components/shell/non-personal-assistant.tsx` hides for personal + project only → add team |
| Access states | `components/feedback/access-state.tsx` (`AccessStateKind`: empty, filtered, error, unauthenticated, not-available, invite-pending, revoked, deleted, pending, conflict, quota) + `access-banner.tsx` |
| Project gate pattern | `app/(app)/projects/layout.tsx` (mounts `ProjectSheetHost`), `projects/[id]/layout.tsx` (ProjectGate + `@drawer` slot), `[id]/[module]/page.tsx` (coming-soon catch for unbuilt modules), `features/projects/project-gate.tsx` (`useProject()` → project + capabilities + demo), `project-page-header.tsx`, `demo-state.ts` / `demo-state-switch.tsx` (`?state=`), `project-module-placeholder.tsx`, `project-modules.ts` |
| Task drawer | `projects/[id]/@drawer/(.)tasks/[taskId]` + `ProjectDrawerGate`; view `features/projects/task-detail/{project-task-drawer,project-task-detail-view,assignment-block}.tsx` |
| Assignment machinery | `repos.assignments` (`AssignmentRepository`, accept/decline + Personal projection via `createMockProjects({ onProjection })`), `features/projects/assignments/assignment-decline.tsx`, `sheets/assignment-reassign-sheet.tsx` |
| Sheets | `features/projects/sheets/project-sheet-host.tsx` + `project-sheet-params.ts` (`project-new`, `project-invite`, `assignment-reassign`); Personal host `features/sheets/sheet-host.tsx` |
| Files | `features/projects/files/files-screen.tsx` (bound to `useProject()` + project hooks) |
| Data seam | `src/data/project-{domain,repositories,queries}.ts`, `src/data/mock/mock-project*.ts`, fixtures `src/fixtures/project*.ts`; aggregate `Repositories` in `data/repositories.ts`, mock wiring `data/mock/mock-repositories.ts`, `data/provider.tsx` (live spreads mock) |
| Personal Calendar | `features/calendar/*` (`CalendarProvider`, month/week/agenda); project reuse example `features/projects/calendar/*` + `repos.calendar.range/myBusy` |
| Personal Goals | `features/goals/{goals-screen,goal-list,goal-detail,goal-panels,goal-sheet}.tsx` (bound to Personal `Goal` + Personal hooks) |
| Messages | No Messages context/route exists → Message buttons render the existing coming-soon state (`ComingSoonBadge` / disabled with hint). |
| i18n | `src/messages/{en,fa}/*.json`, register in `src/messages/client.ts` |

## Reuse (already built — never copy)
- Surfaces: `SignatureCard`/`SignatureCardAction` (notch, side, presets), `ProductCard`, `UtilityCard`, `FolderTabsCard`, `MetricTile`/`MetricGroup`, `notch-path.ts` (`design-system/surfaces/`).
- Feedback: `EmptyState`/`ErrorState`/`LoadingState`/`UnavailableState`, `AccessState`/`AccessBanner`, `Progress`, `StatusChip`, toast with Undo.
- UI kit `components/ui/*` (segmented, pills, avatar/AvatarGroup, popover, sheet, dialog, field…).
- Personal: `TaskRow`, board column/card, BulkBar, calendar views; Project: task views `features/projects/tasks/task-view-shared.tsx`, `workflow-status-chip.tsx`, board model, schedule/time-scale, files screen, members/capacity, analytics SVG patterns, settings `settings-shared.tsx` (DirtyBar, SettingRow).
- **PeopleWorkload** and **CaseFlow** do NOT exist yet. Build once, context-neutral (accent via `data-scope` tokens / accent prop), in `src/components/context/` (`people-workload.tsx`, `case-flow.tsx`); T3 builds PeopleWorkload, T4 builds CaseFlow.

## Conventions
- Module header comment naming the board/spec; pages are Server Components with client islands; `useSearchParams` only inside `<Suspense>`.
- UI never fetches: interface → mock adapter (co-located `*.test.ts`) → React Query hook + key.
- Capabilities come from the repo (`capabilities` object per team); never derive rights from the role label. Hidden vs disabled per SH-02. Forbidden = not found.
- Project-specific components must be generalised with a small seam (scope/owner prop, data hooks passed in) rather than copied; keep Project behaviour and tests unchanged.
- RTL: charts/timelines mirror by coordinates; CaseFlow connectors follow PEOPLE_FLOW (`scaleX(-1)` on the connector SVG, aria-hidden).

## Conflicts with Team DECISIONS (current code vs T1–T12 / owner updates)
1. **T1** — team basePath `/teams` with no `[id]`; hrefs `/teams/<segment>`. Needs `/teams/[id]/…` + `getTeamContext(id)`/`teamHref` like Projects.
2. **T2** — flat rail; ids missing: planning, projects, goals, analytics, recognition, settings (`projects`, `goals`, `analytics`, `settings` ids exist; add `planning`, `recognition`).
3. **T3** — `activity` is a nav item; Activity must be a tab on Overview (no route).
4. **T11** — mobile `[overview, work, calendar]` lacks (+) and More with the remaining modules.
5. **README #9 / owner** — `NonPersonalAssistant` still shows on team routes.
6. Drawer/sheet host are project-scoped; Team needs `/teams/[id]` layout + own `@drawer` intercept (`(.)work/[taskId]`) + team sheet host (`team-new`, `team-invite`, `team-status`) — no catch-all.
7. Project Files/Members/task drawer/sheets are bound to `useProject()`; Team reuse needs a scope seam (see Conventions).
8. Personal Goals components are bound to Personal `Goal`/hooks; TM-07 needs a team-scope data seam.
9. **PEOPLE_FLOW** lists PJ-06 as a CaseFlow user, but PJ-06 is already built as a read-only SVG graph. Team prompts must not change Project screens → PJ-06 stays as is (later decision).
10. **Owner update** Message button → "Messages DM": Messages does not exist → coming-soon state (user rule).
11. OPEN items (status storage scope, check-in schedule, Viewer booking visibility, single Owner, delete retention): per PROMPTS.md notes, apply the design default and mark the spot (`// OPEN(DECISIONS): …` + report), don't invent beyond it.

## Step plan (files per prompt)
- **T1** contexts/types/paths (+tests), switcher Teams list, rails, team mobile More, assistant, `app/(app)/teams/layout.tsx` + `[id]/layout.tsx` + `[id]/[module]` coming-soon, `features/teams/{team-gate,shell,sheets/team-status-sheet}`, `data/team-{domain,repositories,queries}.ts`, `data/mock/mock-teams.ts` (teamRepo, presenceRepo), `fixtures/teams.ts`, AccessState team kinds, messages `Teams`, `TeamStatus`.
- **T2** `teams/page.tsx`, `features/teams/all/*` (TeamCard, TeamInvitationStrip).
- **T3** `teams/[id]/page.tsx`, `components/context/people-workload.tsx`, `features/teams/overview/*`, mock plan/capacity/teamCalendar/activity repos, `Team` messages.
- **T4** `teams/[id]/work`, `components/context/case-flow.tsx`, `features/teams/work/*`, teamTaskRepo + dependencies, `TeamWork`.
- **T5** `teams/[id]/@drawer/(.)work/[taskId]` + full page, `features/teams/task-detail/*`, `TeamTask`.
- **T6** team sheet host: `team-new`, `team-invite` (`TeamNew`, `TeamInvite`).
- **T7** QA A.
- **T8–T13** `teams/[id]/{calendar,planning (+?tab=sprint·backlog·reviews),projects,goals,people}` + `features/teams/*` + mock teamEvent/plan/sprint/projectAssociation/teamGoal/teamMember/capacity repos.
- **T14–T18** `teams/[id]/{checkins,recognition,files,analytics,settings}` + mock checkin/recognition/feedback repos; files via the generalised PJ-10 component.
- **T19** QA B+C.

## Learned during implementation (append one line each)
- T1 (TS-01): team nav = `getTeamContext(id)`/`teamHref(id, item)`/`teamRail` (contexts.ts) + `getTeamIdFromPathname` (paths.ts); `/teams` is a collection context (`TeamCollectionRail` in `features/teams/shell/`); data seam `data/team-{domain,repositories,queries}.ts` + `data/mock/mock-teams.ts` (`teams`/`teamInvitations`/`presence` on `Repositories`, project counts via the Projects mock `findProject`) + `fixtures/teams.ts`; every `/teams/[id]` page renders inside `features/teams/team-gate.tsx` (`useTeam()`, `TeamBanner`, `?state=` from `features/teams/demo-state.ts`), header `TeamPageHeader`, shell islands use `useCurrentTeamAccess()`; sheets `features/teams/sheets/team-sheet-{params,host}.tsx` (`useOpenTeamSheet`); `PresenceDot` in `features/teams/presence.tsx`; AccessState kinds `team-not-available/team-invite/team-removed/team-joined`, banners `team-archived/team-read-only`; seams added: `DemoStateSwitch states` prop, exported `MoreTile` (personal-mobile).
- T2 (TM-00): `features/teams/all/` (`AllTeamsScreen` + exported `matchesTeamFilter`, `TeamCard` product card, `TeamInvitationStrip`); `TeamSummary.restorable` is the server flag for Restore (never derived from role in UI); team tiles reuse `ProjectTile`, dates/numbers reuse `useProjectFormat`.
- T3 (TM-01): shared `components/context/people-workload.tsx` (`PeopleWorkload` + pure `topCenterNotchPath`; clipped background layer so the A–Z radiogroup picker sits in the top-centre notch; accent via `scope`; copy namespace `PeopleWorkload`; status labels/action passed in) and `components/context/presence-dot.tsx` (`PresenceDot`, `ManualStatus`); team overview `features/teams/overview/*` (WeekCard signature, WorkTabs, TeamCalendarCard, ProjectsCard, UpdatesTabs); `SourceChip` + `teamTaskHref` in `features/teams/source-chip.tsx`; mock repos `teamPlans/teamCapacity/teamCalendar/teamActivity/teamCheckins/teamRecognition/teamTasks` + `teams.members/projects` (fixtures `fixtures/team-work.ts`; project-sourced team tasks reuse Website Redesign task ids so they open in PJ-15); `TeamSummary.lead`, `TeamPresence.workingOn` (null unless shared); wiring helper `teamRepositories(store)`.
- T4 (TM-02): shared `components/context/case-flow.tsx` (`CaseFlow`: notched people badges, stage columns max 5 + more, connectors measured in logical coords and mirrored with `rtl:-scale-x-100`, "Needs / Needed by" text for SR + phone captions, outcome tiles; namespace `CaseFlow`); team work `features/teams/work/` (`work-model.ts` pure filters/grouping/`buildFlowModel`, `TeamTaskRow` + `TeamStatusChip`/`TeamStatusControl` (review = teal via personal tokens), `TeamTaskAdd` reusing `projectQuickParse`); `teamTasks.list/projectRefs/create/setStatus/remove` with server-computed `TeamTask.can`; hooks `useTeamTasks(teamId, query, preview)`, `useTeamTaskActions`; PJ-02 `AssigneeAvatar` reused as is.
- T5 (TM-15): own intercept `teams/[id]/@drawer/(.)work/[taskId]` + full page `teams/[id]/work/[taskId]`, `TeamDrawerGate`/`TeamTaskDrawer`/`TeamTaskDetailView` in `features/teams/task-detail/`; PJ-15 seams: `AssignmentBlockView` (context-neutral; `onReassign` optional) and `TaskComments` + exported `PropertyRow` in `project-task-detail-view.tsx` (Project behaviour unchanged); `teamTasks.get/addComment/accept/decline/revertAccept/remind`, accepted team tasks project into Personal as `team-<taskId>` (scope team, project = team name) via `createMockTeams({ onProjection })`; hooks `useTeamTaskDetail` (no retry on not-found), `useTeamTaskDetailActions`.
- T6 (TM-90): `features/teams/sheets/{new-team-sheet,team-invite-sheet}.tsx` in `TeamSheetHost` (team-new opens anywhere under /teams, invite/status need the team in the URL); repo `teams.create` (creator = Owner, id slug) and `teamInvitations.send` (same answer for every address; Admin only from Owners); hooks `useCreateTeam`, `useSendTeamInvites`.
- T7 (QA A): gate green (typecheck, full eslint, build, full vitest 1940 passed / 5 skipped after fixing 2 styleguide tests that still expected Teams disabled); deferred vs screenshots: TM-02 Filters popover, board drag, team Reassign (PJ-90 reassign sheet is project-bound), compact phone overview (TMM01) vs PEOPLE_FLOW phone layout.
- T8 (TM-03): `features/teams/calendar/` (`calendar-model.ts` pure layers/hour window/RSVP/`pickEvent`, `TeamEventCard` signature notch Open link › Edit › Copy link, `TeamEventDialog` create/edit + own time off); repo `teamEvents.range/create/update/rsvp` (`TeamEventDetail`, stored in the team mock and shared with `teamCalendar.range` so the Overview card follows) + `teamCalendar.overlays` (team task dues + events of openable projects, fixtures `fixtures/team-calendar.ts`); own busy = Project `useMyBusy`; PJ-07 seams exported: `CalendarSystemOverride`, `BusyChip`.
- T9 (TM-04): `features/teams/planning/` (`planning-model.ts` pure `planColumns`/`planSummary`/`canPlanTask`/`planTargets`/`addWeeks`, `PlanningScreen` ?week · ?tab=review + WeekFocus, `PlanBoard` dnd-kit pointer drag + "Plan for…" menu + summary signature, `WeekReview`); repo `teamPlans.plan/publish/setFocus/review/decide` + `teamTasks.unplanned` (plan state per team·week in the mock, `TeamWeekPlan.status/publishedAt/publishedBy`, `TeamTask.carriedFrom`, fixtures `fixtures/team-planning.ts` merged into the task store); hooks `useTeamWeekPlan(teamId, week?)`, `useTeamUnplanned`, `useTeamWeekReview`, `useTeamPlanActions`; TM-02 reads `?filter=` (Open my tasks → `?filter=mine`).
- T10 (TM-05): `/planning` routes via `features/teams/planning/planning-route.tsx` (`TeamPlanningRoute`: `team.planningMode === "sprints"` → `SprintScreen`, sprint tabs on a weekly team → `SprintsOff`, else weekly); `features/teams/sprint/` (`SprintScreen` ?tab=backlog·sprint·reviews, sortable backlog with keyboard, `SprintCard` signature + SVG burndown mirrored by coordinates, `sprint-dialogs.tsx` Start/Complete, `useEstimate`); mock `data/mock/mock-team-sprints.ts` (`teamSprints.current/start/complete/reviews`, `teamBacklog.list/rank`, pure `sprintDays`/`burndownOf`; "unsupported" when sprints are off; fixtures `fixtures/team-sprints.ts`, Mobile Squad); hooks `useTeamSprint/useTeamBacklog/useSprintReviews/useSprintActions`.
