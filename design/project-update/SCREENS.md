# Projects — screen registry (route → board → components → backend)

Legend — **Design**: ✅ designed (awaiting owner approval). **Backend**: every Phase 2 endpoint is **not built** (backend audit G0 NO-GO) → all screens use **mock adapters** behind the repository seam; show the mock-data flag only in dev/styleguide.

| ID | Route | Screen | Batch | Board | New components (everything else = reuse) | Backend (V3) |
|---|---|---|---|---|---|---|
| SH-01 | (shell) | Context switcher, rails, mobile nav, breadcrumb, Quick Create | A ✅ | `../shared/boards/SH01ContextShell` | ProjectRail, CollectionRail, Breadcrumb, QuickCreate target | P2-01 |
| SH-02 | (all) | Access & page states | A ✅ | `../shared/boards/SH02AccessStates` | AccessState, AccessBanner | P2-01/02 |
| PJ-00 | `/projects` | All projects | A ✅ | `PJ00AllProjects` | ProjectCard, InvitationStrip | P2-01/02/03 |
| PJ-01 | `/projects/[id]` | Overview | A ✅ | `PJ01ProjectOverview` | ForYouCard, PhasesTimeline | P2-03/04/06/07 |
| PJ-02 | `/projects/[id]/tasks` | Tasks · List | A ✅ | `PJ02ProjectTasks` | WorkflowStatusChip, Avatar+acceptance badge | P2-04/05/06 |
| PJ-15 | `/projects/[id]/tasks/[taskId]` | Task detail (drawer/page) | A ✅ | `PJ15ProjectTaskDetail` | AssignmentBlock | P2-04/05/07 |
| PJ-90 | `?sheet=project-new · project-invite · assignment-reassign` (+ `assignment-decline` popover) | Sheets | A ✅ | `PJ90ProjectSheets` | — (sheet host) | P2-02/03/04 |
| PJ-03 | `/projects/[id]/board` | Tasks · Board (view mode) | B ✅ | `PJ03ProjectBoard` | WIP badge, transition-rejected column state | P2-05 |
| PJ-06 | `/projects/[id]/flow` | Tasks · Flow (CaseFlow + read-only workflow graph + table) | B ✅ (updated 10 Nov) | `PJ06ProjectFlow` | **CaseFlow**, WorkflowGraph (SVG) | P2-05 |
| PJ-08 | `/projects/[id]/milestones` | Phases & milestones | B ✅ | `PJ08ProjectMilestones` | PhaseList, MilestoneRow | P2-03 |
| PJ-07 | `/projects/[id]/calendar` | Calendar | B ✅ | `PJ07ProjectCalendar` | — (Personal Calendar + scope layer) | P2-07 |
| PJ-04 | `/projects/[id]/timeline` | Timeline | B ✅ | `PJ04ProjectTimeline` | TimelineLanes (SVG/CSS) | P2-07 |
| PJ-05 | `/projects/[id]/gantt` | Gantt + reschedule preview | B ✅ | `PJ05ProjectGantt` | Gantt (SVG), SchedulePreviewDialog, DependenciesTable | P2-05 |
| PJ-09 | `/projects/[id]/risks` | Risks & issues | C ✅ | `PJ09ProjectRisks` | RiskRow, RiskHeatMap | P2-06 |
| PJ-16 | `/projects/[id]/risks/[riskId]` | Risk / issue detail (drawer/page) | C ✅ | `PJ16ProjectRiskDetail` | RiskDrawer (same shell as task drawer) | P2-06 |
| PJ-10 | `/projects/[id]/files` | Files | C ✅ | `PJ10ProjectFiles` | FileRow (upload/scan states), FilePreview | P2-07 |
| PJ-13 | `/projects/[id]/members` | Members, invitations, guests | C ✅ | `PJ13ProjectMembers` | MemberRow, RolePopover, GuestGrant | P2-02 |
| PJ-11 | `/projects/[id]/workload` | Workload | C ✅ | `PJ11ProjectWorkload` | WorkloadGrid | P2-06 |
| PJ-12 | `/projects/[id]/analytics` | Analytics | C ✅ | `PJ12ProjectAnalytics` | BurnUp, Throughput (SVG) | P2-06 |
| PJ-14 | `/projects/[id]/settings?tab=general·workflow·fields·access·import·lifecycle` | Settings | C ✅ | `PJ14ProjectSettings` | WorkflowEditor + TransitionMatrix, FieldList, CsvImport, Lifecycle actions | P2-02/03/05 |

## Mobile & locale coverage
- Mobile 390: `PJM01ProjectMobile` (PJ-00, 01, 02, 15, decline, invite) · `PJM03ProjectMobile2` (board, milestones, timeline list, risks, risk detail, files, members, workload, settings root).
- Not on phones: Gantt (Dependencies list read-only), Flow graph (table only), workflow editing.
- Persian RTL: `PJM02ProjectFa` (A) · `PJM04ProjectFa2` (board, milestones, risks, members). Timeline/Gantt mirror by coordinates (x = width − x), never CSS flip.
- Dark: every board has `…Dark`.
- 1024: right columns drop under the main column below 1180px (PJ-01, 08, 09, 10, 11, 13); Gantt keeps the table sticky and scrolls the chart.

## Required states
All routes: SH-02 states (loading · error/retry · offline · unauthenticated · not-available (forbidden = not found) · revoked · archived · read-only role · guest · deleted) + each board's **States** tab (empty first use, empty filtered, upload failed, scan blocked, not enough data, cycle rejected, transition not allowed, conflict, etc.).
