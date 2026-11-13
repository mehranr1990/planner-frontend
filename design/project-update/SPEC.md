# Projects (Phase 2) — design spec · COMPLETE (Batches A + B + C)

Status: **all Project screens designed, awaiting owner approval.** Batch A (directory, overview, tasks list, task detail, sheets) · Batch B (board, flow, milestones, calendar, timeline, Gantt) · Batch C (risks + detail, files, members, workload, analytics, settings) · mobile 390 + Persian RTL + dark for all.
Read with: `../shared/SHARED.md` (shell + access states), `SCREENS.md`, `DECISIONS.md`, and the locked Personal rules (`design/CLAUDE.md`, `design/PERSONAL.md` → P00CardsTabs).
Every spec section below is extracted from the board's folder tabs. Visuals: `screenshots/<Board>.jpg`, dark `<Board>Dark.jpg`, tab captures `<Board>__<Tab>.jpg`.

---

## PJ-00 · All projects  
Batch A · `boards/PJ00AllProjects.dc.html` · `screenshots/PJ00AllProjects.jpg` · dark: `PJ00AllProjectsDark`

#### States · 4

- **List view (segmented)** — Project · Status · Progress · Next milestone · My role · For you · Website Redesign · At risk · 58% · Beta · 20 Aban · Manager · 3 · Planner App · On track · 71% · Wave 2 · 30 Mehr · Member · 2 · Mobile Onboarding · Off track · 22% · Prototype · overdue 3d · Owner · 1 · Brand Refresh · Paused · 40% · Paused by you · Owner · —
- **Empty · first use** — No projects yet · Projects keep shared work, people and files together. Start one, or accept an invitation when it arrives. · New project
- **Archived** — Archived tab · Spring Campaign · Archived 12 Shahrivar · read-only · Restore · Restore needs Owner/Admin; others see “View”.
- **Loading** — Loading

#### Rules

- **Job** — Find the project you need and act on invitations. Directory, not a dashboard.
- **Pills (local filter)** — All · Owned by me · Member · Invitations · Archived. Counts come from the server and include only what the user can see.
- **Card (product, no notch)** — Initials tile, name, my role, status chip, one-line description, % + bar (tasks done / total), next milestone (red if overdue), date range, member avatars (max 3 + n), “n for you” = my open accepted + pending assignments, updated time.
- **Invitation strip** — Pending invitations show only name, inviter and offered role (public-safe). Accept → opens the project; Decline → confirm with optional note.
- **Status** — On track / At risk / Off track are set by a Manager+ (not computed). Paused and Archived come from lifecycle.
- **Sort** — Recently active (default) · Name · Due date · Progress.
- **No quota** — No “2 projects” limit or upsell anywhere (future candidate quota is not enforced).
- **Team/Company** — No association UI until Phase 3/4. Cards never show a team/company owner yet.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Accessible projects list (owned/member/archived) with counts, status, progress, next milestone, my role | P2-01 kernel + P2-03 project core | Not built | projectRepo.listAccessible (fixtures: 5 projects) |
| Pending invitations (public-safe preview) | P2-02 invitations | Not built | invitationRepo.listMine |
| Accept / decline invitation | P2-02 | Not built | invitationRepo.accept/decline (mock moves card) |
| My open assignments per project | P2-04 assignment | Not built | derived in mock |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Projects.title | Projects | پروژه‌ها |
| Projects.new | New project | پروژه‌ی جدید |
| Projects.filter.owned | Owned by me | متعلق به من |
| Projects.filter.member | Member | عضو |
| Projects.filter.invites | Invitations | دعوت‌ها |
| Projects.filter.archived | Archived | بایگانی |
| Projects.card.forYou | {n} for you | {n} برای شما |
| Projects.card.updated | Updated {time} | به‌روزشده {time} |
| Projects.invite.line | {name} invited you as {role} | {name} شما را به‌عنوان {role} دعوت کرد |
| Projects.empty.title | No projects yet | هنوز پروژه‌ای ندارید |


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Filter change | Cards cross-fade, grid reflows | 200ms | Swap |
| Accept invitation | Strip collapses, new card scales in at top | 260ms | Swap |



## PJ-01 · Project overview  
Batch A · `boards/PJ01ProjectOverview.dc.html` · `screenshots/PJ01ProjectOverview.jpg` · dark: `PJ01ProjectOverviewDark`

#### S4 reconciliation · 10

| S4 board zone | Final | Why |
| --- | --- | --- |
| Tabs Overview/Board/Timeline/… under the title | Project rail (SH01) | Global destinations are navigation, never tabs |
| 72% ring | 58% number + linear bar with expected-pace marker | Rings only in Personal Overview/Habits |
| Hero with empty arrow corner | Signature card, notch = Open tasks | Notch always holds a real action (spec PJ-01) |
| “Design shipped early…” headline | Status note written by a Manager (author + time shown) | No AI; human status report |
| KPI tiles incl. Budget used 58% | Milestones · Overdue · Open risks · Due this week | Budget is not a Project feature (Company, Phase 4) |
| Journey strip | Phases & timeline product card | Phases are a backend concept (P2-03) |
| Folder tabs Progress/Milestones/Risks/Budget + weekly bars | FolderTabs Activity · Risks & blockers · Team load | Sections of the same project object; weekly bar chart moved to Analytics |
| Kanban preview To do/In progress… | Removed (Tasks has Board) | Avoid duplicate views on Overview |
| Insight banner + Apply suggestion | Removed | AI deferred |
| Assistant FAB | Hidden | AI deferred |


#### Rules

- **Read order** — Title + status → status card (progress, note, 4 KPIs) → For you (accept/decline) → phases/timeline → milestones → activity/risks/load.
- **Signature budget** — One signature card (status). Notch = Open tasks → /projects/[id]/tasks. For you, milestones, phases are product cards.
- **Volt** — Only the timeline now-dot.
- **Status note** — Manager+ can edit status + note (popover from the status chip). Members see read-only. History in Activity.
- **For you** — Pending assignments for the current user with Accept/Decline (decline needs a reason, P90 sheet). Hidden when empty.
- **Team load** — Only estimates of tasks in this project (capacity = member’s weekly project hours set by Manager). Hidden for Viewer/Guest.
- **Role differences** — Viewer: no Invite/New task, no Accept (no assignments), no Team load. Guest: Overview shows only “Your shared tasks” card.
- **Archived** — Archived banner (SH02), all actions hidden except Export/Restore.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View overview | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit status / note | ✓ | ✓ | ✓ | — | — | — |
| Invite members | ✓ | ✓ | — | — | — | — |
| Create task | ✓ | ✓ | ✓ | ✓ | — | — |
| See team load | ✓ | ✓ | ✓ | ✓ | — | — |
| Accept/decline own assignment | ✓ | ✓ | ✓ | ✓ | — | assigned |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Project summary: status, note, dates, progress, expected pace | P2-03 core + P2-06 reporting | Not built | projectRepo.get + summary |
| Milestones/phases | P2-03 | Not built | phaseRepo/milestoneRepo |
| Pending assignments for me | P2-04 | Not built | assignmentRepo.listMine(project) |
| Activity feed | P2-07 | Not built | activityRepo.list(project) |
| Risks open | P2-06 | Not built | riskRepo.list(open) |
| Team load (estimates) | P2-06 workload primitives | Not built | workloadRepo.week |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Project.status.onTrack | On track | طبق برنامه |
| Project.status.atRisk | At risk | در خطر |
| Project.status.offTrack | Off track | عقب از برنامه |
| Project.hero.done | {done} of {total} tasks done | {done} از {total} کار انجام شد |
| Project.hero.expected | Expected today: {pct} | انتظار تا امروز: {pct} |
| Project.forYou.title | For you | برای شما |
| Project.assign.accept | Accept | می‌پذیرم |
| Project.assign.decline | Decline | نمی‌پذیرم |
| Project.kpi.overdue | Overdue tasks | کارهای عقب‌افتاده |
| Project.load.note | From task estimates in this project only | فقط از تخمین کارهای همین پروژه |


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Enter | Cards fade + rise, bar grows to % | 320ms | Static |
| Accept assignment | Card collapses into My open tasks list (+1) | 240ms | Swap |
| Status change | Chip colour cross-fades; activity row slides in | 200ms | Swap |



## PJ-02 · Project tasks  
Batch A · `boards/PJ02ProjectTasks.dc.html` · `screenshots/PJ02ProjectTasks.jpg` · dark: `PJ02ProjectTasksDark`

#### Board & Flow views · 2

To do

Icon set

2 Nov

Empty states

26 Oct

In progress

API integration

20 Oct

In review

Design QA handoff

18 Oct

Blocked

Checkout flow

15 Oct

Board = columns are the published workflow statuses (version 3). Dragging to a column is only allowed if the transition is allowed for your role; otherwise the column shows a “not allowed” outline and the card returns.

To do

In progress

In review

Done

Blocked

Flow view (read-only) shows statuses as a graph with counts and allowed transitions; editing the workflow happens in Settings › Workflow (Batch C).


#### Rules

- **Reuse** — Same TaskRow, grouping, filters, keyboard, inline edit and BulkBar as Personal P03. New: Status (workflow), Assignee with acceptance state, Phase/Section grouping, dependency marker.
- **View modes (segmented)** — List /projects/[id]/tasks · Board /board · Flow /flow. Filters and selection persist between views.
- **View pills** — All · My tasks · Unassigned · Overdue · Completed. Group: Phase (default) · Status · Assignee · Milestone · None.
- **Assignment state** — Avatar badge: clock = pending, ✕ = declined (row explains reason and “needs reassignment”). Status is independent of acceptance.
- **Mixed permissions in bulk** — Actions the role can’t apply to every selected task are disabled with “You can change 1 of 2 selected”. Never partial silent apply.
- **Conflicts** — Server revision mismatch on save → SH02 conflict banner on the row (compare / reload).
- **Quick add** — Parses @person, !priority, due, ~estimate; creates in the group it was typed in; assignee gets a pending assignment.
- **⋯ menu** — Import CSV (dry-run preview, Batch C), Export CSV, Templates.
- **Viewer / Guest** — Viewer: read-only rows (no checkboxes, no add). Guest: only granted tasks, no grouping by people.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| See tasks | ✓ | ✓ | ✓ | ✓ | ✓ | assigned |
| Create / edit any task | ✓ | ✓ | ✓ | — | — | — |
| Edit tasks assigned to me | ✓ | ✓ | ✓ | ✓ | — | assigned |
| Assign / reassign | ✓ | ✓ | ✓ | — | — | — |
| Change status (workflow rules) | ✓ | ✓ | ✓ | ✓ | — | assigned |
| Delete | ✓ | ✓ | — | — | — | — |
| Bulk edit | ✓ | ✓ | ✓ | — | — | — |
| Import CSV | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Task list with workflow status, assignee + acceptance, phase/section, milestone, dependencies, estimates | P2-03/04/05 + existing Task engine | Not built | projectTaskRepo.list (scope=project) |
| Workflow definition (statuses, transitions) | P2-05 | Not built | workflowRepo.published(project) |
| Bulk update with capability check | P2-06 bulk | Not built | projectTaskRepo.bulkUpdate |
| Assign / reassign / decline reason | P2-04 | Not built | assignmentRepo.assign/decline/reassign |
| Revision for conflict detection | cross-cutting (ETag/version) | Not built | mock revision counter |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| ProjectTasks.view.list | List | فهرست |
| ProjectTasks.view.board | Board | تخته |
| ProjectTasks.view.flow | Flow | جریان |
| ProjectTasks.tab.mine | My tasks | کارهای من |
| ProjectTasks.tab.unassigned | Unassigned | بدون مسئول |
| ProjectTasks.assign.pending | Waiting for {name} to accept | منتظر پذیرش {name} |
| ProjectTasks.assign.declined | Declined by {name} · needs reassignment | {name} نپذیرفت · نیاز به واگذاری دوباره |
| ProjectTasks.dep.blocked | blocked by {n} | مسدود توسط {n} |
| ProjectTasks.bulk.partial | You can change {n} of {total} selected | می‌توانید {n} مورد از {total} مورد انتخاب‌شده را تغییر دهید |


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| List ↔ Board ↔ Flow | Shared-element morph as in Personal | 320ms | Cross-fade |
| Drag to column (not allowed) | Column outline turns rose, card springs back | 220ms | Instant return |
| Accept from row | Badge clock → none, row text updates | 160ms | Swap |



## PJ-03 · Project board  
Batch B · `boards/PJ03ProjectBoard.dc.html` · `screenshots/PJ03ProjectBoard.jpg` · dark: `PJ03ProjectBoardDark`

#### Rules

- **Columns** — Exactly the published workflow statuses (version shown in the toolbar). Done collapses cards older than 7 days.
- **Drag = transition** — Dropping into a column requests that transition. Allowed → card moves (optimistic) and the server confirms; not allowed for this role or by the workflow → the column gets a rose outline + reason, card springs back. Server rejection after drop → card returns + toast with reason.
- **WIP limits** — Optional per status (Settings › Workflow). Over the limit: header turns amber, drop still allowed with confirmation for Manager+, blocked for others.
- **Swimlanes** — None · Phase · Assignee. Drag across lanes changes phase / assignee only if the role can.
- **Keyboard / touch** — Same as Personal board: Space lift, arrows move between columns, Enter drop, Esc cancel; long-press 200 ms on touch; live-region announcements.
- **Cards** — Product cards, no notch: title, optional context line (milestone / blocked / declined), assignees with acceptance badges, due (red if overdue), estimate, priority.
- **Reorder** — Order within a column is per-project manual order (Manager+); members can only move their own cards between columns.
- **Mobile** — Columns become snap pages (pager on top). Long-press to drag across pages.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Move own assigned cards | ✓ | ✓ | ✓ | ✓ | — | assigned |
| Move any card | ✓ | ✓ | ✓ | — | — | — |
| Exceed WIP limit | ✓ | ✓ | ✓ | — | — | — |
| Reorder within column | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Tasks by status with order | P2-05 + P2-07 view query (Kanban) | Not built | projectTaskRepo.list({view:"board"}) |
| Transition request with revision | P2-05 workflow transition check | Not built | projectTaskRepo.transition(id, to, rev) |
| WIP limits | P2-05 (proposed) | Not built | workflowRepo.published |
| Manual order | P2-07 view query | Not built | projectTaskRepo.reorder |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| ProjectBoard.notAllowed | Not allowed: {from} → {to} | مجاز نیست: {from} ← {to} |
| ProjectBoard.wip | WIP {n} / {max} | در جریان {n} از {max} |
| ProjectBoard.rejected | The server didn’t accept this move: {reason} | این جابه‌جایی پذیرفته نشد: {reason} |
| ProjectBoard.swimlanes | Swimlanes | ردیف‌بندی |


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Drop allowed | Card settles, counts tick | 220ms spring | Instant |
| Drop not allowed | Rose outline pulses once, card springs back | 240ms | Outline only |
| Server reject | Card animates back to origin + toast | 260ms | Instant + toast |



## PJ-06 · Flow view  
Batch B · `boards/PJ06ProjectFlow.dc.html` · `screenshots/PJ06ProjectFlow.jpg` · dark: `PJ06ProjectFlowDark`

**Main screen (updated):** filter pills → **CaseFlow** board of tasks (see `PEOPLE_FLOW.md` §2); below it the read-only Workflow graph + accessible table (the old Flow view).

#### Rules

- **Flow view (CaseFlow)** — Main part of ?view=flow. Filter pills: All open tasks · each milestone · My tasks (default = nearest at-risk milestone, else All). Columns = workflow statuses except Done/Blocked; Blocked = row state; last block = Done tiles (most recent highlighted) + the milestone tile. Rows = tasks (max 5 per column, then “+N more” → List filtered). Lines = task dependencies (“needs”) from PJ-15: solid project blue = upstream done, dashed red = waiting. Notch = assignees with open-task badges (click = filter by person). Click row = task drawer. Phones: stacked columns.
- **Read-only** — The Workflow section shows the published workflow as a graph. Editing statuses/transitions happens only in Settings › Workflow (versioned).
- **Project ≠ company approvals** — This is the task status graph of one project; company approval workflows (Phase 4) are a different component.
- **Accessibility** — The table under the graph lists the same transitions; screen readers get the table, the SVG is aria-hidden.
- **RTL** — Graph geometry mirrors through coordinates (x → width − x), arrowheads point the other way; never CSS flip.
- **Mobile** — Not shown on phones; the More sheet links to the table version.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Published workflow with statuses, transitions, roles | P2-05 | Not built | workflowRepo.published |
| Counts per status | P2-07 view query | Not built | projectTaskRepo.countByStatus |



## PJ-15 · Project task detail  
Batch A · `boards/PJ15ProjectTaskDetail.dc.html` · `screenshots/PJ15ProjectTaskDetail.jpg` · dark: `PJ15ProjectTaskDetailDark`

#### Accept / decline · 3

- **Decline (popover / sheet)** — Decline assignment · Tell Sara why — it helps reassign. · No capacity · Not my area · Missing information · Other · Add a note (optional) · Cancel · Decline
- **Accept** — After accepting · Accepted · added to your tasks · Undo · Task now appears in Personal › Tasks with a blue “Website Redesign” source chip and in My Calendar on its due date. It is a projection: editing rules stay the project’s. Optional “Add private time block” offers My Day slots.
- **Viewer** — Viewer · View only · comments allowed if project setting permits · Notch action becomes “Copy link” (still a real action, never empty).

#### Rules

- **Container** — Same drawer as Personal P06 (540px, soft-nav intercept on /projects/[id]/tasks/[taskId], full page on hard load, full screen on mobile).
- **Notch** — Mark done (moves to the workflow’s done status if allowed; else disabled reason). Viewer: Copy link.
- **Assignment block** — Shown only to the assignee while pending: Accept / Decline (reason chips + note). Managers see “Pending · Kian F.” with Remind / Reassign instead.
- **Properties** — Status (only allowed transitions listed), Assignee + contributors, Dates, Estimate + logged time, Phase · section, Milestone, Custom fields, Show in My Calendar.
- **Folder tabs** — Comments (default when the task has unread comments) · Subtasks · Links (dependencies + files, as Personal P06) · Activity.
- **Dependencies** — FS/SS/FF/SF with lag; adding a dependency that creates a cycle shows inline error “This would create a loop”. Date changes never cascade without preview.
- **Privacy** — Personal notes/time blocks of the assignee are never shown here.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Edit fields | ✓ | ✓ | ✓ | own | — | assigned |
| Change status | ✓ | ✓ | ✓ | ✓ | — | assigned |
| Accept/decline (if assignee) | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Reassign | ✓ | ✓ | ✓ | — | — | — |
| Comment | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Delete | ✓ | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Task detail incl. workflow transitions allowed for me | P2-05 | Not built | projectTaskRepo.get + workflowRepo |
| Assignment accept/decline | P2-04 | Not built | assignmentRepo |
| Comments, files, activity | P2-07 | Not built | commentRepo/fileRepo/activityRepo |
| Dependencies | P2-05 | Not built | dependencyRepo |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| ProjectTask.assign.banner | {name} assigned this to you | {name} این کار را به شما سپرد |
| ProjectTask.decline.title | Decline assignment | نپذیرفتن کار |
| ProjectTask.decline.reason.capacity | No capacity | ظرفیت ندارم |
| ProjectTask.dep.cycle | This would create a loop | این کار یک چرخه می‌سازد |
| ProjectTask.calendar | Show in My Calendar | نمایش در تقویم من |



## PJ-90 · Project sheets  
Batch A · `boards/PJ90ProjectSheets.dc.html` · `screenshots/PJ90ProjectSheets.jpg` · dark: `PJ90ProjectSheetsDark`

Three sheets side by side: `?sheet=project-new` (name, key, dates, template, visibility; Team/Company association row disabled “available in a later phase”), `?sheet=project-invite` (emails, role list with descriptions, verified-only copy that never reveals whether an account exists, pending invites with resend/cancel), `?sheet=assignment-reassign` (current assignee + reason, member picker with capacity this week, note). Bottom sheets on mobile (PJM01). Decline popover is on PJ-15.



## PJ-08 · Phases & milestones  
Batch B · `boards/PJ08ProjectMilestones.dc.html` · `screenshots/PJ08ProjectMilestones.jpg` · dark: `PJ08ProjectMilestonesDark`

#### Rules

- **Model** — Phases (ordered sections with dates) contain tasks; milestones are dated checkpoints linked to a phase and to tasks. No subprojects.
- **Status** — Reached (all linked tasks done or manually marked by Manager+), Next (earliest open), At risk (due ≤ 14 days and < 50 % done, or a linked high risk), Planned.
- **Detail** — Right panel = signature card (notch Edit milestone): progress, linked risk, tasks, open in Tasks filtered.
- **Reschedule** — Changing a milestone date that has dependent tasks opens the same preview dialog as Gantt — never cascades silently.
- **Phases** — Left list; drag to reorder; dates shown; done phases collapse their tasks on Timeline.
- **Mobile** — Phases become pills; milestones list; detail as full screen.


#### Journey view (proposal)

Goal Milestone Path


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | ✓ | assigned |
| Create/edit phases & milestones | ✓ | ✓ | ✓ | — | — | — |
| Mark reached | ✓ | ✓ | ✓ | — | — | — |
| Delete | ✓ | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Phases, sections, milestones with linked tasks | P2-03 | Not built | phaseRepo.list / milestoneRepo.list |
| Milestone ↔ risk link | P2-06 | Not built | riskRepo.byMilestone |
| Date change preview | P2-05 reschedule preview/apply | Not built | scheduleRepo.preview/apply |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Milestones.title | Phases & milestones | فازها و نقاط عطف |
| Milestones.status.reached | Reached | رسیده |
| Milestones.status.next | Next | بعدی |
| Milestones.status.risk | At risk | در خطر |
| Milestones.new | New milestone | نقطه‌ی عطف جدید |



## PJ-07 · Project calendar  
Batch B · `boards/PJ07ProjectCalendar.dc.html` · `screenshots/PJ07ProjectCalendar.jpg` · dark: `PJ07ProjectCalendarDark`

#### Rules

- **Reuse** — Personal Calendar (P04) month/week/agenda components with the project as a single scope layer (blue).
- **Sources** — Task due dates, milestones, project events (meeting basics; full meetings in Phase 5). No other projects, no other people’s personal calendars.
- **Personal busy overlay** — Off by default; shows only the current user’s own busy blocks as untitled hatched slots to help scheduling. Never visible to others.
- **Drag** — Dragging a task chip to another day changes its due date only if the role can edit it; dependent tasks → preview dialog (Gantt rule).
- **Accepted tasks** — Accepted assignments also appear in Personal Calendar as a read-only projection (P04 “Managed in Projects” rule).
- **Mobile** — Agenda view by default.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Project calendar items (tasks with dates, milestones, events) | P2-07 view query (Calendar) | Not built | projectCalendarRepo.range |
| Own busy blocks (privacy-safe) | A07 projections | Not built | mock from Personal blocks (current user only) |



## PJ-04 · Timeline  
Batch B · `boards/PJ04ProjectTimeline.dc.html` · `screenshots/PJ04ProjectTimeline.jpg` · dark: `PJ04ProjectTimelineDark`

#### Rules

- **Purpose** — Readable time view of phases and tasks (no dependency editing — that is Gantt). Lanes by phase (default) or assignee.
- **Bars** — Status colours with label; blocked = rose outline; milestones = diamonds on the axis; now line with volt dot (the only volt).
- **Overlap annotation** — By assignee: overlapping assignments show an amber chip “n overlaps for …”, click highlights them.
- **Interaction** — Click bar → task drawer. Drag bar ends = change dates (Member+ on own tasks) → if dependents exist, preview dialog (Gantt rule).
- **Zoom** — Weeks · Months · Quarter (segmented view mode).
- **RTL** — Time flows right → left: x = width − x for all bars, axis and now line (coordinate mirroring).
- **Mobile** — Read-only list grouped by phase with date ranges (no bars).


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Tasks with start/end, phase, assignee, status | P2-07 view query (Timeline) | Not built | projectTaskRepo.list({view:"timeline"}) |
| Overlaps per assignee | P2-06 workload primitives | Not built | derived in mock |



## PJ-05 · Gantt  
Batch B · `boards/PJ05ProjectGantt.dc.html` · `screenshots/PJ05ProjectGantt.jpg` · dark: `PJ05ProjectGanttDark`

#### Dependencies list · 5

| Task | Depends on | Type | Lag |  |
| --- | --- | --- | --- | --- |
| Checkout flow | UI design | FS | +2d | Edit · Remove |
| Payment errors copy | Checkout flow | FS | +5d | Edit · Remove |
| Payment go-live | API integration | FS | +4d | Edit · Remove |
| Payment go-live | Payment errors copy | FS | +0d | Edit · Remove |
| Regression | Payment go-live | FS | +0d | Edit · Remove |
| Launch prep | Regression | FS | +0d | Edit · Remove |


#### Cycle

Cycle rejected

“Launch prep” already depends on “Regression” → this would create a loop.


#### RTL

RTL: x = width − x for every bar, arrow and the now line; table moves to the right; arrows still go from predecessor end to successor start. Never CSS scaleX.


#### Rules

- **Specialized component** — New Gantt component (virtualized rows, horizontal scroll, zoom Days/Weeks/Months). Left table is sticky; columns resizable.
- **Dependencies** — FS, SS, FF, SF with lag (+) / lead (−). Create by dragging from a bar end; edit type/lag in the task drawer or the Dependencies list.
- **Preview before apply** — Any change that affects other tasks opens the preview: ghost (old) vs new bars, list of moved tasks, milestone impact, choice “move dependents” or “only this task”. Apply sends one request with expected revisions; conflicts → SH02 conflict state.
- **Critical path** — Toggle highlights the longest dependency chain to the final milestone (computed by backend when available; mock computes locally).
- **Accessible alternative** — “Dependencies list” (table) supports full keyboard editing; drag is never the only way.
- **Permissions** — Manager+ edits any bar/dependency; Members edit dates of their own tasks only if no dependents, otherwise preview requires Manager approval (proposal).
- **Mobile** — Not available on phones: More › Gantt opens the Dependencies list read-only.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Edit dates (no dependents) | ✓ | ✓ | ✓ | own | — | — |
| Edit dependencies | ✓ | ✓ | ✓ | — | — | — |
| Apply cascade | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Tasks with start/end/duration + dependency graph | P2-05 dependencies + P2-07 view query (Gantt) | Not built | dependencyRepo.list |
| Reschedule preview / apply | P2-05 explicit preview/apply | Not built | scheduleRepo.preview/apply (mock computes) |
| Cycle check | P2-05 cycle rejection | Not built | mock DFS |
| Critical path | P2-06 reporting (proposed) | Not built | mock |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Gantt.preview.title | Preview: {change} | پیش‌نمایش: {change} |
| Gantt.preview.notSaved | Nothing is saved yet | هنوز چیزی ذخیره نشده |
| Gantt.preview.apply | Apply {n} changes | اعمال {n} تغییر |
| Gantt.cycle | This would create a loop | این کار یک چرخه می‌سازد |
| Gantt.dep.FS | Finish → start | پایان به شروع |
| Gantt.dep.SS | Start → start | شروع به شروع |
| Gantt.dep.FF | Finish → finish | پایان به پایان |
| Gantt.dep.SF | Start → finish | شروع به پایان |


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Drag | Bar follows pointer, snaps to day | pointer | — |
| Preview | Ghost appears, moved bars slide to new position | 300ms | Instant |
| Apply | Ghosts fade | 200ms | Instant |



## PJ-09 · Risks & issues  
Batch C · `boards/PJ09ProjectRisks.dc.html` · `screenshots/PJ09ProjectRisks.jpg` · dark: `PJ09ProjectRisksDark`

#### States · 3

- **Empty first use** — No risks yet · List what could go wrong before it does. Owners and mitigation make risks useful. · New risk
- **Issues tab** — High · Sandbox keys expired · raised 2d ago · Medium · Staging deploy flaky · from R-06 · Issues = things that already happened: severity only (no probability), plus resolution.
- **Viewer** — View only · “New risk” hidden · comments per project setting

#### Rules

- **Model** — Risk = may happen (severity × probability). Issue = has happened (severity, resolution). A risk can be converted to an issue (keeps history, link back).
- **Scales** — Severity Low · Medium · High · Critical; probability Low · Medium · High (proposed default, see DECISIONS). Score = matrix cell, not a number.
- **Register** — Product card list (no notch); row → risk drawer PJ-16. Sort by score (default), updated, due. Filters: status, owner, milestone, severity.
- **Heat map** — Counts of open risks; colours are the warm severity family, never volt. Cell click = filter; keyboard: arrow keys move, Enter applies. Table alternative = the register.
- **Links** — A risk can link to a milestone and tasks; linked high risks put the milestone “At risk” (PJ-08) and appear in PJ-01 Risks tab.
- **Mobile** — Segmented Risks/Issues; list only; heat map collapses to a 3-line summary (High+, Medium, Low).


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View register | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Create risk / issue | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Edit any risk | ✓ | ✓ | ✓ | — | — | — |
| Edit own risk (owner) | ✓ | ✓ | ✓ | own | — | — |
| Close / convert to issue | ✓ | ✓ | ✓ | — | — | — |
| Delete | ✓ | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Risks & issues with severity, probability, owner, mitigation, links | P2-06 risks/issues | Not built | riskRepo.list({kind, status, owner}) |
| Counts for heat map | P2-06 (derived) | Not built | computed in mock from list |
| History | P2-06 audit | Not built | riskRepo.history(id) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Risks.title | Risks & issues | ریسک‌ها و مسائل |
| Risks.new | New risk | ریسک جدید |
| Risks.severity | Severity | شدت |
| Risks.probability | Probability | احتمال |
| Risks.status.mitigating | Mitigating | در حال کاهش |
| Risks.status.watching | Watching | زیر نظر |
| Risks.convert | Convert to issue | تبدیل به مسئله |
| Risks.empty | No risks yet | هنوز ریسکی ثبت نشده |



## PJ-16 · Risk detail  
Batch C · `boards/PJ16ProjectRiskDetail.dc.html` · `screenshots/PJ16ProjectRiskDetail.jpg` · dark: `PJ16ProjectRiskDetailDark`

#### States · 3

- **Close** — Close risk (notch) · Mitigated · Did not happen · Accepted · Transferred · Closing note (optional) · Cancel · Close risk
- **Convert** — Convert to issue · Creates issue I-03 “Payment API access delayed” with severity High, links back to R-07, and closes R-07 as “Became issue”. · Cancel · Convert
- **Issue variant** — Issue head · High · Open · 2 days · Issue notch = “Resolve” (resolution note required). Viewer: “Copy link”.

#### Rules

- **Container** — Drawer like PJ-15 (soft-nav intercept on /projects/[id]/risks/[riskId], full page on hard load, full screen on mobile).
- **Notch** — Risk: Close risk (reason chips). Issue: Resolve. Viewer: Copy link. Never empty.
- **Head** — Severity, probability, status and linked milestone as chips; title editable inline by Manager+ / owner.
- **Mitigation** — Plan text + checklist; checklist items can be turned into project tasks (“Make task”).
- **History** — Every change of severity/probability/status/owner with who and when (audit). Never deleted.
- **Privacy** — Risks are project data; nothing from Personal is shown or linked.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Risk/issue detail, mitigation, links | P2-06 | Not built | riskRepo.get / update / close / convert |
| History | P2-06 audit | Not built | riskRepo.history |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Risk.close | Close risk | بستن ریسک |
| Risk.reason.mitigated | Mitigated | کاهش یافت |
| Risk.reason.notHappened | Did not happen | رخ نداد |
| Risk.convert | Convert to issue | تبدیل به مسئله |
| Issue.resolve | Resolve | حل شد |



## PJ-10 · Files  
Batch C · `boards/PJ10ProjectFiles.dc.html` · `screenshots/PJ10ProjectFiles.jpg` · dark: `PJ10ProjectFilesDark`

#### States · 3

- **Empty** — No files yet · Upload specs, designs and exports. Files can be linked to tasks. · Upload
- **Upload failed** — empty-states-v2.png failed · connection lost · Retry
- **Guest view** — Guests see only “Shared with guests” and files linked to their granted tasks. Other folders are not listed (not “locked”).

#### Rules

- **Folders** — One level of folders per project (proposal) + smart filters. Moving a file keeps links.
- **Upload states** — Queued → uploading (progress, cancel) → scanning (download disabled) → ready; or blocked by scan / not allowed type / too large (limits from server, never hard-coded).
- **Versions** — New upload with the same name → “Upload as new version?” Version list with who/when; restore older version = new version.
- **Links** — Files link to tasks/risks/milestones; the task drawer Links tab shows them (PJ-15).
- **Preview** — Images and PDF inline; other types show icon + metadata. Notch = Download (disabled with reason while scanning).
- **Delete** — Soft delete → “Deleted files” (restore by Manager+); delete permission per role table.
- **No quotas** — No storage meter, no paywall. Only technical limits returned by the server.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View / download | ✓ | ✓ | ✓ | ✓ | ✓ | assigned |
| Upload | ✓ | ✓ | ✓ | ✓ | — | assigned |
| New version of own file | ✓ | ✓ | ✓ | own | — | assigned |
| Move / rename any | ✓ | ✓ | ✓ | — | — | — |
| Delete own | ✓ | ✓ | ✓ | own | — | — |
| Delete any / restore | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Folders, files, versions, links | P2-07 files | Not built | fileRepo.list / versions / link |
| Upload + scan status | P2-07 (signed upload + scan) | Not built | mock: timed progress → scan → ready |
| Download | P2-07 signed URL | Not built | mock blob |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Files.title | Files | فایل‌ها |
| Files.upload | Upload | بارگذاری |
| Files.scanning | Scanning… download off | در حال بررسی… دانلود غیرفعال |
| Files.blocked | Blocked by scan | مسدود در بررسی |
| Files.newVersion | Upload new version | بارگذاری نسخه‌ی جدید |
| Files.drop | Drop files here | فایل‌ها را اینجا رها کنید |



## PJ-13 · Members  
Batch C · `boards/PJ13ProjectMembers.dc.html` · `screenshots/PJ13ProjectMembers.jpg` · dark: `PJ13ProjectMembersDark`

#### States · 3

- **Remove member** — Remove Kian F. · 7 open tasks assigned to Kian become · Unassigned · (listed in Tasks › Unassigned). Kian keeps nothing from this project in Personal; projections disappear. · Cancel · Remove
- **Role popover** — Change role · Admin · Manager · Member · Viewer · Owner is changed only by transfer (Settings › Lifecycle).
- **Guest task grant** — Guest grant · Empty states · Icon set · Expires · 30 Nov

#### Rules

- **Invite** — Opens ?sheet=project-invite (PJ-90). Copy never reveals whether an email has an account.
- **Roles** — Role chip = popover; changes apply immediately with Undo toast. Last Owner cannot be removed or demoted.
- **Capacity** — Weekly project hours set by Manager+ per member (proposal, used by Workload). Not linked to Personal data.
- **Guests** — Verified external collaborators; task-level grants with expiry; never see member list beyond assignees of their tasks.
- **Leave project** — Members can leave from the ⋯ menu on their own row; their tasks become Unassigned (same preview).
- **Invitations** — Pending with expiry; Resend, Cancel. Accepting happens from PJ-00 / email link.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| See member list | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Invite Member/Viewer | ✓ | ✓ | ✓ | — | — | — |
| Invite Manager/Admin | ✓ | ✓ | — | — | — | — |
| Change roles | ✓ | ✓ | own | — | — | — |
| Remove member | ✓ | ✓ | own | — | — | — |
| Edit capacity | ✓ | ✓ | ✓ | — | — | — |
| Guest grants | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Members, roles, capacity | P2-02 membership | Not built | memberRepo.list / setRole / remove / setCapacity |
| Invitations | P2-02 invitations | Not built | invitationRepo.list / resend / cancel |
| Guest grants | P2-02 external collaborator grants | Not built | grantRepo.list / set |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Members.title | Members | اعضا |
| Members.invite | Invite | دعوت |
| Members.capacity | Capacity / week | ظرفیت هفتگی |
| Members.remove | Remove from project | حذف از پروژه |
| Members.leave | Leave project | ترک پروژه |
| Members.guestGrant | Grant: {n} tasks · until {date} | دسترسی: {n} کار · تا {date} |



## PJ-11 · Workload  
Batch C · `boards/PJ11ProjectWorkload.dc.html` · `screenshots/PJ11ProjectWorkload.jpg` · dark: `PJ11ProjectWorkloadDark`

#### Rules

- **Meaning** — Sum of estimates of open project tasks per assignee per week, spread evenly across start→due (no start = due week). Capacity from Members (weekly project hours).
- **Privacy** — Only this project. No Personal data (time blocks, Focus, other projects) is used or shown — ever.
- **Colour** — Blue intensity up to capacity; over capacity = rose. No volt.
- **Action** — Cell → member-week signature card; notch = Reassign a task (opens assignment-reassign sheet, PJ-90).
- **Unestimated** — Tasks without an estimate are counted separately: “4 tasks without estimate” chip per member.
- **Accessibility** — Grid is a table (row = member, column = week) with text values; colour is never the only signal (percent shown).
- **Mobile** — List per member with this week + next week bars.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| See workload | ✓ | ✓ | ✓ | — | — | — |
| See own row | ✓ | ✓ | ✓ | ✓ | — | — |
| Reassign from here | ✓ | ✓ | ✓ | — | — | — |
| Edit capacity | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Estimates per assignee per week | P2-06 workload | Not built | workloadRepo.byWeek(range) |
| Capacity per member | P2-02 / P2-06 | Not built | memberRepo.capacity |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Workload.title | Workload | بار کاری |
| Workload.over | Over capacity | بیش از ظرفیت |
| Workload.noCapacity | no capacity set | ظرفیتی تعیین نشده |
| Workload.reassign | Reassign a task | واگذاری دوباره‌ی یک کار |
| Workload.unestimated | {n} tasks without estimate | {n} کار بدون تخمین |



## PJ-12 · Analytics  
Batch C · `boards/PJ12ProjectAnalytics.dc.html` · `screenshots/PJ12ProjectAnalytics.jpg` · dark: `PJ12ProjectAnalyticsDark`

#### States · 3

- **Export** — Export snapshot · CSV · tasks + metrics, current filters · PDF · this page as shown · Export is generated by the server when available; mock downloads a CSV built locally. · Export
- **Not enough data** — Not enough data yet · Charts appear after the first week with done tasks. KPIs still show counts.
- **Member view** — Members see KPIs, burn-up, throughput and status; “Done by assignee” shows only their own row.

#### Rules

- **Every number has a source** — Each KPI caption states numerator, denominator and source (task counts). No score, no health index, no AI.
- **Definitions** — Completion = done / all non-deleted tasks. On-time = done on/before due / done with due. Cycle time = first In progress → Done (median). Overdue = open with due < today.
- **Charts** — Burn-up (scope vs done per week), throughput bars, status and assignee breakdowns. Blue family; current week highlighted; no volt.
- **Accessibility** — Each chart has a “View as table” toggle and an aria-label summary.
- **Range** — 4 weeks · 12 weeks · All (segmented). Timezone = user’s; weeks start Saturday in fa, Monday in en (Personal setting).
- **Mobile** — KPIs 2×2 + burn-up; other charts behind “More charts”.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| View analytics | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| See per-assignee breakdown | ✓ | ✓ | ✓ | own | — | — |
| Export | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| KPIs, burn-up, throughput, breakdowns | P2-06 reports | Not built | reportRepo.summary(range) — mock computes from projectTaskRepo |
| Snapshot export | P2-06 export | Not built | client-side CSV in mock |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Analytics.title | Analytics | تحلیل |
| Analytics.completion | Completion | پیشرفت |
| Analytics.onTime | On-time | به‌موقع |
| Analytics.cycle | Median cycle time | میانه‌ی زمان چرخه |
| Analytics.export | Export snapshot | خروجی گرفتن |
| Analytics.asOf | Data as of {time} | داده‌ها تا {time} |



## PJ-14 · Settings  
Batch C · `boards/PJ14ProjectSettings.dc.html` · `screenshots/PJ14ProjectSettings.jpg` · dark: `PJ14ProjectSettingsDark`

#### Page tabs (in the board, not the spec)

- **General** — name, key (task prefix), start/target end (Gregorian + Jalali), description, colour & icon, manual status + note. Save/Discard.
- **Workflow** — published v3 vs draft v4 chips; status list (drag, category Not started/Active/Done, edit, add); allowed-transitions matrix (from × to); migration preview box with Keep draft / Publish v4.
- **Fields** — custom fields list (name, type + options, applies to, required toggle, ⋯), Add field.
- **Access** — default invite role, Viewers can comment (off), allow guests (on), guest grant default expiry, Members may invite (off).
- **Import** — stepper Upload → Map → Dry run → Import; result tiles 120 / 112 / 8; error table (row, column, problem); Download error report; Import 112 tasks.
- **Lifecycle** — Save as template, Archive, Transfer ownership (successor accepts + reauth; pending state with Cancel request), Delete (danger, owner, reauth).

#### Rules

- **Layout** — One page, folder tabs General · Workflow · Fields · Access · Import · Lifecycle (?tab=…). Members/roles live on PJ-13, not here.
- **Workflow versions** — Edit a draft; tasks use the published version. Publish shows a migration preview: which statuses are removed/renamed and where their tasks go (required mapping). Old versions are read-only history.
- **Transitions** — Matrix of allowed from→to; optional “who” per transition (Manager+ / assignee). The Flow view (PJ-06) shows the published graph.
- **Custom fields** — Per project; type can’t change after values exist; delete asks first with value count.
- **Import** — CSV only: upload → map columns → dry run (no changes) → import valid rows; error report downloadable.
- **Lifecycle** — Archive/restore (Admin+), save as template, transfer ownership (successor accepts + reauth), delete (Owner, reauth). Every action shows SH-02 states to others.
- **Dirty state** — Unsaved changes in General/Fields → sticky bar “Unsaved changes · Discard · Save”; leaving asks to confirm.
- **Mobile** — Settings root list → each tab as its own page; workflow editor is read-only on phones.


#### Permissions

| Action | Owner | Admin | Manager | Member | Viewer | Guest |
| --- | --- | --- | --- | --- | --- | --- |
| Open settings | ✓ | ✓ | ✓ | — | — | — |
| General | ✓ | ✓ | ✓ | — | — | — |
| Workflow / fields | ✓ | ✓ | — | — | — | — |
| Access | ✓ | ✓ | — | — | — | — |
| Import CSV | ✓ | ✓ | ✓ | — | — | — |
| Archive / template | ✓ | ✓ | — | — | — | — |
| Transfer / delete | ✓ | — | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Project metadata | P2-01/03 | Not built | projectRepo.update |
| Workflow drafts, publish, migration preview | P2-05 workflow versions | Not built | workflowRepo.draft / previewPublish / publish |
| Custom fields | P2-05 custom fields | Not built | fieldRepo.list / create / update / remove |
| CSV import dry-run | P2-05 import | Not built | importRepo.dryRun / commit (mock parses locally) |
| Archive, template, transfer, delete | P2-02 / P2-03 lifecycle | Not built | projectRepo.archive / restore / saveTemplate / requestTransfer / delete |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Settings.title | Project settings | تنظیمات پروژه |
| Settings.tab.workflow | Workflow | گردش کار |
| Settings.publish | Publish v{n} | انتشار نسخه‌ی {n} |
| Settings.dryRun | Dry run | اجرای آزمایشی |
| Settings.archive | Archive project | بایگانی پروژه |
| Settings.transfer | Transfer ownership | انتقال مالکیت |
| Settings.delete | Delete project | حذف پروژه |



## PJ · Mobile (batch A)  
Batch A · `boards/PJM01ProjectMobile.dc.html` · `screenshots/PJM01ProjectMobile.jpg` · dark: `PJM01ProjectMobileDark`

#### Mobile rules · 5

- **Bottom nav** — Overview · Tasks · (+) · Calendar · More (Timeline, Gantt, Milestones, Risks, Workload, Members, Files, Analytics, Settings). See SH01.
- **Tasks** — List by default; Board = horizontal snap pages per status; Flow hidden on phones.
- **Detail** — Full-screen page; notch Mark done; assignment block above properties.
- **Sheets** — Create project, Invite, Decline, Reassign are bottom sheets with the same fields.
- **Signature budget** — One signature card per phone viewport (status card or task head).



## PJ · فارسی RTL (batch A)  
Batch A · `boards/PJM02ProjectFa.dc.html` · `screenshots/PJM02ProjectFa.jpg` · dark: `PJM02ProjectFaDark`

#### RTL rules · 5

- **Mirroring** — Rail right, notch top-left, progress fills from the right, back chevron points right, bottom nav order mirrored.
- **Mixed text** — Project and task names that are Latin stay LTR inside <bdi>; breadcrumbs keep order “Projects › project › module”.
- **Dates** — Jalali by default (23 Mehr = 15 Oct). Digits follow the setting (Persian shown).
- **Dependency types** — FS/SS/FF/SF stay Latin abbreviations (tooltip in Persian: «پایان به شروع»…).
- **Status names** — Workflow status labels are project data — shown as entered; default workflow ships with Persian translations.



## PJ · Mobile (batch B+C)  
Batch B+C · `boards/PJM03ProjectMobile2.dc.html` · `screenshots/PJM03ProjectMobile2.jpg` · dark: `PJM03ProjectMobile2Dark`

#### Mobile rules · 7

- **Entry** — Everything except Overview, Tasks and Calendar is reached from More (SH-01). Back chevron returns to the project.
- **Not on phones** — Gantt (Dependencies list read-only instead), Flow graph (table), workflow editing, CSV import (allowed but “desktop recommended”).
- **Board** — One status per page (snap), pager dots, long-press to move a card to another status via a sheet.
- **Timeline** — List grouped by phase with date ranges; today banner with the volt dot.
- **Risks** — Heat map becomes a 3-tile summary; detail is a full-screen page; notch = Close risk.
- **Workload** — Per member: this week + next week bars; over capacity in rose.
- **Calendar** — Agenda view (same as Personal P04 mobile) with the blue project layer.



## PJ · فارسی RTL (batch B+C)  
Batch B+C · `boards/PJM04ProjectFa2.dc.html` · `screenshots/PJM04ProjectFa2.jpg` · dark: `PJM04ProjectFa2Dark`

#### RTL rules · 5

- **Board** — Status pages are ordered right → left; swipe left = next status. Card content mirrored, Latin task names in <bdi>.
- **Timeline / Gantt** — Time flows right → left by coordinate mirroring (x = width − x), never CSS flip. Gantt is desktop-only.
- **Risks** — Severity/probability labels: کم · متوسط · بالا · بحرانی. Matrix: severity axis runs right → left.
- **Members** — Role names: مالک · ادمین · مدیر · عضو · بیننده · مهمان.
- **Dates** — Jalali by default; weeks start Saturday.


