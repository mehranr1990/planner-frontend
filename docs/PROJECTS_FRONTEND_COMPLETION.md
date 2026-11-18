# Projects frontend completion (P2 gap closure) — 2026-11-17

Status: **IMPLEMENTED, NOT LIVE VERIFIED** (live run blocked by policy, see §6). Uncommitted by instruction.

Contract: `planner-backend/docs/api/openapi.json` at backend `a17c2e3` (1,193 ops, sha256 `99ad4f54…8d8c4b`), handoff `docs/frontend-handoff/PROJECTS_GAP_CLOSURE.md` (36 new ops). Backend read only, not modified.
Types: `src/api/generated/openapi-p6-projects.d.ts` regenerated with openapi-typescript 7.8.0 from a subset (previous path set + every `/api/v1/projects*` and `/api/v1/spaces/*` path): 156 paths / 204 ops (was 128 paths). Raw JSON not committed.

## 1. Existing features reused (unchanged)

Directory / access gate, overview KPIs, task list / board / detail, timeline / Gantt, calendar, members (roles, removal, leave), settings (general, lifecycle, fields, CSV import, handover, role policy), comments on tasks, dependencies, cascade reschedule, workload grid and analytics compute, risk register list / edit / history, invitations send / revoke, recipient accept. No page, hook, query, repository seam or adapter was duplicated; every change lives in the existing live adapters (`src/data/api/api-project-*.ts`) plus two new adapters wired into the existing `api-project-repositories.ts` registry.

## 2. Newly completed live integrations

| Area | Seam method(s) | Backend operation | Notes |
|---|---|---|---|
| Atomic create, templates, team owner, keys | `projectCreate.create`, `limits` | `POST /projects` {key, startDate, endDate, template BLANK·KANBAN·SCRUM, ownerTeamId} | One request (no metadata PATCH / "details" partial any more); attempt id = project id = Idempotency-Key; 409 → `key-taken` (server namespace, no global availability claim); limits: blank / kanban / scrum, team owner on |
| Task delete | `projectTasks.remove` | `DELETE /projects/{id}/tasks/{taskId}` (If-Match + key) | Children deleted before parents; a parent with live children outside the selection is refused before any request |
| Task order | `projectTasks.reorder`; row order | `GET …/tasks/order`, `PATCH …/tasks/{id}` {position} | Rows sorted by section, position, id (the server's order rule, from the LIST view fields); reorder within one section only |
| Subtasks | `ProjectTask.subtasks`, `taskDetails.get / toggleSubtask` | `GET …/tasks/{id}/subtasks`, LIST `parentTaskId` | Child tasks (canceled hidden); toggle = DONE ⇄ OPEN (PATCH, or the bound version's edge) |
| Assignment withdrawal / reminder | `assignments.revertAccept / remind` | `POST …/assignments/{id}/revert`, `…/remind` (assignment revision + key) | Remind targets every pending assignment; once per UTC day enforced by the server |
| Workflow drafts | `workflowDrafts.*` (new `api-project-workflow-drafts.ts`) | `workflow-drafts` list / create / patch / publish-preview / publish / discard | Kept state ids and approval edges preserved; preview = removed states with pinned task counts, renamed, added, new transitions |
| Pending invitations, resend | `memberInvites.listPending / resend` | `GET /spaces/{spaceId}/invitations?state=PENDING`, `POST …/{id}/resend` | `sentAt` = in-app offer time; withheld email stays ""; proof never read or shown |
| Decline note | `invitations.decline(id, note)` | `POST /invitations/{id}/decline` {note ≤ 500} | Longer note → `invalid` before any request |
| Phase dates / progress, milestone open tasks | `milestones.listPhases / listMilestones / phaseRows / milestoneRows` | `GET /projects/{id}/structure/progress` | 403 → components only (null); `behindDays` stays null |
| Activity | `activity.list` (new `api-project-activity-repository.ts`) | `GET /projects/{id}/activity` | TASK_STATUS → "moved", TASK_COMPLETED → "completed"; other kinds and null titles left out (see §4) |
| Cycle time | analytics `cycleMedianDays` | SharedTask `firstStartedAt` | `ProjectTask.startedAt` = persisted first IN_PROGRESS; no evidence = not sampled |
| Risks | `risks.get/list` (code, checklist, close reason / note, converted issue), `setChecklistItem`, `close`, `resolve`, `convert`, `comments`, `addComment` | register-items checklist / close / convert, comments target REGISTER_ITEM | resolve = close "resolved" + note; convert returns the new ISSUE |
| Files | `files.list / config / upload / restoreVersion / download` | file-folders, file-library, files/config, files/{id}/metadata, versions (+ download), POST files {folderId} | Uploader from the roster; new version = library revision + key, real bytes through the existing complete pipeline; restore = old version bytes re-uploaded |

Capabilities (from `access/me`, unchanged rule "backend hint ∧ supported in live"): `deleteTasks` = `task.delete`; `reorderTasks` = `task.update` ∧ `work.manage`; `invite` = `membership.admin` ∨ `membership.manager`; `closeRisk` = `work.manage`; `manageFiles` = full scope ∧ `file.read` ∧ `work.manage`.

## 3. Previously mock-only / refused flows now connected

Task delete, manual order, subtasks, revert accept, remind, workflow drafts (was refused for the whole repository), project activity (was refused), pending invitations, resend, decline note, risk close / resolve / convert / checklist / comments, file folders / versions / restore / server limits, Kanban / Scrum templates, team-owned create, phase progress (was always Unknown), burn-up scope per week from task `createdAt`.

Small UI change (no redesign): the New project template select gains **Kanban** and **Scrum** (en / fa labels); `templatesLimited` copy now says Product launch / Website / Event are not available in live. `ProjectTemplate` type gained `kanban | scrum` (mock ignores the template as before).

## 4. Remaining exact contract mismatches

1. **409 reason codes are not delivered.** The handoff lists `TASK_HAS_ACTIVE_CHILDREN`, `PROJECT_KEY_CONFLICT`, `FOLDER_*`, `FILE_VERSION_LIMIT`, `RISK_ALREADY_CONVERTED_OR_UNAVAILABLE`, but `api-exception.filter.ts` maps every 409 to `{code: "CONFLICT"}`. The frontend pre-checks children before DELETE and treats a create 409 as `key-taken`; other 409s show the generic conflict.
2. **Workflow publish cannot move tasks.** The editor asks for a target status for removed statuses that still hold tasks; the server keeps every task on its pinned version and never rebinds. A publish with a mapping is refused before any request ("unsupported"); publishing works when nothing must move.
3. **Activity kinds.** STATUS_NOTE carries no health value, MILESTONE_REACHED has no milestone title / date (and the overview line says "added milestone"); SCOPE_CHANGED / CONTENT / OTHER have no overview line. They are not shown. Scope history (`/scope-history`) and sprints have no Projects UI → not wired.
4. **Health is advisory and read-only**: the manual status chip (`projects.setStatus`, `editStatus`) stays refused; reasons / observed metrics have no UI slot.
5. **Templates**: Product launch / Website / Event have no server catalogue entry (disabled in live). Custom project templates (`/templates`, `/change-plans`) have no create-flow UI.
6. Unchanged refusals (no operation): show-in-calendar for project tasks, project-scoped busy read, critical path / overlaps, "only this task" reschedule, CSV undo, owner confirm-transfer, checklist row ⇄ task link, folder create / move (UI marks folder creation "coming soon"; no seam for move).

## 5. Policy-gated behavior

- **PB-13 (owner decision)**: risk probability 0–100 vs the 3-level UI — probability is not shown and edits are refused.
- **PB-14 (owner decision)**: weekly member capacity — capacity stays Unknown, `editCapacity` false.
- **Guest grants (PB-16)**: the backend implemented no new guest grants → `grants` and the guest invite role stay refused.
- Shared activation, retention admission and role restrictions are enforced by the server; the frontend never fabricates access, metrics or capacity.

## 6. Tests and build

- `tsc --noEmit`: 0 errors. ESLint on all touched Projects files: 0 problems.
- Vitest, Projects scope only (`src/data/api/api-project*`, `src/data/mock/mock-project*`, `src/features/projects`, `src/messages`), final run: **47 files / 248 tests passed, 1 skipped** (the env-gated live file without env). Includes the new `api-project-completion.test.ts` (4: drafts ×2, activity, health) and the updated suites: create (6), files (3), member invites (5), milestones (3), gap closure (7), repositories (25). Contract fakes are not live evidence.
- Contract match (script over every `api.request` in `api-project-*.ts`): 145 calls / 102 operations, **0 outside the contract**.
- `npm run build`: not run (Personal report: the build is gated by the Next.js security-advisory check pending the approved patch upgrade; no Projects build-specific change).
- Personal suites not re-run (instruction).

## 7. Live API verification

Backend `http://127.0.0.1:3000/health/ready` 200; dedicated local test account from `.env.live.local`. New env-gated file `src/data/api/api-projects-completion.live.test.ts` (create Kanban project → child task / subtask toggle → order → delete guard → health / progress / activity → draft save / discard → file config → delete → archive). Result: **blocked by policy** — `POST /projects` → 403; probe (one sign-in): `GET /retention-policies`, `GET /projects/templates/catalog`, `GET /projects` all 403 `FORBIDDEN`. Shared is not activated for the test account and was not activated (instruction). No project data was created.

## 8. Visual verification

None. No browser was used; no UI / screenshot claim is made. The only visible change is the two extra template options and the updated limited-templates note on the New project sheet.

## 9. Git

Branch `integration/backend-864-ops`. Projects changes are **uncommitted** (instruction). Personal commit `04487b5` is local and 1 ahead of `origin` (not pushed in this run). Untracked and unrelated: `docs/Backend-Handoff/openapi.json` (left untouched).

Changed: `src/api/generated/openapi-p6-projects.d.ts`; `src/data/api/api-project-{create,directory,files,invitations,member-invites,milestones,repositories,risks,task-work,tasks,work-insights}-*.ts` and their tests; `src/data/project-domain.ts` (`ProjectTemplate`, phase comments), `src/data/project-repositories.ts` (limits comment); `src/features/projects/sheets/new-project-sheet.tsx`; `src/messages/{en,fa}/projects.json`. New: `api-project-workflow-drafts.ts`, `api-project-activity-repository.ts`, `api-project-completion.test.ts`, `api-projects-completion.live.test.ts`, this report.

## 10. Final blocker review (2026-11-17, second pass)

**Git.** `git fetch`: local `integration/backend-864-ops` = `origin/main` = `04487b5` (0 / 0). It shows "ahead 1" only against its own upstream `origin/integration/backend-864-ops` (`21eac3d`): the Personal commit was pushed to `main`, not to the feature branch. Local `main` (`4773064`) is a stale ref, 3 behind `origin/main`. No history was changed.

**Shared activation (why 403).** `SharedKernel.enabled()` throws `SHARED_ACTIVATION_GATED` unless both `SHARED_SECURITY_ACCEPTANCE_REFERENCE` and `SHARED_CONTROL_ACTIVE_KEY_ID` are set; the backend `.env` sets neither (it has `ERASURE_CONTROL_ROOT` only), and `.env.example` says Shared "remains gated until complete operator retention and security acceptance". Prerequisites present: 101 migrations; retention catalog seeded in `mehran_dev` (`mp-rpc-v1.0-work` PROJECT/TEAM, `…-conversation`, `…-meeting`; approval "RPC-v1.0 owner product configuration 2026-11-14; development/pre-production only"); feature policy = free (no quota); `PrivacyGate` ready (no restore quarantine); 0 Shared custodies. Missing and owner-approved only: `SHARED_CONTROL_KEYS` (JSON keyring, purpose-specific secret ≠ `BETTER_AUTH_SECRET`), `SHARED_CONTROL_ACTIVE_KEY_ID`, `SHARED_SECURITY_ACCEPTANCE_REFERENCE` (operator security-acceptance reference), optional `SHARED_CONTROL_ROOT` (default `STORAGE_ROOT-shared-control`; must be an independent sibling of `STORAGE_ROOT` and `ERASURE_CONTROL_ROOT`, never restored over). No backup run is needed to activate; restores later go through `shared-lifecycle-admin.ts restore-replay` (phase-2 local security closeout runbook). COMPANY / SOCIAL_GROUP retention stay unseeded (legal review / no rule) — irrelevant to Projects.

**PB-18.** The canonical OpenAPI `ApiError.code` enum has only generic codes (`CONFLICT`, …) and the filter copies `details` only for 400 `VALIDATION_ERROR`: runtime matches the contract; only the handoff prose lists reason codes. Frontend handling is correct for the contract (children pre-check; create 409 → key-taken; others generic conflict). Not a contract mismatch; a handoff-documentation inaccuracy.

**Workflow publication.** Server: `preservesExistingBindings: true`, tasks stay pinned on their version. Approved editor (D16 copy "move its N tasks to", required target select) assumes migration, and its `staying` lookup resolves draft statuses only. Live: publish is possible when no removed status holds tasks; otherwise Publish stays disabled / refused. Needs an owner copy decision (e.g. "N tasks stay on vX"); no code change made.

**Health — correction.** D9 (DECISIONS.md) makes the project status manual and rejects "computed health". The first pass had mapped the computed advisory `/health` into `ProjectSummary.health`; that mapping is **reverted** (health null, `/health` not read). The contract has no manual status field (metadata PATCH: key, color, summary, dates, statusNote only), so the status chip stays refused. Health reasons: no approved UI (D9) — not integrated.

**Scope / sprints.** Approved PJ-12 burn-up "scope vs done per week" now uses task `createdAt` (shared compute, mock unchanged without creation instants). Minimal remaining integration: `GET /projects/{id}/scope-history` removal tombstones would let earlier weeks count tasks deleted later (location: `api-project-work-insights.ts` reports.summary → `computeAnalytics` scope). Sprints: no Projects screen in SCREENS.md (sprints are Teams TM-05) → none.

**PB-13 / PB-14.** Unchanged: probability not shown (0–100 kept server-side, no bands invented); capacity Unknown, no weekly spread.

Checks (affected only): vitest completion / gap-closure / mock reports / analytics UI 4 files, 17 passed + new scope case (3/3 in mock reports); tsc 0; eslint touched 0; **`npm run build` pass** (125 pages).

## 11. Live verification (2026-11-17, Shared local test mode) — LIVE VERIFIED (except file content)

Backend `4ee0515`, `SHARED_LOCAL_DEVELOPMENT_TEST_MODE` on `mehran_dev` (ADR 0057), local API + worker started by Codex. Dedicated development account from `.env.live.local`; one sign-in per run. Every project created was archived through `settings.archive` (two left by an interrupted first run were archived by the next run). No production data.

**Result:** `src/data/api/api-projects-completion.live.test.ts` — case 1 (end-to-end) **PASS** in 1,499 s (paced); case 2 (file policy) **PASS**.

Verified live, step by step: create Blank / Kanban / Scrum (atomic, unique keys); duplicate key on create → `PROJECT_KEY_CONFLICT` → "key-taken"; access gate + capabilities; settings update (name, dates); settings key collision → "key-taken"; members list; invitation send → pending list → resend → revoke; phases with structure progress; task create; child task (`parentTaskId`); detail subtasks; subtask toggle → DONE; row subtask count (single task and list); delete of a parent with a live child refused; delete children before parent; reorder within a section (order read back); assign self (pending), accept, revert → pending, my assignments; workflow draft save → preview (removed counts `[0,0,0,0]`) → publish (tasks keep their version) → no open draft; draft save → discard; milestone create (raw) + rename + milestone rows; activity list; risk create (raw) → code (`R-1`) → comment add / list → convert to issue → close with reason → resolve issue → history; analytics summary; workload grid; project summary KPIs; file config + library list (metadata).

**Frontend defects found live and fixed** (focused suites re-run: repositories 25/25, create 6/6, settings UI 12/12, messages 7/7; tsc 0; eslint touched 0):
1. `projects.summary` (PJ-01 KPIs) sent the dashboard window with a local offset; the report window accepts UTC only (`z.iso.datetime()`) → 400. Now `…Z` (`api-project-members-repository.ts`).
2. `projectTasks.get` (single task) lost the row's subtask count (the filtered LIST page holds no children). Single-task loads now read the task's own `…/subtasks` (`api-project-tasks-repository.ts`).
3. `assignments.remind` also targeted the caller's own pending assignment; the server forbids self-reminders (403). Own assignments are skipped; nothing left → "invalid" without a request (`api-project-task-work-repository.ts`).

**Backend handoff changes applied:**
- PB-18: `error.details[{path:"", code}]` read via `conflictReason / onConflictReason` (`api-project-shared.ts`). `PROJECT_KEY_CONFLICT` → "key-taken" (create and settings metadata, not retried); `TASK_HAS_ACTIVE_CHILDREN` → "invalid has-children"; `WORKFLOW_PUBLICATION_CONFLICT` / `WORKFLOW_DRAFT_TERMINAL` and absent / unknown details → the generic conflict (refresh + retry). Create no longer maps every 409 to "key-taken".
- Workflow publish wording: seam flag `WorkflowDraftRepository.keepsTasksOnPublish` (live true; mock unchanged, it still migrates in its single-version model). Live editor: title "Publish v{n}", line "Publish a new workflow version. Existing tasks keep their current version and status.", removed statuses listed as "not in the new version; N tasks keep it on its current version"; no target select, Publish not blocked, no mapping sent (en / fa).

**Rate limit (backend, not changed):** every Shared request passes `CollaborationLimit` — 20 / actor and 30 / IP per clock minute, before business logic. The live test paces at 15 / minute and retries a 429 after the minute. The existing adapters read per task (association + assignments) and per summary (≈8 reads), so a real screen with more than a handful of tasks will exceed 20 requests / minute and show its error state in live mode. **Open blocker:** needs either a backend limit decision for Shared reads or a frontend batching pass (not done: no unrelated refactor in this run).

**File policy:** content operations are **POLICY-BLOCKED** in the local test mode: upload → 403 (`forbidden`), so download, new versions and restore were not exercised live; config and library list (metadata) pass. Not a Projects integration defect; backend security controls untouched.

**Shared activation:** active only through the temporary local development test mode (ADR 0057; no production security acceptance). Production activation remains owner-gated.

**Deferred / unchanged:** D9 (no manual status field; computed `/health` not shown), PB-13 (probability 0–100 not mapped to levels), PB-14 (capacity Unknown), guest grants (not implemented by the backend).

**Visual / browser review:** none performed (no browser used). The changed visible surfaces are the workflow publish box (live) and the Kanban / Scrum template options.

**Remaining blockers:** Shared request rate vs adapter read fan-out (above); file content (malware scanning); D9 manual status API + owner values; PB-13; PB-14; guest grants; second test account needed to verify reminders and recipient-side invitation accept / decline live.

**Concurrency / git:** other sessions are modifying Teams, Companies and Messaging files and may edit `docs/integration/*`; this pass changed Projects files only (plus `project-queries.ts`, `project-repositories.ts`, `projectSettings.json` en / fa — none modified by another session) and did not touch `docs/integration/*`. Nothing committed or pushed.
