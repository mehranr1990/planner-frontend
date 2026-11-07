# Projects (Phase 2) — implementation notes

Result of PROMPTS.md prompt 0 (read-only survey, 2026-11-07). Subagents: read this first; do not re-explore.
Design order: `design/project/README.md` → `../shared/SHARED.md` (by section) → `SCREENS.md` → `DECISIONS.md` → only the SPEC.md section of the current screen. Never open `boards/*.dc.html`.

## Stack & gates
- Next.js 16.4 App Router (Cache Components; route pages export `instant = false`), TS, Tailwind 4, React Query 5, next-intl 4, @dnd-kit (core/sortable), date-fns + date-fns-jalali, lucide-react, Vitest (jsdom).
- Gates per prompt: `npm run typecheck` (= `next typegen && tsc --noEmit`), `npx eslint <touched paths>`, `npx vitest run <touched tests>`. No e2e / Playwright (user rule). No new dependencies.
- Integration WIP was committed in `1211962`; tree is clean except the untracked `chatgpt-context.zip` (never commit it). Commit with explicit `git add <paths>` only — never `git add -A` / `.`. Live-API adapters (`src/data/api/*`) must keep compiling; Projects use mock repos only.

## Key paths
| Area | Path |
|---|---|
| Contexts / nav map | `src/features/navigation/contexts.ts`, `types.ts` (NavItemId list, RailLayout, AppContext), `paths.ts` (pathname → context/item, `getMobileNavItems`) |
| (app) layout + shell | `src/app/(app)/layout.tsx` → `components/shell/shell-frame.tsx` (TopBar, FloatingRail, MobileHeader, MobileShellNav, `floating=<NonPersonalAssistant/>`) |
| Rail | `components/navigation/floating-rail.tsx` (grouped mode when `context.rail` set; flat expandable otherwise), `nav-link.tsx` |
| Mobile | `components/shell/mobile-shell.tsx` (bottom bar + More sheet), `personal-mobile.tsx` (Personal More content/FAB), `components/navigation/mobile-bottom-nav.tsx` |
| Context switcher | `components/shell/shell-context-switcher.tsx`, `components/navigation/context-switcher-panel.tsx` / `-trigger.tsx`, `context-chips.tsx` |
| Workspaces (sample) | `src/fixtures/shell.ts` (`getSampleShellData(locale)`) → `ShellProvider` (`shell-provider.tsx`: `useActiveWorkspace(context)`, workspace kept in shell state) |
| Breadcrumb | `components/navigation/breadcrumbs.tsx` (`<Breadcrumbs scope items>`); page header `components/shell/page-header.tsx` |
| Quick create | `components/shell/quick-create.tsx` (`quickCreateItems`, `QuickCreateMenu`, `QuickAddSheet`) |
| Assistant | `components/shell/non-personal-assistant.tsx` (hidden only when scope = personal) |
| Projects route today | `src/app/(app)/projects/page.tsx` → `components/shell/context-overview.tsx` + `context-placeholder.tsx` (Step-2 placeholder) |
| Personal layout (pattern) | `src/app/(app)/personal/layout.tsx`: `@drawer` slot + `DrawerGate` + `<Suspense><SheetHost/></Suspense>` |
| Task drawer pattern | intercept `personal/@drawer/(.)tasks/[id]/page.tsx` + `@drawer/default.tsx` (null) + full page `personal/tasks/[id]/page.tsx`; `features/personal/task-detail.tsx` (`TaskDetailDrawer` = `Sheet side="end" size="detail" mobileSide="fullscreen"`, back on close, focus return), `features/personal/drawer-gate.tsx` |
| proxy | `src/proxy.ts` — matcher `/personal/tasks/create` only. Do not touch. |
| Sheet host | `features/sheets/sheet-host.tsx` (`containers` map: sheet side center/end + size drawer, or floating), `sheet-params.ts` (`sheetIds`, `sheetHref`, `sheetScopedParams`, open/close history marker). Mounted only in the Personal layout. |
| Data seam | `src/data/repositories.ts` (interfaces + `Repositories` aggregate + `RepositoryError` codes not-found/invalid/forbidden/unsupported/partial) → `src/data/mock/*` (`createMockRepositories`) → `src/data/provider.tsx` (`createRepositories`; live mode spreads `...mock`, so new mock repos flow through) → hooks `src/data/queries.ts` + keys `src/data/query-keys.ts`. Domain types `src/data/domain.ts` (`Task.scope: Scope`). |
| Clock | `src/data/clock.ts` (`getPlannerToday/Now`; mock = fixed 13 Oct 2026) |
| i18n | `src/messages/{en,fa}/*.json`; register client namespaces in `src/messages/client.ts` (both locales); `messages.test.ts` checks en/fa key parity and the client list. |
| Styleguide / demo states | `src/app/styleguide/*` (components, navigation, my-day, rules pages) |
| Scope tokens | `design-system/tokens/colors.ts` (`scopes = personal/project/team/company`); `data-scope="project"` |

## Reusable components (use before creating new)
- Surfaces `src/design-system/surfaces/`: `SignatureCard` (+`SignatureCardHeader`, `SignatureCardAction`, clip-path notch, side end/start, presets) · `NotchedCard`/`NotchedCardButton` (wrapper) · `ProductCard` · `UtilityCard`/`UtilityField` · `FolderTabsCard` (`FolderTab[]`, surface variants) · `MetricTile`/`MetricGroup` · `RingCard` · `FloatingIsland`.
- Feedback: `components/feedback/state-views.tsx` (`EmptyState`, `NoResultsState`, `UnavailableState` (hourglass = "coming soon" page state), `ErrorState`, `LoadingState`), `inline-alert.tsx`, `state-layout.tsx`; `design-system/feedback/` (`Progress` linear bar, `SegmentedProgress`, `StatusChip`); `components/navigation/coming-soon-badge.tsx`.
- UI `src/components/ui/`: button/IconButton, chip, pills, segmented, switch, checkbox, field/input/textarea/select, date-picker + calendar (Jalali), dialog, alert-dialog, sheet (`side`, `size`, `mobileSide`), popover, floating-panel, dropdown-menu, tabs, tooltip, toast (`toast({ action })` → undo), avatar + `AvatarGroup`, badge, skeleton, spinner, search-field.
- Tasks `src/features/tasks/`: list (`task-list.tsx`, `task-row.tsx` `TaskRow`/`ROW_GRID`/`metaPieces`, `task-group.tsx`, `add-task-row.tsx`, `use-list-keyboard.ts`), board (`task-board.tsx`, `board-column.tsx` `BoardColumnView`, `board-card.tsx` `BoardCard`, `done-rail.tsx`, dnd-kit + keyboard + live region), `bulk/bulk-bar.tsx`, `toolbar/` (tasks-toolbar, filters-panel), `create/quick-add.tsx` + `parsed-chips.tsx` (parsing), `detail/task-detail-view.tsx` + `detail-tabs.tsx`, `domain/*` (filters, group, board, keyboard, selection, url-state).
- Calendar `src/features/calendar/`: `calendar-screen.tsx`, `calendar-context.tsx` (`CalendarProvider`), `month-view`, `week-view`, `agenda-view` (`AgendaList`), `calendar-toolbar.tsx` (`CalendarHeader`, `LayerChips(counts: Record<Scope,n>)`), `month-dnd.tsx`, `selected-event-panel.tsx`, `use-calendar-data.ts`.

## Conventions
- Comment style: block comment at top of each module explaining the board/spec it implements; no inline-style copying from boards.
- Pages are Server Components; client islands use `"use client"`. Read search params via `useSearchParams` only inside `<Suspense>`.
- Data: UI never fetches; add `XRepository` interface → mock adapter → hook in queries + keys. Mock modules sit in `src/data/mock/mock-*.ts` with a co-located `*.test.ts`.
- Logical CSS only (`ms-/me-/ps-/start/end`), `rtl:-scale-x-100` only for directional arrows; charts/SVG mirror by coordinates.
- Tests co-located `*.test.ts(x)`; navigation has `components/navigation/test-utils.ts`.

## Conflicts with DECISIONS (current code vs D1–D19)
1. **D1** — `project` context: `basePath "/projects"`, nav hrefs `/projects/<segment>` with no `[id]`; active project lives in shell state (`useActiveWorkspace`). Needs `/projects/[id]/…` routes and hrefs built from the id.
2. **D2** — project nav is a flat expandable rail `[overview,tasks,board,timeline,gantt,flow,docs,analytics]`; no groups, no milestones/risks/workload/members/files/calendar/settings ids.
3. **D3** — `board` (and `flow`) are rail items; must become Tasks view modes (routes kept).
4. **D6** — segment `flow → "case-flow"`, id `docs` exists; rename to `flow`/`files` (`files` id already exists for Teams).
5. **D7** — `/projects` has no collection rail (All projects + 4 recent + New project).
6. **D8** — project mobile slots `[overview, tasks, flow]`; must be Overview · Tasks · (+) · Calendar · More.
7. **README #10** — `NonPersonalAssistant` renders the Assistant on project routes; must hide on project routes.
8. **README #3/#9** — `DrawerGate`, `@drawer` slot and `SheetHost` exist only under `/personal`; projects need their own layout with a separate drawer slot/intercepts (task, risk) and a sheet host for D10 ids — no catch-all, no edits to Personal intercepts or `proxy.ts`.
9. Prompt 1's "existing ComingSoon state": no page-level ComingSoon component exists; closest are `UnavailableState` + `ComingSoonBadge` (and the Step-2 `ContextPlaceholder`, marked for deletion).
10. Personal Tasks list/board are bound to the Personal data path (`useTasksQuery` → `useTasks`/`useTaskCounts`, Personal `TaskView` tabs, `TasksContext` URL state). PJ-02/PJ-03 reuse needs a data-source seam or row/column-level reuse (`TaskRow`, `BoardColumnView`, `BoardCard`), not the whole screen.
11. SCREENS lists Breadcrumb as new — `Breadcrumbs` already exists; extend it rather than duplicate.

## Step plan (files each prompt touches)
- **1 SH-01/02**: navigation `types.ts`/`contexts.ts`/`paths.ts` (+tests), floating-rail (ProjectRail/CollectionRail groups), mobile-shell (project More), context-switcher panel (sections), breadcrumbs, quick-create (target line), new `components/feedback/access-state.tsx` + `access-banner.tsx`, `non-personal-assistant.tsx`, `fixtures/shell.ts`, new `src/data/mock/mock-projects.ts` + repo interfaces, `app/(app)/projects/layout.tsx` + `[id]/…` placeholder routes, messages `Access`, `ContextShell`.
- **2 PJ-00**: `app/(app)/projects/page.tsx`, `src/features/projects/all/*` (ProjectCard, InvitationStrip), messages `Projects`.
- **3 PJ-01**: `projects/[id]/page.tsx`, `features/projects/overview/*` (ForYouCard, PhasesTimeline), mock milestone/activity/risk/workload/assignment repos, messages `Project`.
- **4 PJ-02**: `projects/[id]/tasks/page.tsx`, `features/projects/tasks/*`, workflowRepo + projectTaskRepo, messages `ProjectTasks`.
- **5 PJ-15**: `projects/[id]/@drawer/(.)tasks/[taskId]` + full page, `features/projects/task-detail/*` (AssignmentBlock), Personal projection in mock tasks, messages `ProjectTask`.
- **6 PJ-90**: project sheet host + sheet ids (`project-new`, `project-invite`, `assignment-reassign`), `features/projects/sheets/*`.
- **7 QA A**: Batch-A files only.
- **8–13 (B)**: `projects/[id]/{board,flow,milestones,calendar,timeline,gantt}`, `features/projects/{board,flow,milestones,calendar,timeline,gantt}/*`, shared `SchedulePreviewDialog` (built in 10), phase/milestone/schedule repos.
- **14–20 (C)**: `projects/[id]/{risks,risks/[riskId] (+ drawer intercept),files,members,workload,analytics,settings}`, matching `features/projects/*`, risk/file/member/grant/field/import repos.
- **21 QA B+C**.

## Learned during implementation (append one line each)
- P1: project nav = `getProjectContext(id)`/`projectHref(id, item)` (contexts.ts) + `getProjectIdFromPathname`/`resolveContext` (paths.ts); project data seam = `data/project-{domain,repositories,queries}.ts` + `data/mock/mock-projects.ts` + `fixtures/projects.ts`; every `/projects/[id]` page renders inside `features/projects/project-gate.tsx` (`useProject()` → project + capabilities + `demo`), header = `ProjectPageHeader` (breadcrumb + SH-02 banner), `?state=` demo switch, `AccessState`/`AccessBanner` in `components/feedback/`; project sheets use `features/projects/sheets/project-sheet-params.ts`. Never run prettier on existing files (repo is not prettier-formatted; use `--print-width 120` on new files only).
- P5: project task drawer = `projects/[id]/@drawer/(.)tasks/[taskId]` + `ProjectDrawerGate` (rendered inside `ProjectGate` by `[id]/layout.tsx`); Personal projection of accepted assignments = `createMockProjects({ onProjection })` wired in `mock-repositories.ts` (Personal task id `project-<taskId>`). Pre-existing on HEAD before Batch A: `api-blocks-repository.ts` TS2322 ("time" PartialField) and 6 failures in `api-tasks-repository.test.ts`.
- PJ-90 key/visibility: handoff `openapi.json` defines no project key, visibility or `/projects` paths (contract gap). Key = `data/project-key.ts` (suggest/validate) + `ProjectCreateRepository.isKeyAvailable` + `create` rejects "key-format"/"key-taken" (mock; backend authoritative later); `ProjectSummary.key` seeded WEB/PLA/MOB/BRA/SPR/DAT. Visibility is display-only Private (not sent) until the authorization contract defines values.
- B8 (PJ-03): Tasks view modes share `features/projects/tasks/task-view-shared.tsx` (`useTasksUrlState`, `TaskViewSwitch`, `TaskFiltersPopover`, `ActiveTaskFilters`); board logic is pure in `features/projects/board/board-model.ts` (`decideDrop`); repo adds `projectTasks.transition/reorder/countByStatus`, capabilities `exceedWip`/`reorderTasks`, `ProjectWorkflow.wipLimits/publishedAt`, `ProjectTask.completedAt`.
- B10 (PJ-08): shared `features/projects/schedule/schedule-preview-dialog.tsx` (`SchedulePreviewDialog`: ghost bars, moves, milestone impact, cascade/only, one apply with revisions, conflict → Reload); schedule seam `ScheduleRepository` (`repos.schedule.graph/preview/apply`, mock `data/mock/mock-project-schedule.ts` with pure `computePreview`; links = `blockedBy` + `sampleScheduleLinks`, milestones are graph nodes) + hooks `useScheduleGraph`/`useScheduleActions`; milestone rows/status/phase counts via `milestones.milestoneRows/phaseRows/reorderPhases/updateMilestone`, `risks.byMilestone`.
- B11 (PJ-07): date changes from any view go through `features/projects/schedule/use-reschedule.tsx` (`useReschedule(projectId, canCascade).request/shiftBy` + `dialog`; Members get "only this task", owner rule); project calendar seam `repos.calendar.range/myBusy` (mock `mock-project-calendar.ts`, events + untitled busy fixtures) reusing Personal `CalendarProvider`/`monthGridOf`/`moveInGrid`/`useCalendarFormat`.
- B12 (PJ-04): time axis/bars shared in `features/projects/schedule/time-scale.ts` (`makeScale` RTL-mirrored x/span/ticks, `packRows`) and `bar-drag.ts` (`useBarDrag`, `draggedSpan`, `BAR_CLASS`); overlaps via `repos.schedule.overlaps` / `useAssigneeOverlaps`.
- B13 (PJ-05): Gantt = `features/projects/gantt/gantt-screen.tsx` (`arrowPath` FS/SS/FF/SF, RTL by `makeScale`) + `dependencies-table.tsx` (keyboard editing); link CRUD + cycle check + critical path on `repos.schedule.addLink/updateLink/removeLink/criticalPath` (mock `dependsOn`, `computeCriticalPath`), hooks `useCriticalPath`, `useScheduleActions().addLink/updateLink/removeLink`.
- C14 (PJ-09): risk register seam = `repos.risks.list({kind,open})/get/history/comments/addComment/update/setChecklistItem/close/resolve/convert` (mock `data/mock/mock-project-risks.ts` on the shared work store, fixtures `fixtures/project-risks.ts`; a risk that became an issue leaves the risk list), hooks `useRiskRegister/useRisk/useRiskHistory/useRiskComments/useRiskActions`, capabilities `editOwnRisk/editAnyRisk/closeRisk`; UI `features/projects/risks/` (`risk-model.ts` pure filters/sort/heat, `risk-chips.tsx` SeverityChip/RiskStatusChip/ProbabilityChip, `risk-heat-map.tsx`); `FilterChip`/`FilterSection` exported from `tasks/task-view-shared.tsx`.
