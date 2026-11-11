# Teams (Phase 3) — design spec · COMPLETE (Batches A + B + C)

Status: **all Team screens designed, awaiting owner approval.** Read with `README.md`, `SCREENS.md`, `DECISIONS.md`, `../shared/SHARED.md` and the Projects package (`../project/`) — Team reuses Project components (assignment, task drawer, files, sheets).
Every section below is extracted from the board's folder tabs. Visuals: `screenshots/<Board>.jpg`, dark `<Board>Dark.jpg`, tab captures `<Board>__<Tab>.jpg`.

---

## TS-01 · Team shell & access  
Batch A · `boards/TS01TeamShell.dc.html` · `screenshots/TS01TeamShell.jpg` · dark: `TS01TeamShellDark`

Shell additions on top of `../shared` SH-01 / SH-02 (same components).

- **Context switcher** — Teams row enabled (Companies still disabled “Phase 4 · not available yet”). Team list sections: Your teams (recent first, role per team) · Invitations (public-safe preview) · Archived (read-only). Footer: All teams · New team. Selection → /teams/[id].
- **Collection rail** (/teams) — All teams, your teams (initials tiles), New team.
- **Team rail** (/teams/[id]/*) — G1 Overview · Work · Calendar · Planning | G2 Projects · Goals · People · Analytics | G3 Check-ins (badge = your reply missing) · Recognition · Files | Settings at bottom. Hidden (not disabled) when the role can’t open a screen. RTL: rail right.
- **Changed from code** — contexts.ts team nav [overview, work, people, calendar, checkins, activity, files] → routes /teams/[id]/…; activity becomes the Overview Activity tab; planning, projects, goals, analytics, recognition, settings added.
- **Mobile** — Overview · Work · (+) · Calendar · More (Planning, Projects, Goals, People, Analytics, Check-ins, Recognition, Files, Settings). Status sheet (?sheet=team-status) from the Overview “You” row.
- **Team access states (add to SH-02)** — Project not listed (forbidden = not found, no count) · Joined the team (no automatic project access) · Viewer banner · Removed / left (projections disappear) · Team archived (linked projects not archived) · Status expired (clears at “until”, nothing inferred).



## TM-00 · All teams  
Batch A · `boards/TM00AllTeams.dc.html` · `screenshots/TM00AllTeams.jpg` · dark: `TM00AllTeamsDark`

#### States · 3

- **Empty · first use** — No teams yet · Teams plan the week together. Create one or accept an invitation. · New team
- **Archived** — Launch Crew · Read-only · Restore · Restore: Owner/Admin only.
- **Loading** — Loading

#### Rules

- **Job** — Find your team and act on invitations. Directory, not a dashboard.
- **Card (product, no notch)** — Initials tile, name, my role, people count, description, open tasks, “n for you” (my open + pending assignments), linked projects I can open, member avatars, updated.
- **Project count** — Counts only projects the viewer can open (forbidden = not found).
- **Invitation** — Public-safe preview: team name, inviter, role, size. Copy says joining does not grant project access.
- **No quota** — No team limit or upsell.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| See team in list | ✓ | ✓ | ✓ | ✓ | ✓ |
| Archive / restore | ✓ | ✓ | — | — | — |
| Create team | assigned | — | ✓ |  | s |
| i | g | — | e | d | - |
| i | — |  | u | s | e |
| r |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Teams I belong to, role, counts | P3-01 teams/membership | Not built | teamRepo.list({filter}) |
| Invitations | P3-01 invitations | Not built | teamInvitationRepo.list / accept / decline |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Teams.title | All teams | همه‌ی تیم‌ها |
| Teams.new | New team | تیم جدید |
| Teams.forYou | {n} for you | {n} برای شما |
| Teams.invite.note | Joining does not give project access by itself | عضویت به‌تنهایی دسترسی پروژه نمی‌دهد |
| Teams.empty | No teams yet | هنوز تیمی ندارید |



## TM-01 · Team overview  
Batch A · `boards/TM01TeamOverview.dc.html` · `screenshots/TM01TeamOverview.jpg` · dark: `TM01TeamOverviewDark`

**Main screen:** PeopleWorkload card full width at the top (see `PEOPLE_FLOW.md` §1), then two columns: This week · Work tabs · Projects | Team calendar · Activity tabs.

#### S5 reconciliation

| S5 zone | Becomes | Why |
| --- | --- | --- |
| Header chips (members, active, blocked) | Two chips (people, lead); counts move into the This week card | avoid duplicate numbers |
| People & workload ring of avatars + “now working on” | PeopleWorkload card (full width, top): avatar picker in the top notch, selected-person strip, A–Z workload rows | restored (owner request); status is manual; “now working on” only when the person shares it |
| Members cards with notches (empty) | Removed (lives on People page) | notch never empty; no duplicate |
| In progress / Review / Blocked tabs | FolderTabs card (same) | locked tab family |
| Team calendar | Product card, week strip | reuse Personal calendar chips |
| Decisions & votes | Removed | polls are not a Team backend feature (Phase 6 social) |
| Monday check-in “mood steady” | Check-ins tab: replies count only | mood is private Personal data |
| Message button | In the selected-person strip → opens a DM in Messages | Messages context is designed (MS-xx) |
| Assistant FAB | Removed | AI deferred |


#### Rules

- **Job** — Where does our week stand, who is around, what needs attention. Not a ranking, not surveillance.
- **Signature card** — This week: done / planned from Planning, day progress bars (volt only on today), blocked / carried-over / unplanned chips, focus line set by Lead. Notch = Open week plan → /teams/[id]/planning.
- **People & workload** — Full-width notched card. Notch = avatar picker (radiogroup, A–Z, max 8 + “+N” opens People). Selecting a person fills the strip: name, team role · manual status + note, NOW WORKING ON (only if the person turned on “Share what I’m working on” in Set status; otherwise “Not shared”), this-week booked bar, action: Message (opens a DM in Messages) or Set status when you select yourself. Rows: avatar + presence dot, name, role, booked bar (over 100% = red overflow segment). Booked % = estimates of assigned team + project work this week ÷ capacity; never Personal focus/time blocks.
- **Work tabs** — In progress · Review · Blocked (FolderTabs). Cards show source: Team chip (indigo) or Project chip (blue, only if you can open the project).
- **Projects** — Projects linked to the team that the viewer can open. No hidden count.
- **Bottom tabs** — Activity (replaces the old activity route) · Check-ins · Recognition.
- **1024 / mobile** — Two columns → one below 1180px. Mobile: see TMM01.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View overview | ✓ | ✓ | ✓ | ✓ | ✓ |
| Set own status | ✓ | ✓ | ✓ | ✓ | — |
| Edit week focus | ✓ | ✓ | ✓ | — | — |
| Invite | ✓ | ✓ | ✓ | — | — |
| See booked % of others | ✓ | ✓ | ✓ | ✓ | ✓ |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team, my role, capabilities | P3-01 | Not built | teamRepo.get(id) |
| Week plan summary | P3-02 weekly planning | Not built | planRepo.week(teamId, week) |
| Manual status | P3-01 (member profile in team) — confirm | Not built | presenceRepo.list / set (manual only) |
| Booked vs capacity | P3-03 capacity | Not built | capacityRepo.week |
| Team calendar week | P3-02 calendar | Not built | teamCalendarRepo.range |
| Linked projects (authorized) | P3-01 project visibility | Not built | teamRepo.projects(id) |
| Activity, check-ins, recognition | P3-02 / P3-04 | Not built | activityRepo / checkinRepo / recognitionRepo |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Team.week | This week | این هفته |
| Team.week.done | planned tasks done | کار برنامه‌ریزی‌شده انجام شد |
| Team.openPlan | Open week plan | باز کردن برنامه‌ی هفته |
| Team.setStatus | Set status | تعیین وضعیت |
| Team.status.avail | Available | در دسترس |
| Team.status.busy | Busy | مشغول |
| Team.status.away | Away | دور |
| Team.status.off | Off today | مرخصی |



## TM-02 · Team work  
Batch A · `boards/TM02TeamWork.dc.html` · `screenshots/TM02TeamWork.jpg` · dark: `TM02TeamWorkDark`

**Main screen:** List view (List · Board · **Flow** segmented). Flow view = CaseFlow board (see `PEOPLE_FLOW.md` §2), shown under the list on the board.

#### Board view

To do

Design tokens audit

Critique notes W42

In progress

Onboarding flow variants

Usability round 2

Review

Icon set v2

Done

Moodboard (team)

Board columns = the team’s simple status set (To do · In progress · Review · Blocked · Done). Project tasks keep their project workflow and open in the project; on the team board they appear read-only in the matching column category.


#### Flow · phone & فارسی

9:41

To do

Design tokens audit

Component QA

→ Needed by Icon export pipeline, Checkout hand-off

In progress

Checkout flow hand-off

Blocked

Onboarding flow variants

Review

Icon set v2

Flow · phone

هفته‌ی ۴۲ · تحویل‌ها

بازبینی توکن‌های طراحی

بدون مسئول

یادداشت نقد هفته ۴۲

منتظر پذیرش شما

کنترل کیفیت کامپوننت‌ها

راهنمای سبک تصویرسازی

رد شد · نیاز به سپردن دوباره

نسخه‌های جریان آشنایی

آزمون کاربردپذیری ۲

تحویل جریان پرداخت

منتظر دسترسی API پرداخت

مسدود

خروجی گرفتن آیکون‌ها

مجموعه آیکون نسخه ۲

هری در حال بازبینی

بازبینی متن آشنایی

بازبینی متن آشنایی

املی · امروز

مودبورد تیم

سارا · یکشنبه

شیت افزودن سریع

مهران · شنبه

یادداشت نقد هفته ۴۱

هری · شنبه

برای انجام

در حال انجام

بازبینی

انجام‌شده این هفته

ستون‌ها = وضعیت تیم. خط‌ها = وابستگی بین کارها (پیوسته = تحویل شد، نقطه‌چین قرمز = هنوز منتظر). عدد روی آواتارها = کارهای باز هر نفر؛ قرمز = کار مسدود یا منتظر دارد؛ + = در این جریان کاری ندارد.


#### States · 3

- **Empty** — No team tasks yet · Team tasks belong to the team, not to a project. Add one or plan the week. · New task
- **Viewer** — View only · quick add hidden
- **Project task row** — Clicking a project task opens the project task drawer (PJ-15) in the project context; editing follows the project’s permissions, not the team’s.

#### Rules

- **Two sources** — Team-owned tasks (indigo “Team” chip, team workflow) + optionally project tasks assigned to team members in projects YOU can open (blue chip, read-through). Toggle “Include project tasks”, default on.
- **Grouping** — By week plan (default: In this week’s plan · Not planned) · status · person · source.
- **Assignment** — Same Pending / Accepted / Declined machinery as Projects; accepted team tasks project into Personal Tasks/Calendar with a “Design Team” source chip.
- **Statuses** — Team tasks use a fixed simple set in Phase 3 (proposal): To do · In progress · Review · Blocked · Done. No workflow editor for teams.
- **Views** — List / Board / Flow segmented (Board shown in the Board tab, Flow under the list). Calendar is its own screen.
- **Flow view** — CaseFlow board (shared component). Notch = people of this flow with open-step badges (red = blocked/waiting, + = none → click assigns a step). Columns = team statuses To do · In progress · Review, + Done this week tiles. Rows = this week’s plan tasks (same filter as the list). Lines = task “needs” links (dependencies): solid indigo = upstream done/handed over, dashed red = upstream not done. Click a row = task drawer; + avatar = assign. Phones: stacked stages (see tab). Max 5 rows per column, then “+N more” opens the List filtered.
- **Reuse** — Personal TaskRow, grouping, BulkBar, quick-add parser, Undo toast; PJ-02 status + assignee columns.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View team tasks | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create team task | ✓ | ✓ | ✓ | ✓ | — |
| Edit any team task | ✓ | ✓ | ✓ | — | — |
| Edit own / assigned | ✓ | ✓ | ✓ | ✓ | — |
| Assign others | ✓ | ✓ | ✓ | — | — |
| Delete | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team tasks | P3-02 team tasks (same task engine) | Not built | teamTaskRepo.list({teamId, filter}) |
| Project tasks of members (authorized) | P3-02 cross-project planning | Not built | teamTaskRepo.projectRefs({teamId}) — only projects viewer can open |
| Assignments | P2-04 machinery reused | Not built | assignmentRepo |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| TeamWork.title | Work | کارها |
| TeamWork.includeProject | Include project tasks | نمایش کارهای پروژه |
| TeamWork.inPlan | In this week’s plan | در برنامه‌ی این هفته |
| TeamWork.notPlanned | Not planned | برنامه‌ریزی‌نشده |
| TeamWork.source.team | Team | تیم |



## TM-15 · Team task detail  
Batch A · `boards/TM15TeamTaskDetail.dc.html` · `screenshots/TM15TeamTaskDetail.jpg` · dark: `TM15TeamTaskDetailDark`

#### Rules

- **Container** — Same drawer as PJ-15 / Personal P06: intercept on /teams/[id]/work/[taskId], full page on hard load, full screen on mobile. Own intercept, no catch-all.
- **Notch** — Mark done; Viewer: Copy link. Never empty.
- **Properties** — Status (team set), Assignee + contributors, Dates + week plan, Estimate, Goal / key result link, Related project task (link only, opens in project).
- **Assignment** — Pending block for the assignee (Accept / Decline with reason); Lead sees Remind / Reassign.
- **Project tasks** — Not edited here — rows that come from projects open PJ-15 in the project context.
- **Privacy** — Assignee’s personal notes, focus and time blocks are never shown.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit fields | ✓ | ✓ | ✓ | own | — |
| Mark done | ✓ | ✓ | ✓ | assigned | — |
| Reassign | ✓ | ✓ | ✓ | — | — |
| Delete | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team task detail | P3-02 | Not built | teamTaskRepo.get / update |
| Assignment | P2-04 machinery | Not built | assignmentRepo.accept / decline / reassign |
| Goal link | P3-02 team goals | Not built | teamGoalRepo.link |



## TM-90 · Team sheets  
Batch A · `boards/TM90TeamSheets.dc.html` · `screenshots/TM90TeamSheets.jpg` · dark: `TM90TeamSheetsDark`

#### Rules

- **Ids** — team-new · team-invite · team-status (+ reuses assignment-reassign / assignment-decline from Projects). No collision with Personal or Project sheet ids.
- **Create** — Creator becomes Owner. Planning mode Weekly (default) or Sprints + backlog. Company association disabled until Phase 4.
- **Invite** — Verified accounts only; roles Admin / Lead / Member / Viewer (Owner only by transfer). Explicit note that project access is separate.
- **Status** — Manual only (owner decision). Applies to this team unless “same status in all my teams” is on. Auto-clears; nothing inferred from calendars or activity.


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| TeamNew.title | New team | تیم جدید |
| TeamInvite.note | Joining the team does not give access to the team’s projects. | عضویت در تیم دسترسی به پروژه‌های تیم نمی‌دهد. |
| TeamStatus.title | Your status | وضعیت شما |
| TeamStatus.clearAfter | Clear after | پاک شدن بعد از |
| TeamStatus.allTeams | Same status in all my teams | همین وضعیت در همه‌ی تیم‌هایم |



## TM-03 · Team calendar  
Batch B · `boards/TM03TeamCalendar.dc.html` · `screenshots/TM03TeamCalendar.jpg` · dark: `TM03TeamCalendarDark`

#### Rules

- **Reuse** — Personal Calendar (P04) day/week/month/agenda + Shamsi/Gregorian with the team as one indigo layer.
- **Layers** — Team events · team task due dates · time off (entered by the person as a team event of kind “time off”) · project events of projects you can open (blue) · My personal busy (only you, untitled, off by default).
- **Team event (meeting basics)** — Title, time, invitees (team members), agenda items with owner and minutes, external meeting URL, RSVP Going / Maybe / Not going. Minutes, decisions and action-item workflow arrive in Phase 5.
- **Event detail** — Signature card; notch = Open meeting link (if the event has none: Edit event for organiser, Copy event link for others). Never empty.
- **Status ≠ calendar** — Manual status is not derived from this calendar and the calendar does not show live status.
- **Mobile** — Agenda view by default; event detail full screen.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View team calendar | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create team event | ✓ | ✓ | ✓ | ✓ | — |
| Edit any event | ✓ | ✓ | ✓ | — | — |
| Add own time off | ✓ | ✓ | ✓ | ✓ | — |
| RSVP | ✓ | ✓ | ✓ | ✓ | ✓ |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team events, invitees, agenda, RSVP | P3-04 light meetings / P3-02 calendar | Not built | teamEventRepo.range / create / rsvp |
| Task due dates, project events (authorized) | P3-02 + calendar overlays (V3 §calendar) | Not built | teamCalendarRepo.range |
| Own busy overlay | calendar overlays (current user only) | Not built | mock from Personal blocks, untitled |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| TeamCal.event | Team event | رویداد تیم |
| TeamCal.timeOff | Time off | مرخصی |
| TeamCal.rsvp.going | Going | می‌آیم |
| TeamCal.rsvp.maybe | Maybe | شاید |
| TeamCal.rsvp.no | Not going | نمی‌آیم |
| TeamCal.openLink | Open meeting link | باز کردن لینک جلسه |



## TM-04 · Weekly planning  
Batch B · `boards/TM04TeamPlanning.dc.html` · `screenshots/TM04TeamPlanning.jpg` · dark: `TM04TeamPlanningDark`

#### Review last week

14/17

W41 planned done

carried over

unplanned added

82%

estimate accuracy

Illustration style guide

→ W42

Empty states polish

→ backlog

Prototype tests

→ W42

Weekly review = read-only summary of last week; each unfinished task: move to this week, back to To plan, or close. Numbers are task counts, never per-person scores.


#### States · 3

- **Published** — W42 published Sat 09:12 by Harry B. · After publishing, Lead can still change the plan; changes show in Activity. Notch becomes “Open week work”.
- **Member view** — Members see the plan read-only except their own column: they can drag their own tasks in/out and set estimates. Notch for members = “Open my tasks”.
- **Empty week** — Nothing planned yet · Drag tasks from “To plan” onto a person, or start from last week’s carry-overs. · Start from W41

#### Rules

- **Default mode** — Weekly plan (owner decision: sprints optional). Week start follows the user setting (Saturday in fa).
- **Layout** — To plan (carried over + unplanned team tasks + member project tasks you can see) · one column per person with booked/capacity · plan summary signature card.
- **Drag** — Drag from To plan to a person = plan + assign (assignment Pending until accepted). Between people = reassign. Keyboard alternative: “Plan for…” menu on each card.
- **Capacity** — Capacity per person per week from People page; over capacity = rose outline + summary line. Warning only, never blocks.
- **Notch** — Lead / Admin: Publish plan (draft) → Open week work (published). Member: Open my tasks.
- **Review** — Review tab = last week summary and carry-over decisions (weekly review from backend P3-02).
- **Mobile** — List per person; drag replaced by “Plan for…” sheet.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View plan | ✓ | ✓ | ✓ | ✓ | ✓ |
| Plan any task / publish | ✓ | ✓ | ✓ | — | — |
| Plan own tasks | ✓ | ✓ | ✓ | ✓ | — |
| Edit week focus | ✓ | ✓ | ✓ | — | — |
| Close carry-overs | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Week plan (draft/published), focus | P3-02 weekly planning | Not built | planRepo.week / plan / publish |
| To plan list | P3-02 backlog | Not built | teamTaskRepo.unplanned |
| Capacity | P3-03 | Not built | capacityRepo.week |
| Weekly review | P3-02 review | Not built | planRepo.review(week) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Planning.title | Planning | برنامه‌ریزی |
| Planning.toPlan | To plan | برای برنامه‌ریزی |
| Planning.publish | Publish plan | انتشار برنامه |
| Planning.focus | Week focus | تمرکز هفته |
| Planning.carried | carried over | منتقل‌شده از هفته‌ی قبل |
| Planning.planFor | Plan for… | برنامه‌ریزی برای… |



## TM-05 · Sprint & backlog (optional)  
Batch B · `boards/TM05TeamSprint.dc.html` · `screenshots/TM05TeamSprint.jpg` · dark: `TM05TeamSprintDark`

#### States · 3

- **Complete** — Complete sprint 14 · 20/26 · points done · 3 unfinished items: · Calendar agenda view · Sprint 15 ▾ · RTL QA pass · Sprint 15 ▾ · Pull to refresh · Sprint 15 ▾ · Cancel · Complete & open review
- **Start** — Start sprint 15 · Goal · Widgets & deep links · Dates · 20 Oct – 2 Nov (2 weeks) · Committed 24 pt · capacity 30 pt (from People capacity × days). · Start sprint
- **Sprints off (default)** — This team plans weekly · Sprints and backlog are optional. A Lead or Admin can turn them on in Settings › Planning. · Open settings

#### Rules

- **Optional** — Only when Settings › Planning › Sprints is on (owner decision). Otherwise /planning shows the weekly plan (TM-04).
- **Backlog** — Ranked list of team tasks (+ project tasks you can see, read-through). Estimate in points or hours (team setting).
- **Sprint** — Goal, dates, committed vs capacity, burndown (remaining vs ideal), status list. Notch = Complete sprint (Lead/Admin); members: Open my sprint tasks.
- **Complete** — Each unfinished item → next sprint or backlog; then the sprint review (summary, read-only) opens under Reviews.
- **No scoring** — Velocity shown for the team only; never per person.
- **Mobile** — Sprint list + backlog list; ranking by “Move up/down” menu.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rank backlog | ✓ | ✓ | ✓ | — | — |
| Start / complete sprint | ✓ | ✓ | ✓ | — | — |
| Edit own sprint tasks | ✓ | ✓ | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Backlog rank, sprints, commitment | P3-02 sprint optional | Not built | sprintRepo.current / start / complete; backlogRepo.rank |
| Burndown | P3-03 analytics | Not built | computed in mock |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Sprint.complete | Complete sprint | پایان اسپرینت |
| Sprint.start | Start sprint | شروع اسپرینت |
| Sprint.goal | Goal | هدف |
| Backlog.title | Backlog | بک‌لاگ |
| Sprint.off | This team plans weekly | این تیم هفتگی برنامه‌ریزی می‌کند |



## TM-06 · Team projects  
Batch B · `boards/TM06TeamProjects.dc.html` · `screenshots/TM06TeamProjects.jpg` · dark: `TM06TeamProjectsDark`

#### States · 3

- **Link request** — Link a project · Choose a project where you are Owner or Admin. The project owner sees a request; after approval the project appears here for team members · who already have access to it · . Linking never grants project access. · Search your projects… · Cancel · Send link request
- **New team project** — New team project · Opens ?sheet=project-new with “Owned by Design Team” selected. The creator becomes project Owner; the team is the owning workspace. Team members still need a project role (invite step offered after create).
- **Empty** — No projects you can open · Projects linked to this team appear here when you have access to them.

#### Rules

- **Visibility** — Only projects the viewer can open (forbidden = not found). No “+2 hidden” count, ever.
- **Relations** — Team-owned (created under the team, P3 topology) or Linked (association approved by the project owner). Both are Phase 3; attachment to Company is Phase 4.
- **Row** — Product row: status (set in project), progress, next milestone, team people involved, open high risks, your role. Click → /projects/[id].
- **Timeline** — Read-only portfolio bars with now line; no editing here.
- **Unlink** — Owner/Admin of team or project; never deletes the project or changes its members.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View portfolio (own access only) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Link / unlink | ✓ | ✓ | — | — | — |
| New team project | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Projects linked/owned by team, filtered by viewer access | P3-01 authorized project visibility | Not built | teamRepo.projects(teamId) |
| Link request / approve | P2-03 association interface → P3 | Not built | projectAssociationRepo.request / approve / unlink |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| TeamProjects.link | Link a project | پیوند دادن پروژه |
| TeamProjects.new | New team project | پروژه‌ی جدید تیم |
| TeamProjects.owned | Team-owned | متعلق به تیم |
| TeamProjects.linked | Linked | پیوندشده |
| TeamProjects.linkNote | Linking never grants project access. | پیوند دادن دسترسی پروژه نمی‌دهد. |



## TM-07 · Team goals  
Batch B · `boards/TM07TeamGoals.dc.html` · `screenshots/TM07TeamGoals.jpg` · dark: `TM07TeamGoalsDark`

#### Rules

- **Reuse** — Personal Goals (P11) components and key-result model, with team scope (indigo). Goal Milestone Path may be offered as optional view (same proposal as PJ-08).
- **Key results** — Auto (count of linked tasks done / tagged) · linked task · manual number with who/when. Each shows its source line.
- **Notch** — Update progress (manual KRs) — Lead/owner; others: Open linked work.
- **Pace** — Expected-pace marker by date; chip text “on pace / slightly behind / behind”. No colours beyond amber/rose for behind.
- **Linked work** — Team tasks and project tasks you can see; counts only of what you can see.
- **No personal goals** — Personal goals never appear here; a person may link a personal goal to a team goal only on their side (not visible to the team).


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create / edit goal | ✓ | ✓ | ✓ | — | — |
| Update manual KR | ✓ | ✓ | ✓ | own | — |
| Archive | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team goals, KRs, links | P3-02 team goals | Not built | teamGoalRepo.list / get / update |
| Auto KR values | P3-03 analytics | Not built | computed in mock |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| TeamGoals.title | Goals | اهداف |
| TeamGoals.update | Update progress | به‌روزرسانی پیشرفت |
| TeamGoals.pace.behind | slightly behind pace | کمی عقب‌تر از برنامه |
| TeamGoals.linked | Linked work | کارهای مرتبط |



## TM-08 · People & capacity  
Batch C · `boards/TM08TeamPeople.dc.html` · `screenshots/TM08TeamPeople.jpg` · dark: `TM08TeamPeopleDark`

**Main screen:** PeopleWorkload strip (rows hidden) at the top drives the selection; member table + Person signature card below.

#### States · 3

- **Capacity editor** — Capacity · Sat · Sun · Mon · Tue · Wed · Thu · Fri · Hours for this team per week · 32h · Set by Lead/Admin with the person; used by Planning, Workload and Sprints. Not linked to Personal settings.
- **Move to another team** — Move Katy to another team · Katy’s 3 open team tasks stay in Design Team and become · Unassigned · (or pick a new assignee below). Project roles are unchanged — projects belong to their owners. · Move to · Mobile Squad ▾ · Cancel · Move
- **Remove** — Remove from team · Open team tasks become Unassigned; accepted team tasks disappear from the person’s Personal projections; their check-ins and thanks stay as history. Last Owner can’t be removed.

#### Rules

- **Roles** — Owner · Admin · Lead · Member · Viewer (Phase 3). Same person can hold different roles in different teams. Owner changes only by transfer.
- **Status** — Manual (owner decision): Available · Busy · Away · Off today + note + clear after. Set by the person only; Lead cannot set others’ status.
- **This week** — Booked estimates of team + project tasks planned this week ÷ capacity. Project task estimates count only as hours; titles of projects the viewer cannot open are hidden (“1 other project task · 6h”).
- **People & workload strip** — Top notched card (same PeopleWorkload component as TM-01, rows hidden): avatar picker in the notch = selection for the whole page; strip shows status, Now working on (only if shared, else “Not shared”), this-week booked, Message → DM in Messages.
- **Person card** — Signature card; notch = Assign a task (Lead+) → task create with assignee; Member: Copy profile link.
- **Never** — No ranking, no “most productive”, no activity time, no personal Focus/Journal/Mood data.
- **Invitations** — Segmented tab: pending with expiry, Resend / Cancel.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| See members & status | ✓ | ✓ | ✓ | ✓ | ✓ |
| See this-week booking | ✓ | ✓ | ✓ | ✓ | — |
| Change roles | ✓ | ✓ | — | — | — |
| Edit capacity | ✓ | ✓ | ✓ | — | — |
| Move / remove member | ✓ | ✓ | — | — | — |
| Invite | ✓ | ✓ | ✓ | — | — |
| Leave team (self) | — | ✓ | ✓ | ✓ | ✓ |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Members, roles, invitations | P3-01 | Not built | teamMemberRepo.list / setRole / remove / move |
| Manual status | P3-01 (to confirm in ADR) | Not built | presenceRepo.set / list |
| Capacity & booking | P3-03 | Not built | capacityRepo.get / set / week |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| People.title | People | افراد |
| People.capacity | Capacity | ظرفیت |
| People.thisWeek | This week | این هفته |
| People.assign | Assign a task | سپردن کار |
| People.move | Move to another team | انتقال به تیم دیگر |
| People.otherProject | 1 other project task · {h}h | ۱ کار پروژه‌ی دیگر · {h} ساعت |



## TM-09 · Check-ins  
Batch C · `boards/TM09TeamCheckins.dc.html` · `screenshots/TM09TeamCheckins.jpg` · dark: `TM09TeamCheckinsDark`

#### States · 3

- **Sent** — Check-in sent · editable until Wed 18:00 · Edit · After sending, the form collapses into your reply card at the top of the list; notch becomes “Edit check-in” until closing.
- **Closed** — After the deadline the week is read-only. Late replies allowed for 24h, marked “late” only to the author (proposal).
- **Viewer** — Viewers read replies; no form.

#### Rules

- **Format (owner decision)** — Three work questions — Did · Next · Blocked by. Weekly; day and time set in Settings › Planning. No mood, no energy, no scores, no ratings.
- **Suggestions** — Chips suggest tasks you completed this week in this team (team + visible project tasks). Nothing from Personal.
- **Your check-in** — Signature card; notch = Send check-in (then Edit check-in until close). Optional: skip this week.
- **Replies** — Product cards per person, newest first. Comments in thread. A blocker can become a team task (“Make task from blocker”).
- **Who replied** — Count + avatars. Lead can remind non-responders once per week. No streaks, no leaderboards.
- **Overview** — Overview Check-ins tab shows the count and “Reply”; rail badge = your reply missing.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| Read replies | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send own check-in | ✓ | ✓ | ✓ | ✓ | — |
| Remind | ✓ | ✓ | ✓ | — | — |
| Comment | ✓ | ✓ | ✓ | ✓ | — |
| Change schedule | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Check-in cycle, replies, comments | P3-02 weekly review / P3-04 feedback | Not built | checkinRepo.week / reply / comment / remind |
| Suggested done tasks | P3-02 | Not built | teamTaskRepo.doneByMe(week) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Checkins.title | Check-ins | چک‌این |
| Checkins.did | What did you do? | چه کارهایی انجام دادید؟ |
| Checkins.next | What will you do next? | قدم بعدی چیست؟ |
| Checkins.blocked | Anything blocking you? | چیزی مانع کارتان هست؟ |
| Checkins.send | Send check-in | ارسال چک‌این |
| Checkins.remind | Remind {n} people | یادآوری به {n} نفر |



## TM-10 · Recognition & feedback  
Batch C · `boards/TM10TeamRecognition.dc.html` · `screenshots/TM10TeamRecognition.jpg` · dark: `TM10TeamRecognitionDark`

#### States · 3

- **Request** — Request feedback · From · Harry B. · About · Onboarding flow variants (optional link) · Question · What would you cut to ship by Thursday? · Feedback is visible only to the requester and the writer. Never shown to Leads by default. · Send request
- **Empty** — No thanks yet · Thank someone for something specific. Public to the team or private to them. · Say thanks
- **Removed thanks** — Author can delete own thanks; recipient can hide it from the team feed. Admin can remove for policy reasons (audited).

#### Rules

- **Thanks** — From one person to one or more teammates, with optional link to a task/goal/project you can see. Visibility: Design Team (default) or only the recipient.
- **Feedback** — Private 1:1: request feedback from someone or write unrequested feedback; only writer and recipient can read.
- **No metrics** — No counts per person, no leaderboard, no “top contributor”, nothing in Analytics. Recognition never affects capacity or planning.
- **Corrective actions** — Not in Team (owner decision). Moves to Company (Phase 4) with the employee file.
- **Composer** — Signature card; notch = Send thanks. Feedback tab replaces the feed with requests and received feedback.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| Read team thanks | ✓ | ✓ | ✓ | ✓ | ✓ |
| Give thanks | ✓ | ✓ | ✓ | ✓ | — |
| Request / write feedback | ✓ | ✓ | ✓ | ✓ | — |
| Remove any thanks (audited) | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Thanks feed | P3-04 recognition | Not built | recognitionRepo.list / give / hide |
| Feedback requests, notes | P3-04 feedback | Not built | feedbackRepo.request / write / inbox |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Recognition.thanks | Say thanks | تشکر کنید |
| Recognition.visibility.team | Design Team | تیم طراحی |
| Recognition.visibility.private | Only {name} | فقط {name} |
| Feedback.request | Request feedback | درخواست بازخورد |
| Feedback.private | only you can see it | فقط شما می‌بینید |



## TM-11 · Team files  
Batch C · `boards/TM11TeamFiles.dc.html` · `screenshots/TM11TeamFiles.jpg` · dark: `TM11TeamFilesDark`

#### Rules

- **Same component** — Exactly PJ-10 Files (rows, upload/scan states, versions, preview signature card with notch Download), with team folders and indigo scope.
- **Scope** — Team files only. Project files are not mirrored; linking a team file to a project task is allowed only if you can open that project.
- **Guests** — Teams have no guests in Phase 3; verified non-team collaborators get access only through projects.
- **No quota** — No storage meter; limits from server.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View / download | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upload | ✓ | ✓ | ✓ | ✓ | — |
| Delete own | ✓ | ✓ | ✓ | ✓ | — |
| Delete any / restore | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team folders, files, versions | P3 files (same file service as P2-07) | Not built | fileRepo.list({scope: team}) |



## TM-12 · Team analytics  
Batch C · `boards/TM12TeamAnalytics.dc.html` · `screenshots/TM12TeamAnalytics.jpg` · dark: `TM12TeamAnalyticsDark`

#### Rules

- **Transparent** — Every KPI states numerator, denominator and source (task counts / estimates). No health score, no AI, no hidden weighting.
- **Team, not people** — No per-person charts or rankings (owner rules: no covert scoring). Per-person capacity lives on People and is booking, not performance.
- **Definitions** — Plan completion = planned done / planned. Carried over = planned moved to next week / planned. Cycle time = first In progress → Done (median). Capacity booked = avg(booked ÷ capacity).
- **Project data** — Only projects the viewer can open are named; the rest are aggregated as “Other projects” and only for Lead/Admin.
- **Charts** — Plain SVG with “View as table”; current week lighter indigo; no volt.
- **Export** — Snapshot CSV/PDF of what is shown (Lead/Admin).


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export | ✓ | ✓ | ✓ | — | — |
| See “Other projects” aggregate | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team KPIs, plan history, mix | P3-03 team dashboards | Not built | teamReportRepo.summary(range) |
| Portfolio progress | P3-03 portfolio | Not built | teamRepo.projects + project summaries |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| TeamAnalytics.planCompletion | Plan completion | تحقق برنامه |
| TeamAnalytics.carried | Carried over | منتقل‌شده |
| TeamAnalytics.cycle | Median cycle time | میانه‌ی زمان چرخه |
| TeamAnalytics.capacity | Capacity booked | ظرفیت رزروشده |



## TM-14 · Team settings  
Batch C · `boards/TM14TeamSettings.dc.html` · `screenshots/TM14TeamSettings.jpg` · dark: `TM14TeamSettingsDark`

#### Page tabs (in the board)

- **General** — name, short name, description, colour; Save / Discard.
- **Planning** — mode Weekly / Sprints + backlog; week start; estimate unit Hours / Points; weekly check-in schedule (opens Sat 09:00, closes Wed 18:00); check-ins on/off; manual status on/off.
- **Access** — default invite role, Members may invite (off), Viewers see this-week booking (off).
- **Lifecycle** — transfer ownership (successor accepts + reauth), archive, Join a company (disabled, Phase 4), delete (owner, reauth; projects stay with their owners).

#### Rules

- **Layout** — Folder tabs General · Planning · Access · Lifecycle (?tab=…). Members on People.
- **Planning** — Mode Weekly / Sprints (owner decision: optional), week start, estimate unit, check-in schedule (3 fixed questions), check-ins on/off, manual status on/off.
- **Switching mode** — Weekly → Sprints: current week plan becomes Sprint 1 draft. Sprints → Weekly: active sprint must be completed first.
- **Lifecycle** — Transfer ownership (successor accepts + reauth), archive/restore, delete (owner, reauth; projects untouched). Join a company disabled until Phase 4.
- **Dirty state** — Sticky “Unsaved changes · Discard · Save” bar in General.
- **Mobile** — Settings root list → each tab as a page.


#### Permissions

| Action | Owner | Admin | Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- |
| Open settings | ✓ | ✓ | ✓ | — | — |
| General | ✓ | ✓ | — | — | — |
| Planning | ✓ | ✓ | ✓ | — | — |
| Access | ✓ | ✓ | — | — | — |
| Archive | ✓ | ✓ | — | — | — |
| Transfer / delete | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Team metadata & settings | P3-01 / P3-02 | Not built | teamRepo.update / settings |
| Lifecycle | P3-05 handover, archive/restore | Not built | teamRepo.archive / restore / requestTransfer / delete |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| TeamSettings.title | Team settings | تنظیمات تیم |
| TeamSettings.mode | Planning mode | روش برنامه‌ریزی |
| TeamSettings.checkin | Weekly check-in | چک‌این هفتگی |
| TeamSettings.joinCompany | Join a company | پیوستن به شرکت |
| TeamSettings.delete | Delete team | حذف تیم |



## TM · Mobile 390  
Batch all · `boards/TMM01TeamMobile.dc.html` · `screenshots/TMM01TeamMobile.jpg` · dark: `TMM01TeamMobileDark`

#### Mobile rules · 5

- **Bottom nav** — Overview · Work · (+) · Calendar · More (Planning, Projects, Goals, People, Analytics, Check-ins, Recognition, Files, Settings).
- **Work** — List default; Board = snap pages; colour dot = source (indigo team, blue project).
- **Planning** — List per person; “Plan a task for…” sheet instead of drag; sprints: backlog list + sprint list.
- **Check-in** — Full-screen form; notch = Send.
- **Not on phones** — Settings › Planning schedule editing and portfolio timeline (read-only list instead).



## TM · فارسی RTL  
Batch all · `boards/TMM02TeamFa.dc.html` · `screenshots/TMM02TeamFa.jpg` · dark: `TMM02TeamFaDark`

#### RTL rules · 5

- **Mirroring** — Rail right, notch top-left, back chevron points right, day bars fill right → left.
- **Roles** — مالک · ادمین · سرپرست · عضو · بیننده.
- **Status** — در دسترس · مشغول · دور · مرخصی (+ یادداشت و زمان پاک‌شدن).
- **Check-in** — Three questions in Persian; Latin task names inside <bdi>.
- **Dates** — Jalali by default; week starts Saturday; W numbers follow ISO only in en.


