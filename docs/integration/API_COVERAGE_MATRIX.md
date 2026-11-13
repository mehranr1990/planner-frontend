# API coverage matrix

Contract: P6-01 `api/openapi.json` (841 ops). "Ops" = operations under that path prefix. Paths are under `/api/v1`.
Status legend: LIVE = complete + live verified (2026-11-03, pre-P6-01 build) · IMPL = implemented, not live verified · PART = partial · MOCK = mock only · BLOCKED · NONE = no frontend screen.
Unit = contract-fake tests (not live evidence). Live tests are env-gated `*.live.test.ts` (skip without `API_LIVE_*`).

## Integrated (Personal, Phase 0/1)

| Feature | Operations actually called | Adapter / method | Status | Evidence |
|---|---|---|---|---|
| Session probe, health | GET `/auth/get-session` | `src/api/session.ts` `probeSession` | LIVE | `src/api/session.test.ts`; `session.live.test.ts` |
| Auth | POST `/auth/sign-up/email`, `/sign-in/email`, `/sign-out`, `/send-verification-email`, `/request-password-reset`, `/reset-password`, `/change-password`, `/change-email`, `/revoke-session`, `/revoke-other-sessions`; GET `/auth/list-sessions` | `src/features/auth/auth-api.ts`, `session.tsx`, `auth-gate.tsx` | LIVE | `auth.live.test.ts` PASS + browser 19/19 (2026-11-03) |
| Account | GET/PATCH `/me`; GET/PATCH `/me/settings` (ETag/If-Match, 409 retry); GET `/me/spaces` | `account-provider.tsx`, `account-settings-map.ts` | LIVE | same |
| Tasks | GET/POST `/tasks`; GET/PATCH/DELETE `/tasks/{id}`; POST `/tasks/{id}/complete`, `/reopen`, `/restore`; checklist-items (POST, PATCH/DELETE `{itemId}`); `/tasks/{id}/labels` (+`{labelId}`); GET `/tasks/{id}/attachments`; GET/PATCH `/tasks/{id}/productivity`; GET/POST `/labels`; GET/POST `/notes` (taskId) | `src/data/api/api-tasks-repository.ts` (`TasksRepository`) | LIVE (gaps) | unit `api-tasks-repository.test.ts`; live `api-tasks-repository.live.test.ts`; browser 7/7 |
| Recurrence + bulk | GET/POST `/task-recurrences`; PATCH `/task-recurrences/{id}`; POST `/{id}/catch-up`; GET `/{id}/occurrences`; POST `/tasks/bulk` (PATCH items) | same file | LIVE (weekly only) | unit `api-tasks-recurrence.test.ts`; live `…recurrence.live.test.ts`; browser 6/6 |
| Day plans | GET/POST/PATCH `/planning/days/{date}`; PUT/DELETE `/planning/days/{date}/items/{taskId}`; POST `…/move` | `api-day-plans.ts`, `api-plan-repository.ts` (`PlanRepository.priorities/setPriorities`), tasks `reorder` | LIVE | unit `api-day-plans.test.ts`; live `api-planning.live.test.ts`; browser 5/5 |
| Calendar blocks (Phase 04) | GET `/calendar/views` (from/to exclusive, timezone, cursor); GET/POST `/calendar/time-blocks` (Idempotency-Key, taskId+taskRevision); GET/PATCH/DELETE `/calendar/time-blocks/{id}` (If-Match); GET/PATCH `/calendar/events/{id}` (If-Match, schedule only) | `api-blocks-repository.ts` (`BlocksRepository`: listForDay, schedule, move, unschedule, snapshot, restore, setDone) — wired in `provider.tsx` 2026-11-11 | **IMPL** | unit `api-blocks-repository.test.ts`; **no live run** (B1) |
| Task ⇄ block follow (D5) | PATCH/DELETE `/calendar/time-blocks/{id}` after a Task day/time/length write outside the timeline (update, bulkUpdate) | `api-task-block-follow.ts` `withBlockFollow` + blocks `followTask` | **IMPL** | unit (same file); **no live run** (B1) |
| Habits (Phase 05) | GET/POST `/habits` (cursor, Idempotency-Key); GET/PATCH/DELETE `/habits/{id}` (If-Match = quoted revision; DELETE archives, PATCH status ACTIVE restores); GET/POST `/habits/{id}/entries` (half-open 366-date range, habitRevision, LOG/SKIP); PATCH `/habits/{id}/entries/{entryId}` (value / void) | `api-habits-repository.ts` (`HabitsRepository`: all 7 methods). Unsupported (no API field): icon, area, time of day, preferred time, reminder, one-off rest day, non-Latin unit, changing type/unit | **IMPL** | unit `api-habits-repository.test.ts` (11); **no live run** (no credentials) |

## Phase 0/1 operations not integrated

| Prefix (ops) | Frontend feature | Status | Why |
|---|---|---|---|
| `/calendar` remaining: POST `/events`, DELETE `/events/{id}`, POST `/events/{id}/series`, GET `/events`, GET `/conflicts` | — | NONE | checked 2026-11-12: the Calendar screen only schedules/moves/unschedules task blocks and moves events; no event create/edit/delete, series or conflicts UI. Moving a recurring occurrence stays refused |
| _Status 2026-11-12 (session 5)_ | — | — | **LIVE VERIFIED on the P6-01 build:** Tasks, Day plans, Calendar blocks (04), Task ⇄ block follow (04b), Habits (05), Goals (06), Focus stats (07), Journal (08), Inbox (09) — evidence in `SESSION_HANDOFF.md` → Live verification. Finance: live run failing (HTTP 400, open). Insights, Weekly review: no live run yet. Rows still worded "IMPL" for those nine are superseded by this line |
| `/planning/reviews` list, create, patch (kind WEEKLY) | Weekly review (P16) | IMPL, NOT LIVE VERIFIED | draft stored in the one `reflection` text (sections + one JSON line); week must equal the account week start |
| `/planning` rollover, capacity, weeks, MORNING/EVENING reviews, review get/delete | — | NONE | Shutdown persists through Tasks + Journal; weekly carry-over is written to Tasks by the UI; no capacity surface |
| `/task-occurrences` (4), `/task-templates` (6), `/saved-task-filters` (6), task subtasks/history/attachment bind | — | NONE / no UI | see progress file 01/02 gaps |
| `/habits` schedules, entry GET/history, stats, water-summary; `/routines` (5) | — | NONE | no routines / water / server-stats UI (streaks are computed by the screen from entries) |
| Goals (Phase 06) | GET/POST `/goals`, GET/PATCH `/goals/{id}` (If-Match), GET/POST/PATCH milestones, POST/PATCH/DELETE metrics, GET/POST/DELETE `links/tasks`, GET `progress`, GET/POST `/life-areas` | Goals (P11), task goal link (Tasks, Task detail) | IMPL, NOT LIVE VERIFIED | free-text target, key results, money, milestone next action: no API field (write refused / read absent) |
| `/goals` rest (DELETE goal, links habits/projects, milestone/metric reorder-delete), `/life-areas` PATCH/DELETE/reorder | none | NONE | no UI surface |
| Focus stats (Phase 07) | POST `/time-entries` (Idempotency-Key; one manual entry per finished cycle, actual end + focused length), GET `/productivity/summary` (one day) | Focus (P09) cycle recording; Focus card (My Day, Overview) | IMPL, NOT LIVE VERIFIED | cycle position is browser-timer state, not server data |
| `/focus/sessions*` (10), `/time-entries` list/detail/patch/delete/history | none | NONE | server-clocked sessions: the P09 timer runs in the browser, no UI drives server transitions; no time-entry list UI |
| Journal (Phase 08) | GET/POST `/journal/daily-checkins`, GET `/journal/daily-checkins/{date}`, PATCH/DELETE `/journal/entries/{id}` (If-Match), GET/POST `/moods`, PATCH `/moods/{id}` (edit, void) | Journal (P14), mood check-in (P18 D), Shutdown reflection, Inbox → Journal | IMPL, NOT LIVE VERIFIED | went-well / prompts / tags as Markdown sections of the entry text |
| `/journal/entries` list/POST (FREEFORM), `*/history`, `/moods/{id}` GET/DELETE | none | NONE | no UI surface |
| Inbox (Phase 09) | GET/POST `/capture`, GET/PATCH `/capture/{id}` (If-Match; archive true/false) | Inbox (P07), Quick add / quick note / voice text capture | IMPL, NOT LIVE VERIFIED | snooze: no API state (unsupported); processed/dropped stored as ARCHIVED |
| `/capture/{id}/triage`, `/capture/parse`, `/search/personal` | none | NONE | UI creates destinations itself; search reads the seam, no search repository |
| (no endpoint) | Brain Dump (P08) | MOCK (blocker B3) | no page/line model in the contract |
| Finance (Phase 10–11) | GET/POST `/finance/accounts`, GET/POST `/finance/categories`, GET/POST `/finance/transactions`, GET `/finance/transactions/{id}`, POST `…/correct`, POST `…/reverse` (If-Match + Idempotency-Key), GET/POST `/finance/budgets`, GET/POST `/finance/budgets/{id}/periods`, PATCH `…/periods/{periodId}`, GET `/finance/bills`, GET `/finance/bills/{id}/preview`, GET `/finance/savings-goals` | Finance (P13), Add expense sheet, Overview finance card | IMPL, NOT LIVE VERIFIED | IRR only; edit = correct (new id), delete = reverse, undo = new posting; category budgets read-only |
| `/finance/transfers`, `/finance/transactions/from-capture`, `…/history`, `/finance/bills` writes + pay, `/finance/savings-goals` writes, account/category/budget PATCH/DELETE, `/finance/reports`, `/finance/export` | none | NONE | no UI surface (single wallet, no bill/savings/account management screens) |
| `/reminders` (8), `/notifications` (8), `/push` (4) | bell (empty state only), Settings placeholders | NONE | audited 2026-11-12: no list/read/dismiss, reminder or push surface (D6) |
| Insights (Phase 13) | GET `/insights/time` (DAY buckets → active days) | Insights (P15) header | IMPL, NOT LIVE VERIFIED | pattern tabs + highlight: no contract source (blocker B4) → per-tab "cannot be calculated" |
| `/insights/{overview,tasks,habits,goals,finance}`, `/rewards` (5) | none | NONE | generic metric cells / gamification have no approved UI surface |
| `/files` (8) | — | NONE | audited 2026-11-12: Personal has no upload or voice-recording surface |
| `/sync` (3) | — | NONE | audited 2026-11-12: no offline-sync surface (by design, not in this phase) |
| `/me` export/deletion (rest of 13) | Settings → Export row, Delete account dialog | UI ONLY | audited 2026-11-12: the contract needs password, retention acknowledgement, policy version and proof headers the approved UI does not collect (D6) |

## Phase 2–6 (new in P6-01 contract)

| Prefix (ops) | Frontend | Status | Why |
|---|---|---|---|
| `/projects`, `/spaces`, `/invitations`, `/resource-invitations` (150 ops in the generated subset `openapi-p6-projects.d.ts`) | Projects screens (`src/features/projects`, `project-repositories.ts`) | **PART — IMPL (see table), rest BLOCKED**; nothing live verified (B2). Contract: `planner-backend/docs/api/openapi.json`, 849 ops | see the two Projects tables below |
| `/teams`, `/team-invitations` (86 in 860-op contract) | Teams screens | **PART — see "Teams" (2026-11-13)** | see "Teams" below |
| `/companies`, `/company-invitations` (157 in 860-op contract) | Companies screens | **PART — see "Companies" (2026-11-13)** | live mode no longer serves mock Companies |
| `/conversations`, `/conversation-invitations`, `/messaging*`, `/social/discovery` | Messages screens | **PART — see "Messages & Meetings" (2026-11-13)** | |
| `/meetings` (39), `/announcements` (17) | Meetings / announcements screens | Meetings + minutes IMPL (2026-11-13: X1-M, M-X4/M-X5 work-meeting create, OD-15…OD-18); announcements read + acknowledge IMPL (M-A1), composer REFUSED (see "Messages & Meetings") | |
| `/social` (18), `/social-groups` (19), `/social-group-invitations` (3) | Social screens (`src/features/social`) | **PART — see "Social" (2026-11-13)** | |
| `/me` additions (9) | — | NONE | not inspected per operation yet |

## Projects — connected in live mode (IMPLEMENTED, NOT LIVE VERIFIED)

| Seam method | Operations | Notes |
|---|---|---|
| `members.list` | GET `/projects/{id}/members` (cursor), GET `…/tasks/{taskId}/assignments` (open tasks, 8 at a time) | person id = membership id; no email (""), capacity null; openTasks = open, not-declined, not-ended assignments |
| `members.setRole` / `removalPreview` / `remove` | PATCH `/spaces/{spaceId}/memberships/{id}` (If-Match revision; remove = `state: REVOKED`) | last owner → "last-owner"; `leave` / `setCapacity` refused |
| `projectTasks.members` | GET `/projects/{id}/members` | active members only |
| `projects.summary` | GET `…/dashboard` (Iran week range), GET `…/components/milestones`, GET `…/register-items?kind=RISK`, GET `…/views?kind=LIST` | KPI cards only; health / dates are not part of it |
| `schedule.graph` | GET `/projects/{id}/tasks`, GET `…/tasks/{taskId}/schedule` (8 at a time), GET `…/components/milestones`, GET `…/dependencies` | item only with both `plannedStartAt` and `dueAt`; retired edges dropped; lag minutes → days |
| `schedule.addLink` / `updateLink` / `removeLink` | POST `…/dependencies`, PATCH / DELETE `…/dependencies/{dependencyId}` (If-Match, 409 → refetch + once more) | type change refused (PATCH carries lag only) |
| `schedule.preview` / `apply` | POST `…/reschedule-previews` (Idempotency-Key), POST `…/reschedule-previews/{previewId}/apply` (If-Match + `manifestHash`) | cascade mode, timed tasks only; apply must carry exactly the last preview's moves; 409 → "conflict" |
| `comments.add` | POST `/projects/{projectId}/comments` (Idempotency-Key, target TASK) | author resolved from `createdByActorId` via the member roster |
| `dependencies.add` / `remove` | GET `…/views?kind=LIST&taskId` (predecessor title) + the schedule link operations | edge into the open task |
| `fields.list` / `save` / `remove` | GET `…/custom-fields`, GET / POST `…/custom-fields/{fieldId}/versions` (If-Match + Idempotency-Key), POST `…/custom-fields` (Idempotency-Key), POST `…/{fieldId}/deprecate` (If-Match), LIST view `fields.items` | tasks only, `required` false; valueCount = non-null values on all LIST pages; BOOLEAN = checkbox; CURRENCY not listed; `url` / required / risk targets refused on save; unchanged fields not re-versioned |
| `projects.listAccessible` / `access` | GET `/projects`, GET `/projects/{id}` + `…/access/me` + `…/metadata` + `…/dashboard` + `…/members` + `…/components/milestones` + `…/register-items?kind=RISK`, GET `/me/work/assignments` | health / expectedPercent null ("Unknown"); capabilities = access/me hint ∧ live support; 403 / 404 = not available |
| `projects.restore`, `settings.update` / `archive` | POST `/projects/{id}/restore` / `archive` (If-Match), PATCH `/projects/{id}` (title, description) + PATCH `…/metadata` (key, color, dates) | then re-read the summary |
| `workflows.published` | LIST view bindings, GET `…/workflows/{workflowId}/versions?version=` | base statuses + each bound version's states (never merged / migrated) |
| `projectTasks.list / get / create / update / bulkUpdate / transition / countByStatus / members` | LIST view, `…/tasks/{taskId}/association`, `…/assignments`, roster, `access/me`; POST `…/tasks`; PATCH `…/tasks/{taskId}`; PUT `…/schedule`, `…/estimate`, `…/association`; POST `…/assignments`, `…/{assignmentId}/revoke`; POST `…/workflow/transitions` | create / move into a phase = its first section; no delete / manual order |
| `taskDetails.get` | + `…/schedule`, `…/work-logs`, `…/dependencies`, sections | comments / files / subtasks empty (no list API) |
| `assignments.listMine / accept / decline`, `reassign.reassign` | POST `…/assignments/{id}/accept`, `/decline`, `/reassign` (assignment If-Match) | own assignment via `access/me` |
| `calendar.range` | task loader + milestones | open tasks on their due day, dated milestones |
| `members.leave` | GET `…/access/me`, POST `/spaces/{spaceId}/leave` (If-Match = own membership revision) | owner refused ("last-owner") |
| `settings.transfer` / `requestTransfer` / `cancelTransfer` | GET `…/ownership-handovers` (owner-only), POST `/spaces/{spaceId}/ownership-handovers` (Idempotency-Key), POST `…/{id}/revoke` (If-Match) | pending handover only; no request time (`requestedAt` now optional in the domain) |
| `imports.inspect` / `dryRun` / `commit` | POST `…/change-plans/csv/inspection`, POST `…/change-plans/csv` (Idempotency-Key), POST `…/change-plans/{planId}/apply` (If-Match + manifestHash) | mapping rewritten to `title,estimatedMinutes,dueAt` (hours → minutes, due day → 23:59 local); status / assignee mapping refused; commit sends only the dry-run's ready rows; API error row = file line (header = 1) |
| `settings.saveTemplate` | GET `/projects/{id}`, `…/components/{phases,sections,milestones}`, LIST view, `…/tasks/{taskId}/association`, `…/dependencies`; POST `…/templates` (Idempotency-Key) | keys = item ids; retired / dangling edges dropped |
| `settings.remove` | GET `/projects/{id}`, POST `/projects/{id}/deletion-request` (If-Match, `{password}`) | typed name compared with the live title first |

Evidence: contract fakes `api-project-repositories.test.ts` (16), mock/UI tests after the R5 seam change (43 in 8 files). Adapters: `api-project-repositories.ts`, `api-project-members-repository.ts`, `api-project-fields-repository.ts`, `api-project-imports-repository.ts`, `api-project-schedule-repository.ts`, `api-project-shared.ts`. Unverified contract assumptions (check at the first live run): membership id = access id used by assignments; membership / dependency If-Match = quoted revision; reschedule `sourceRevision` = task revision.

## Projects — still refused after the 849-op contract (2026-11-12)

Every method not listed above rejects "unsupported" in live mode (no request, no mock data). Resolved: R2 members, R5 seam, R7 fields (list / save), R10 inspection + dry run + apply, R11 handover (request / status / revoke). Backend handoff: `FABLE_BACKEND_HANDOFF_P6_01.md` "R1–R12" table. Kind: **B** = Backend endpoint / field missing, **P** = backend policy needs an owner decision, **F** = frontend model change needs owner approval.

| # | Still refused (seam) | Kind | Exact requirement |
|---|---|---|---|
| R1/R3 | `projects.setStatus`, `projectCreate` | B + P | Health is shown as Unknown (owner decision 1) and cannot be saved until a health definition / field exists. Create needs the operator-supplied `retentionPolicyVersion` (config value) and a key-availability read; directory "recent" list and the invitee's invitation count have no API |
| R4 | `invitations`, `memberInvites` | B + P | ADR 0027: accept needs `X-Invitation-Proof`, returned only once to the inviter. Needed: an approved proof delivery (private link / fragment), GET pending invitations per project and for the invitee (`/me/invitations`), resend (or revoke + reissue rule) |
| R6 | `workflowDrafts`, `projectTasks.remove / reorder`, `assignments.revertAccept / remind`, `taskDetails.toggleSubtask / setShowInCalendar`, task comments / files list | Deferred | Workflow drafts (publish / bind exist but the editor's draft model is not mapped), no task delete, manual order, accept → pending, reminders, shared subtasks, personal calendar projection, comment / file list per task |
| R8 | `schedule.preview` "only this task" + milestones, `overlaps`, `criticalPath` | P | Single-task `PUT …/schedule` is not a preview; critical-path definition (durations, calendar, lag) and milestone-to-task moves need decisions. Overlap candidates exist but are not availability |
| R9 | `reports.summary`, `activity` | B + P | Snapshots are explicit captured points; the screen needs weekly scope / done series, on-time, cycle time and per-assignee done for every week. Needed: approved per-assignee attribution and burn baselines, and either scheduled weekly snapshots or a series read; activity needs a documented `action` vocabulary with field / old / new / target title |
| R10 | `imports.config` / `undo`, status / assignee columns | P | No undo of an applied plan (needs conflict / later-edit / retention rules); CSV creates OPEN unassigned tasks only |
| R11 | `settings.access / setAccess`, `confirmTransfer` | F | Access policy = versioned role defaults, not the screen's toggles; the successor accepts with their own password, so the owner "confirm" step has no counterpart (screen flow change needs owner approval) |
| R12 | `milestones`, `risks`, `files`, `grants`, `workload`, `members.setCapacity`, `calendar.myBusy`, `projectCreate.isKeyAvailable` | B + P + F | Milestones: dated phases with progress, milestone owner; risks: code, 3-level probability (API 0–100), checklist, close reason, comments on register items; files: folders, binary versions, uploader; guests: grant-only admission has no role and no directory; capacity: explicit per-day records, unknown = null (screen needs one weekly number); no project-scoped busy read; no key-availability read |

## Teams (2026-11-13, contract 860 ops sha256 `2373647c…e8238`; types `src/api/generated/openapi-p6-teams.d.ts`, 63 paths / 86 ops)

Live adapter: `src/data/api/api-team-repositories.ts` (wired in `provider.tsx`; never the mock in live). T1 (`GET /teams/{id}/access/me`) and T2 (membership `displayName`) are now in the contract. Contract fakes: `api-team-repositories.test.ts` 6/6. IMPLEMENTED ≠ LIVE VERIFIED.

| Seam | Status | Operations / reason |
|---|---|---|
| `teams.listAccessible / access` | IMPL | GET `/teams`, `/{id}`, `access/me`, `memberships`, `tasks` (open count), `projects` (active links). ACTIVE/ARCHIVED only; 403/404 = not available. Fixed in live (no API): tint indigo, planning mode weekly, `forYou` 0, `checkinMissing` false, `recentIds` [] |
| capabilities | IMPL | access/me hints ∧ live support: modules overview / calendar / people (+ settings for owner or `custody.archive`); archive/restore = `custody.archive`; ownTeam = OWNER; invite, tasks, planning, files, goals, analytics false |
| `teams.restore`, `teams.members` | IMPL | POST `/restore` (If-Match ETag); ACTIVE memberships (title "" — no job title) |
| `teamMembers.list / setRole / remove` | IMPL | rows with per-row rights from `membership.admin` / `membership.manager`; PATCH `/memberships/{accessId}` {state, memberRole}, If-Match = membership revision; remove = REVOKED |
| `teamMembers.cancelInvite` | IMPL | GET `/invitations/{offerId}` → POST `/revoke` (If-Match revision) |
| `teamCalendar.range` | IMPL | GET `/teams/{id}/calendar` (to exclusive), ACTIVE EVENT items → kind meeting |
| `teamSettings.archive / remove / requestTransfer` | IMPL | archive, delete (typed name + password), POST `ownership-handovers` {successorAccessId} (Idempotency-Key); `TeamTransfer.requestedAt` now optional |
| `projectAssociations.unlink` | IMPL | DELETE `/teams/{id}/projects/{projectId}` (If-Match link revision) |
| `teams.create` | REFUSED OD-1 | needs operator `retentionPolicyVersion` |
| `teams.projects` | REFUSED model | links carry no progress / health / dates / milestone / risks |
| `teamMembers.invitations`, `resendInvite`, `teamInvitations.*` | REFUSED OD-4 | pending rows have no email / send time; invitee rows only label + expiry; accept/decline need `X-Invitation-Proof`; send returns a proof to deliver |
| `teamMembers.removalPreview / move` | REFUSED | no preview counts, no cross-team move |
| `teamSettings.get / update / setPlanningMode / transfer / cancelTransfer / confirmTransfer` | REFUSED model | no settings read model (planning, check-ins, recognition); handover readable by id only |
| `teamCalendar.overlays`, `teamEvents` | REFUSED model | no team due-date layer; meetings belong to Messages & Meetings |
| `teamTasks`, `teamPlans`, `teamSprints`, `teamBacklog`, `teamGoals`, `teamCapacity`, `teamReports` | REFUSED model | tasks: no assignees / plan week / review & blocked statuses; plans: no focus / carry-over; goals manual progress; capacity per-day minutes; dashboard counts only |
| `presence`, `teamActivity`, `teamCheckins`, `teamFiles`, `teamRecognition`, `teamFeedback` | NOT IN API / model | no operations, or case / disclosure flows |

## Companies (2026-11-13, contract 860 ops; types `src/api/generated/openapi-p6-companies.d.ts`, 121 paths / 157 ops)

Live adapter: `src/data/api/api-company-repository.ts`; `company-provider.tsx` now serves it in live mode (the mock only in Mock Mode — fixes the D7 violation). Contract fakes: `api-company-repository.test.ts` 4/4. IMPLEMENTED ≠ LIVE VERIFIED.

| Seam | Status | Operations / reason |
|---|---|---|
| `list`, `access` | IMPL | GET `/companies`, `/{id}`, root `contexts/{scopeId}/access/me` + `members` (displayName), `/departments` + `/units`, per-department `access/me` (403/404 skipped) → myDepartmentIds, managed = DEPT_MANAGER. Empty in live (no API): legalName "", currency / fiscalStartMonth null, approvalsForMe 0, lifecycleAt null, recentIds [] |
| capabilities | IMPL | access/me ∧ live support: modules overview / departments (+ settings with `custody.archive` or OWNER); manageDepartments = `settings.manage`; allDepartments = OWNER / ORG_ADMIN / ADMIN; everything else false |
| `restore`, `archive`, `remove` | IMPL | POST `/restore`, `/archive`, `/delete` {password} with the company ETag; typed name checked first |
| `departments`, `createDepartment`, `updateDepartment` | IMPL | departments + units (unit parent = `departmentId`), people = ACTIVE members per context (unreadable → 0); POST departments / units (Idempotency-Key, client id), PATCH department / unit {title} (If-Match revision). Manager, budget, teams null (no API); a manager → unsupported |
| `create` | REFUSED OD-1 | retentionPolicyVersion |
| `invite`, `invitations`, `accept/declineInvitation`, `pendingInvites` | REFUSED OD-4 | proof delivery / X-Invitation-Proof; rows lack email / department |
| `previewMove`, `moveDepartment` | REFUSED OD-5 | fixed tree |
| `goals`, `rooms`, `bookRoom`, `capacity`, KB writes / ack / remind, payment runs, employee file, `settings`, `updateGeneral`, `setGrant` | REFUSED OD-2/3/6/7/8/9 | owner decisions |
| `effectivePolicies`, `overridePolicy`, `setPolicyLevel` | REFUSED model | rules are capability rules (key, mode, roles), not named values with levels |
| `staff`, `updateWorkProfile` | REFUSED model | no location / phone / hours / equipment / booking |
| `overview` | REFUSED model | reports are window totals; no KPIs / quarters / capacity watch |
| expenses, approvals, chains, budgets, reimbursements | REFUSED model | no company currency (per-row currency + scale), versioned expense / workflow model differs |
| `resources` (read) | IMPL (2026-11-13) | root + department `resources`, allocations (ALLOCATED now → assigned, holder name from members), RETIRED → retired; tag "" and type other (not in API), note = description, busy = allocations |
| `kbFolders`, `kbPages`, `kbPage`, `kbSearch` | IMPL (2026-11-13) | knowledge folders / documents (`folderId`, `search`) / versions; page = published versions (number = order); a text/* published file is downloaded as the body, other files are listed; author, ack, audience not served (blank / 0 / false); restricted false (the API lists only readable folders) |
| `respondCorrective`, `appealCorrective`, `closeCorrective` | IMPL (2026-11-13) | employee-case entries RESPONSE / APPEAL / REVIEW (RESOLVED), If-Match case revision, Idempotency-Key; the case must belong to the person; status from case state + latest entries. Still behind the sealed employee file (OD-8) in the UI |
| `acceptAttach`, `declineAttach`, `cancelAttach` | IMPL (2026-11-13) | association by id → `attachment-requests/accept` (refused if any project consent is false: no per-project consent) / `revoke` side SOURCE / COMPANY (If-Match revision) |
| `reports` | IMPL partial (2026-11-13) | per-department `reports/operations` (last 30 days): headcount (memberCount) and capacity (available hours); unreadable departments skipped; portfolio / expenses / variance / goals series not provided |
| `exports`, `requestExport` | IMPL (2026-11-13) | history GET `/exports` (no dataset / format / requester → null; status from `downloadAvailable`); request POST `/exports` CSV with dataset portfolio / operations / finance / audit, content returned inline as `file` and saved by the Reports screen; PDF and goals refused |
| `audit` | IMPL (2026-11-13) | GET `/audit` (actorDisplayName); kind from the action prefix (export / policy / file / approval / ownership, else null) |
| `resourceRequests`, `requestResource`, `withdrawResourceRequest`, `addResource`, `projects`, `teams`, `attachRequests`, `attachCandidates`, `requestAttach`, `openCorrective` | REFUSED model / owner policy | direct allocations (no request record); resources have no tag / type; association rows lack names / owner / counts; no attachable-candidates read; opening a case needs a reviewer choice |
| `requestTransfer` | REFUSED model | answers the settings read model; handover takes accessId without password |

Frontend adaptations: `CompanyExport.report / format / expiresAt / watermark` nullable + optional `file` (Reports screen saves it), `AuditRow.kind` nullable (audit filter unaffected); `CompanySummary.currency` / `fiscalStartMonth` and `Department.budget` / `teams` nullable; `useCompanyFormat(null)` formats amounts without a unit; the Expenses currency footnote hides without a currency; mock fixtures unchanged.

## Messages & Meetings (2026-11-13, contract 864 ops sha256 `022c3121…cdabf`; types `src/api/generated/openapi-p6-messaging.d.ts`, 102 paths / 119 ops incl. `/social/discovery`; meetings in `api-meetings-repository.ts`)

Live adapter: `src/data/api/api-messaging-repository.ts`; `messaging-provider.tsx` serves it in live mode (`available` now true in both modes; the mock and its simulated stream only in Mock Mode). Contract fakes: `api-messaging-repository.test.ts` 5/5. IMPLEMENTED ≠ LIVE VERIFIED.

Identity (2026-11-13): seam `me` = the signed-in session user (`useSession`, id + name); my own member row in a conversation is found through that conversation's `access/me` (backend actor ids are space-local, never compared with the user id); other people = their actor id. Live mode without a session → `createUnavailableMessaging()` (every call fails, `available` false). Message commands find their conversation from an adapter map filled by reads (unknown → not-found).

| Seam | Status | Operations / reason |
|---|---|---|
| `conversations.list`, `unreadCount`, `channels.list` | IMPL | GET `/conversations` (M1: lastMessage, unreadCount, muted, lastActivityAt; sorted by lastActivityAt), roster + access/me for names / `mine`, workspace title via `/projects|teams|companies/{id}` (unreadable → ""), `/messaging/blocks` for direct `blocked`. `mentions` 0 (not served) |
| `conversations.get`, `participants` | IMPL | access/me (403/404 → not-found), members, pins count; myRole / canPost / canManage from capabilities; presence hidden; policy null, linkPreviews false, threadUnread 0 (not served) |
| `lookup` | IMPL | POST `/social/discovery` {email} (exact email only) |
| `markRead`, `mute`, `leave`, `rename`, `addPeople`, `removePerson` | IMPL | acknowledgements READ on the last message; PATCH notification-settings mode MUTED/ALL (If-Match revision, Idempotency-Key); `/leave` (If-Match own member revision); M2 PATCH `/conversations/{id}` {title} (If-Match ETag); invitations {id,userId} (If-Match, Idempotency-Key); `/members/{id}/remove` |
| `messages.page`, `thread`, `pinned` | IMPL | timeline / threads / pins (all pages, sequence order), message-policy, progress (unread after `readThrough`); HIDDEN skipped; receipts null, editedAt null, thread counts null, attachments [] |
| `send`, `edit`, `deleteForEveryone`, `deleteForMe`, `moderate`, `react`, `pin`, `report` | IMPL | advanced-actions compose (Idempotency-Key = clientOpId, mentions → member ids) / edit / delete / hide / moderate / reaction (toggle from current) / pin / report; `can` mirrors the server's 48 h author window + channel author-delete policy |
| `messages.search` | IMPL (one conversation) | `message-search?q` when `filters.in`; otherwise or with from / has / date filters → unavailable (OD-11) |
| `conversations.create`, `channels.create / workspace` | REFUSED | DM / group create needs `retentionPolicyVersion` (OD-1); channel defaults not mapped |
| `updateSettings`, `updatePolicy`, `report` (conversation), `workspaceMentions` | REFUSED | OD-10; no mention count |
| `upload`, attachments in `send` | IMPL (2026-11-13) | `upload` stages bytes from the picked / recorded object URL (sha256 in the browser; contract types: image png/jpeg, voice audio/wav, file txt/pdf/png/jpeg — others invalid); `send` posts each: `/attachments` → `/attachments/{id}/complete` (octet-stream) → `/media-messages` {caption, attachments, replyToId, mentions} (Idempotency-Key = clientOpId) |
| `page` attachments, `media`, voice playback | IMPL (2026-11-13) | page reads `media-timeline` (text + media); READY attachments downloaded once (`…/attachments/{id}/download`) to object URLs; `media` = READY attachments newest first; media caption edit = PATCH media-message (If-Match revision) |
| `forward`, `forwardTargets` | IMPL (2026-11-13) | media → `/media-forwards`, text → advanced-actions forward (Idempotency-Key = clientOpId); targets = writable conversations except the source and blocked directs |
| `settings.blocked / block / unblock` | IMPL (2026-11-13) | blocks are per direct conversation: person → our direct conversation with them (roster), `contact-block` ETag → POST `/messaging/blocks` {conversationId, active} / {blockId, active:false} |
| `settings.get / set` | REFUSED | global privacy fields not in API |
| `meetings.list`, `forCalendar` | IMPL (2026-11-13, 863 ops) | GET `/meetings` (ACTIVE only) → per meeting GET `access/me` (X1-M; 403/404 = not admitted → not listed), `/{id}`, `/members`, `/versions`. myRsvp = access/me `rsvp`; organiser = ACTIVE ORGANIZER member; inviteeCount = ACTIVE members; minutesStatus = latest version (REJECTED → draft); needsMyMinutes = `minutes.draft` ∧ ended ∧ no final version (no minute-taker role in the API). Tabs / source / range filtered client-side; `busyOnly` always false (only admitted meetings). Location null; cancelled meetings and pending invitations (no source in the row) not listed |
| `meetings.get` | IMPL | + `/agenda` (ACCEPTED + PROPOSED entries, OD-16; duration / done null), `/attachments` (READY; private uploads → only what the server returns). myRole / canEdit from access/me (`meeting.manage`); notes null; channelId null; canEditAgenda false |
| `meetings.update` | IMPL | PATCH `/meetings/{id}` {event.title / description / schedule TIMED in the planner zone, externalUrl}, If-Match ETag, Idempotency-Key |
| `meetings.rsvp` | IMPL | my invitation from `/meetings/invitations` (PENDING / ACCEPTED / TENTATIVE / DECLINED) → POST `respond` {ACCEPTED / TENTATIVE / DECLINED}, If-Match revision; none (the creator) → unavailable |
| `meetings.attach` | IMPL | POST `/attachments` {filename, mimeType txt/pdf/png/jpeg, expectedSize, sha256} → `/complete` (octet-stream); stays private to the uploader (organiser `/share` not offered) |
| `meetings.create`, `invitable`, `sources` | IMPL work sources (2026-11-13, M-X4 / M-X5) | `api-meeting-sources.ts`: `/projects`, `/teams`, `/companies` + root `access/me` (Company: `scopeId` context; 403/404 → left out) → `sources` = capability `meeting.create` only; `invitable` = root roster ACTIVE actors except my access/me actor; `create` = POST `/meetings` {id, kind, sourceId, event TIMED, externalUrl, participantActorIds} (Idempotency-Key = clientOpId, same id on retry). Personal: refused (OD-1) |
| `meetings.proposeAgenda`, `decideAgenda` | IMPL (2026-11-13, OD-16) | POST `/agenda` {id, text} (Idempotency-Key); PATCH `/agenda/{entryId}` {state ACCEPTED/REJECTED} (If-Match entry revision, Idempotency-Key). `canProposeAgenda` = `agenda.propose`, `canDecideAgenda` = `meeting.manage` |
| `meetings.addAgenda`, `toggleAgenda`, `saveNotes` | REFUSED | no duration / done / notes in the API (OD-16: proposals instead; Notes tab hidden in live) |
| `meetings.invitations` | IMPL (2026-11-13, OD-15) | GET `/meetings/invitations` PENDING ∧ unexpired → reduced rows (title + time); answered via `rsvp` |
| `minutes.get` | IMPL | latest visible version: summary = `minutes`, decisions (author null), actions (assignee / due null; Personal task link from `actions/{id}/tasks` on a final version), one review row, version history (author, finalizedAt ?? createdAt, review reason). can: write = `minutes.draft` ∧ (none / DRAFT / REJECTED); submit = my DRAFT; review = IN_REVIEW ∧ I am the reviewer; finalize = `meeting.manage` ∧ (APPROVED ∨ sole-member independent DRAFT); makeTask = independent ∧ FINAL |
| `minutes.save` | IMPL | POST `/versions` (child of the latest; fresh decision / action ids — they are global keys; attachments / contributors / reviewer carried); assignee or due → unavailable before any write |
| `minutes.submit`, `approve`, `requestChanges`, `finalize` | IMPL | PATCH `…/reviewer` {memberId} (exactly one reviewer, else `one-reviewer`) → POST `submit`; POST `review` APPROVE (reason required → `reason-required`) / REJECT {reason}; POST `finalize`; If-Match = version revision |
| `minutes.linkTask` | IMPL (Personal) | POST `actions/{id}/tasks` {taskId}; work meetings: no `release` flow in the UI and Project / Team task creation is refused in live → `makeTask` false |
| `announcements.list`, `ack` | IMPL (2026-11-13, M-A1) | `api-announcements-repository.ts`: scope versions → latest PUBLISHED per announcement; author = `authorDisplayName` (null → no author shown); pinned (no end date); acked; ack totals from manager-only `…/acknowledgements` (403 → none; pending names not served); ack = POST `…/versions/{versionId}/acknowledge`. Seam `list(workspaceId, kind)` |
| `announcements.access`, `publish`, `remind` | REFUSED | audience / schedule not in the API; reminders OD-13 → composer hidden |
| `subscribe` | IMPL (no events) | no realtime transport in the contract; never simulated |

## Remaining blockers — Teams, Companies, Messages & Meetings (864-op contract, 2026-11-13)

Contract delta 863 → 864 (sha256 `022c3121…cdabf`): `GET /teams/{id}/ownership-handovers` (+1 op); additive request / response changes: `participantActorIds` on work meetings, `{id, actorId}` invitations, `authorDisplayName` on announcement versions, `meeting.create` capability hint. Messaging (102 paths / 119 ops) and Teams (63 / 87) subsets regenerated; Projects / Companies subsets byte-identical. Earlier: 860 → 863 Social (2) + `GET /meetings/{id}/access/me` (X1-M).

### A. Backend gaps (need a backend change)

| ID | Module · screen | Existing endpoint / missing capability | Why the current API cannot support it | Required backend change | Priority |
|---|---|---|---|---|---|
| M-X4 | Meetings · MT-02 New meeting (work sources) | POST `/meetings` `participantActorIds`; POST `/meetings/{id}/invitations` {id, actorId} (864) | **RESOLVED 2026-11-13** — `create` posts source-roster actor ids; `invitable` = ACTIVE root-roster actors except me. Personal meetings still need OD-1. `{id, actorId}` invitations have no UI surface (no add-invitee in MT-02) → frontend-only gap | — | — |
| M-X5 | Meetings · MT-02 source picker | Project / Team / Company root `access/me` `meeting.create` (864) | **RESOLVED 2026-11-13** — `sources` lists only workspaces reporting the capability (re-read on every sheet open) | — | — |
| M-A1 (partly resolved) | Announcements · MT-04 feed | `/announcements/scopes/{kind}/{scopeId}`, versions `authorDisplayName`, manager-only `…/acknowledgements` | **RESOLVED 2026-11-13 for read + acknowledge** (author when served, pinned flag, my ack, manager totals). **Still open (BE)**: audience, scheduling, pin end, pending names, reminders (OD-13), so the composer (`access` / `publish`) stays refused | audience + schedule model | Medium |
| M-X6 | Minutes · MT-03 action items | `/versions` `actions[]` {id, title, description} | no assignee or due date on actions; UI assignee select is refused | optional `assigneeMemberId` + `dueDate` on version actions | Low |
| M-X7 | Minutes · MT-03 decisions | `/versions` `decisions[]` {id, text} | no proposer per decision (shown blank) | optional `proposedByMemberId` on decisions | Low |
| T-M1 | Teams · TM-03…TM-12 tasks / plans / sprints / backlog / goals / capacity / reports | `/teams/{id}/tasks`, dashboard counts | tasks lack assignees, plan week, review / blocked statuses; plans lack focus / carry-over; capacity is per-day minutes; dashboard is counts only | team work model per the matrix rows above (separate backend batch) | Medium |
| T-M2 (partly resolved) | Teams · TM-14 ownership transfer / settings | `GET /teams/{id}/ownership-handovers` (864, Owner-only, signed `after`) | **RESOLVED 2026-11-13 for the transfer**: `transfer` = unexpired PENDING handover, `cancelTransfer` = revoke (If-Match). Accept is terminal (successor's password) → no owner `confirmTransfer` (refused). **Still open (BE)**: Team settings read model (planning mode, check-ins, recognition — undefined Team policies) | settings read/update model | Medium |
| T-M3 (open, FA) | Teams · TM-01 project links | `/teams/{id}/projects` | links carry no progress / health / dates / milestone / risks | project summary fields on team project links | Low | Backend 864: no new field — documented mapping = linked rows embed the visible Project, dates / progress from the Project overview / dashboard. **Frontend-only limitation**: TM-01/TM-06/people/analytics rows need non-null health (no approved definition — Projects live shows none) and team-people overlap (team vs project actor ids are space-local, not comparable); mapping would need nullable health / dates / people across four Team screens → not done.
| T-M4 | Teams · presence, activity, check-ins, files, recognition, feedback | — | no operations (or case / disclosure flows with a different model) | new modules (Phase 4 scope) | Low |
| C-M1 | Companies · CO-07…CO-09 expenses, approvals, budgets, reimbursements | `/companies/{id}/…expenses`, workflows | no company currency (per-row currency + scale); versioned expense / workflow model differs from the screens | company currency setting (with OD-9) and the documented mapping for the finance screens | Medium |
| C-M2 | Companies · CO-10 policies | policy rules | rules are capability rules (key, mode, roles), not named values with levels | named policy values with inheritance level, or owner accepts the capability-rule UI (FA) | Low |
| C-M3 | Companies · CO-04 staff / work profile, CO-01 overview KPIs | staff-profiles, `reports/operations` | no location / phone / hours / equipment; reports are window totals (no KPIs / quarters / capacity watch) | profile fields + overview KPI series | Low |
| C-M4 (open) | Companies · resource requests, project / team associations, attach candidates | resources, allocations, associations | direct allocations only (no request record); association rows lack names / owner / counts; no attachable-candidates read | resource request record; names + counts on associations; candidates read | Low | Backend 864: attach candidates = caller-owned independent Projects / Teams from the existing `/projects`, `/teams` reads (create re-checks). Not wired: the only consumer is the attach dialog, gated by `requestAttach` (false in live) whose result model (members, linked-project consent, department) is still unserved — **frontend-only limitation until C-M4 request records / association names land**.

### B. Owner decisions blocking integration (no backend change until decided)

| ID | Decision | Blocks |
|---|---|---|
| OD-1 | operator `retentionPolicyVersion` delivered to the client (backend SOCIAL-I01: no resolver / default exists by design) | Team create, Company create, personal meetings, DM / group create |
| OD-4 | invitation proof delivery (`X-Invitation-Proof`) | Team / Company invitations, pending invite lists |
| OD-2/3/5/6/7/8/9 | Company goals, rooms / heat, department move, KB model + ack, payment runs, sealed employee file, settings fields | listed Company seams |
| OD-10/11/12/13 | channel settings beyond author-delete; global message search; busy-only meetings for non-invitees; announcement remind | listed Messaging seams |
| OD-15 | **APPROVED** — invitations without source details use reduced rows | APPLIED 2026-11-13 (MT-01 `meetings.invitations`) |
| OD-16 | **APPROVED** — agenda follows the backend proposal / accept / reject model | APPLIED 2026-11-13 (live `proposeAgenda` / `decideAgenda`; Notes hidden in live) |
| OD-17 | **APPROVED** — one reviewer; approval requires a reason | APPLIED 2026-11-13 (MT-03 reviewer radio, Approve disabled without a reason) |
| OD-18 | **APPROVED** — explicit Save creates a new Minutes version | APPLIED 2026-11-13 (MT-03 local draft + Save) |

### C. Frontend-only adaptations

- Done this run: meetings / minutes live mapping (`api-meetings-repository.ts`); `AgendaItem.minutes`, `Decision.proposedBy`, `MeetingDetail.notes` nullable (UI hides them); `minutes.approve(meetingId, comment?)` sends the reviewer's comment; `meetings.attach` passes the picked file; `errorText` shows "Not available yet" for refusals (was the rate-limit text), plus `reason-required` / `one-reviewer` (en / fa).
- Pending: organiser `/share` of an upload as agenda material; minutes `withdraw`; work-meeting Make task via `actions/{id}/release` + `/tasks` (also needs Project phases / Team tasks in live); invite more people into an existing meeting (`POST /meetings/{id}/invitations` {id, actorId} is in the contract, but MT-02 has no add-invitee surface — invitees are chosen only at creation, which uses `participantActorIds`).
- Done 2026-11-13 (864 ops): OD-15 reduced invitation rows (MT-01 Upcoming, Accept / Maybe / Decline via `rsvp`); OD-16 live agenda = proposals (Propose form when `agenda.propose`, Accept / Reject for `meeting.manage`, no done checkbox when `done` is null; Notes tab hidden when notes are not served); OD-17 one reviewer (radio) + approval reason required (en/fa); OD-18 explicit Save (summary / decisions / actions are a local draft, one Save = one new version; Send for review blocked while unsaved). Mock Mode keeps its own agenda / notes (no proposals, no invitation rows).

## Social (2026-11-13, contract 860 ops sha256 `2373647c…` — `planner-backend/docs/api/openapi.json`; Social ops identical to the P6-01 handoff; types `src/api/generated/openapi-p6-social.d.ts`, 30 paths / 40 ops)

Live adapter: `src/data/api/api-social-repository.ts`; `social-provider.tsx` serves it for the signed-in session user (no session → `createUnavailableSocial()`, Social shows "Sign in"). Mock Mode unchanged (`mock-social.ts`). Contract fakes: `api-social-repository.test.ts` 9/9. IMPLEMENTED ≠ LIVE VERIFIED. Unsupported seams reject `SocialError("unsupported", <reason>)`; screens show "Not available yet" in that slot — never placeholder data.

Identity: other people = user ids; the session user = seam `me`. **X-S1** connections, join requests and memberships carry no display names → names blank (only discovery returns a name). **X-S2** no caller membership / role for a Social Group (no access/me; membership actor ids are space-local) → `myRole` null, owner-only rights off; admin review rights = the server answering `GET join-requests` (403 → none).

| Seam | Status | Operations / reason |
|---|---|---|
| `connections.list`, `requests` | IMPL | GET `/social/connections` (ACCEPTED → list, PENDING → requests; direction from requesterUserId = session user) + GET `/social/circles` + `/circles/{id}/members` (labels by connection id). sharedGroups / mutualGroups null (not served) |
| `connections.request` | IMPL | POST `/social/discovery` {email} → POST `/social/connections` {id, recipientUserId} (Idempotency-Key); empty discovery and 409 give the same "sent" answer. Phone / note not in contract (note dropped; phone → invalid) |
| `accept`, `ignore` (decline), `cancel`, `remove` | IMPL | POST `/social/connections/{id}/{action}` (If-Match revision, Idempotency-Key) |
| `block` | IMPL | POST `/social/blocks` {targetUserId} (If-Match "1" initial, Idempotency-Key). Blocked list not shown (rows carry no identity, by contract) |
| `privacy`, `setPrivacy` | IMPL (part) | GET / PATCH `/social/privacy` allowFriendRequests (If-Match, Idempotency-Key); "people in my groups" → REFUSED (no such option); `discoverable` not surfaced (no UI) |
| `circles.list / create / remove / setMembership` | IMPL | `/social/circles` GET / POST {id, name}; DELETE `/{id}` and PUT / DELETE `/{id}/members/{connectionId}` with the circle revision (refetched after labels) |
| `groups.directory` | IMPL | GET `/social-groups` + memberships (ACTIVE count) + join-requests (admin probe). topic / currency / role / unread not served (null / 0) |
| `groups.access` | IMPL | GET `/social-groups/{id}` (+ memberships, join-requests) → member; 403/404 → join-requested (only for a request sent this session, with the discover preview) else not-available. Guest / left states not served |
| `discover` | IMPL | GET `/social-groups/discover` {id, name, publicSummary}; text filter client-side; topic filter REFUSED (not served) |
| `requestJoin`, `cancelJoin` | IMPL | POST `/{id}/join-requests` {id}; cancel = `/{requestId}/cancel` (If-Match) — only for requests sent this session (no own-request list) |
| `joinRequests`, `decide` | IMPL | GET `/{id}/join-requests`; `/{requestId}/approve|reject` (If-Match) |
| `invite`, `cancelInvite` | IMPL | POST `/{id}/invitations` {kind MEMBERSHIP, memberRole MEMBER, recipient {userId}}; revoke after GET (If-Match) |
| `setRole`, `removeMember` | IMPL | PATCH `/{id}/memberships/{accessId}` {state ACTIVE / REVOKED, memberRole} (If-Match) — UI shows them only when the role is known (X-S2) |
| `transferOwnership` | IMPL (start only) | POST `/{id}/handovers` {successorAccessId}; accept (password reauth) / decline / revoke UI not built |
| `updateSettings` | IMPL (part) | PATCH `/social-groups/{id}` name / description / discoverable (If-Match); invites, approvers, balances, originals, rules, currency → REFUSED |
| `inbox.list` | IMPL (part) | composed from served data only: incoming connection requests + reviewable join requests |
| `groups.create` | REFUSED OD-1 | needs operator `retentionPolicyVersion` |
| `groups.leave` | REFUSED X-S2 | If-Match needs the caller's own membership revision |
| `events`, `invites` list, `resendInvite`, `setMyStatus`, `leaveChecklist`, `deleteGroup` | REFUSED | no activity log (P6-06), no invitation list, no per-group status, checklist needs P6-03…05, no delete (30-day closure) |
| `chatMembers` (group chat), direct messages | REFUSED | Social Group Chat integration not available (handoff §7); DMs go through the Messages adapter, whose create is refused (OD-1) |
| `activities`, `checklist`, `files`, `polls`, `freeBusy` | REFUSED | P6-02 not in contract |
| `expenses`, `balances`, `settlements` (+ Personal Finance posting) | REFUSED | P6-03 not in contract |
| `lending`, `lostFound` | REFUSED | P6-04 not in contract |
| `albums`, `challenges` | REFUSED | P6-05 not in contract |
| `/social/restore-replay`, `/social-group-invitations/*` (preview / accept / decline with X-Invitation-Proof), `GET /social/blocks`, `/blocks/{id}/unblock`, handover accept / decline / revoke | NOT USED | no UI surface in the approved Social design (invitation proofs are never stored; restore is an operator procedure) |
