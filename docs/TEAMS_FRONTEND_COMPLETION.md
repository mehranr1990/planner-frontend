# Teams frontend completion (P3 gap closure) — 2026-11-17

Status: **IMPLEMENTED; LIVE ACCEPTANCE PARTIAL** — of the 7 remaining operations 4 PASS (invitations + resend, RSVP Maybe / change, file limits, sprint burndown), 3 NOT VERIFIED (assignment Undo, Team↔Project links, Project calendar events: need a second account / an owned project), 0 FAIL; leftover team archived. See §7. Uncommitted by instruction.

Contract: `planner-backend/docs/api/openapi.json` at backend `bf4f20b` (1,193 ops, sha256 `c5442c60…08b56659`), handoff `docs/frontend-handoff/TEAMS_GAP_CLOSURE.md` (25 new ops). Backend read only, not modified.
Types: `src/api/generated/openapi-p6-teams.d.ts` regenerated with openapi-typescript 7.8.0 from a subset (previous path set + every `/api/v1/teams*` and `/api/v1/team-invitations*` path): 153 paths / 192 ops (was 130 paths). Raw JSON not committed.

## 1. Existing Teams features reused (unchanged)

Directory / access gate (`access/me` capabilities), create, settings / planning mode / lifecycle / handover / delete request, members (role, removal preview, remove), invitation send / revoke, recipient proof → accept / decline, tasks / board / assignments (accept, decline, remind), week plans / backlog / points, sprints (start, complete, reviews), goals, presence, check-ins, recognition / feedback, files (folders, versions, byte upload, download), calendar (meetings, invitations, time-off request / decide / cancel / history, event cancel), portfolio and direct unlink, analytics / capacity summary, activity. No page, hook, query or seam was duplicated; every change lives in the three existing live adapters (`src/data/api/api-team-*.ts`).

## 2. Newly connected live APIs

| Area | Seam method(s) | Backend operation | Notes |
|---|---|---|---|
| Pending invitations (TB-1) | `teamMembers.invitations` | `GET /teams/{id}/sent-invitations?state=PENDING` | Withheld `recipientEmail` → `""`; `sentAt` = in-app offer time |
| Resend (TB-1) | `teamMembers.resendInvite` | `POST /teams/{id}/invitations/{offerId}/resend` `{}` (If-Match + Idempotency-Key) | Identity kept; new `sentAt` from a fresh read (never the client clock); proofs never read |
| Weekly capacity (TB-2) | `teamCapacity.get / set`; row `can.editCapacity` = `work.manage` | `GET/PUT /teams/{id}/memberships/{accessId}/weekly-capacity` | `[sun…sat]` minutes; no template / all null → `hours: null` (UNKNOWN); weekly hours split evenly over chosen days, others 0 (nonworking); > 1440 min/day refused before a request; `effectiveFrom` = today |
| RSVP Maybe + change (TB-4) | `teamEvents.rsvp`, `can.rsvp` | existing `…/respond` with `MAYBE`; read `MAYBE` → "maybe" | Answer can be changed while the invitation is PENDING / ACCEPTED / DECLINED / MAYBE (server rechecks validity) |
| Sprint burndown (TB-5) | `teamSprints.current().sprint.burndown` | `GET /teams/{id}/plans/{planId}/burndown` | Points or hours from recorded observations; the line stops at the first day without evidence (no interpolation) |
| Sprint point capacity (TB-5) | `sprint.capacity`, `next.capacity` (points unit) | `GET /teams/{id}/plans/{planId}/point-capacity` | `capacityPoints` null → UNKNOWN; hours never converted to points |
| Link requests (TB-6) | `projectAssociations.requests / request / approve` | `GET project-association-requests`, `GET/POST …/association-request(s)` {LINK}, `POST …/association-request/decision` {APPROVE} | If-Match = association revision, key on request; names from the caller's own Projects directory, unreadable project → blank name; `requestedBy` not served → null |
| Project events layer (TB-7) | `teamCalendar.overlays` (`project-event`) | `GET /teams/{id}/calendar/sources?source=PROJECT` (end exclusive, `cursor`) | Active timed EVENT occurrences only (the overlay has no all-day form) |
| Revert accept (TB-8) | `teamTasks.revertAccept` | `POST /teams/{id}/assignments/{assignmentId}/revert` `{id}` (If-Match + key) | Only my ACCEPTED assignment; none → `conflict` without a request |
| Project read-through (TB-8 / T5) | `teamTasks.projectRefs` | `GET /teams/{id}/visible-tasks?source=PROJECT` | Read-only rows with source kept; canceled / deleted left out; due / estimate / assignees not served → null / empty; `hiddenWork` UNKNOWN is never read as "no work" |
| Files limits | `teamFiles.config`, upload checks | `GET /teams/{id}/files/config` | Server `maxBytes` / `allowedTypes` replace the hard-coded 100 MB / type list |
| Time-off history | history action `EDITED` | (new enum value) | Label "Edited" / «ویرایش شد» |

## 3. Previously mock-only / refused flows now connected

Pending invitations list, Resend, capacity editor (People › Edit capacity is now offered with `work.manage`), RSVP Maybe and changing an answer, points burndown and point capacity (were "—"), link request + approve, project events layer on the Team calendar, Undo of Accept (revert), project task read-through.

Small UI change (no redesign): the capacity form starts empty when the weekly capacity is UNKNOWN and refuses an empty hours field (`TeamCapacity.hours` is now `number | null`). `TeamLinkRequest.requestedBy` is nullable (not displayed anywhere).

## 4. Remaining backend contract gaps

1. **Link request project title / requester**: the association rows carry neither; names resolve only for projects the caller can open.
2. **Visible project tasks** carry no due date, estimate or assignees; no Team screen consumes `projectRefs` yet.
3. **Project event overlay** has no all-day form; all-day project events are not drawn.
4. **409 reason codes**: still collapsed to `CONFLICT` by the exception filter (as reported for Projects); conflicts show the generic text.

## 5. Policy-gated, deferred or not wired (no approved UI control)

- **TB-3 member transfer — DEFERRED by owner.** `teamMembers.move` stays refused, `can.move` false; the approved path is invite to the destination team, then a separate removal here. No atomic-transfer promise is shown.
- **Time-off edit** (`PATCH /time-off/{id}`): only the requester's PENDING request is editable and the time-off panel has no edit control; approved time off still says "cancel and ask again". Not wired (would be a new UI control).
- **Point capacity PUT**, **sprint history**, **sprint velocity**: the sprint screen has no capacity editor and computes velocity from reviews; not wired.
- **Availability, forecast, cross-team workload, recorded activity, calendar occupancy, RSVP summary, CANCEL_FUTURE**: no existing Team surface shows them; the existing analytics / capacity-summary / activity reads stay as they are. Event cancel remains non-recurring only.
- Task comments for Team tasks stay refused (not part of the approved Team contract).

## 6. Focused tests and build

- `tsc --noEmit`: 0 errors. ESLint on all touched Teams files: 0 problems.
- Vitest, Teams scope only (`src/data/api/api-team*`, `src/data/mock/mock-teams*`, `src/features/teams`): **21 files / 146 tests passed** (+ new: sent invitations / resend, weekly capacity, link requests, revert accept, project read-through, project events layer, files config, RSVP maybe, recorded burndown; stale "refused" assertions updated). Contract fakes are not live evidence.
- Contract match (script over every `api.request` in `api-team-*.ts`): 168 calls / 124 operations, **0 outside the contract**.
- `npm run build`: **pass** (125 static pages).
- Personal and Projects suites not re-run (instruction).

## 7. Real backend verification (final, 2026-11-17)

Local backend `http://127.0.0.1:3000` with Shared active (local test mode) and the dedicated test account from `.env.live.local`. Env-gated file `src/data/api/api-teams-completion.live.test.ts`. Backend read only, nothing changed.

**Rate limits (read-only inspection of the backend).**
- Every Team / Project / Company / Messaging route goes through `CollaborationLimit`: 30 requests a minute per IP and 20 a minute per actor. These are fixed clock-minute windows stored in `SharedRateLimit`, and reads count too.
- Better Auth allows 100 requests per 60 s overall, and sign-in 3 per 10 s.
- A 429 answers `RATE_LIMITED` with `Retry-After: 60`.

**How the live file paces itself.**
- It serializes every API call and aligns to clock minutes, at 6–9 calls a minute (`LIVE_PER_MINUTE`).
- On a 429 it waits for `Retry-After` and retries once. The limit is checked before business validation, so the refused call had no effect.
- `LIVE_ONLY` runs only the named steps, so steps that already passed were not run again.
- `LIVE_DEBUG` logs the method, path and status of refused calls only. `LIVE_REPORT` writes the result table to a file.
- Limits were neither disabled nor raised.
- Even at 6–9 a minute the backend still answered occasional 429s. Either the same budget is being used elsewhere, or one request is counted more than once. The retry absorbed most of these.

| Operation | Result | Evidence / reason |
|---|---|---|
| Sign-in, team list / create / archive, members, `access/me` | **PASS** | Real calls in every run |
| Weekly capacity GET / PUT | **PASS** | Unknown on a new member → saved 30 h over Sat–Wed → read back (earlier run) |
| Visible project tasks (`visible-tasks?source=PROJECT`) | **PASS** | 200, `[]` |
| File limits (`files/config`) | **PASS** | `maxBytes` 10,485,760. No file bytes were uploaded (blocked in local Shared test mode). |
| Sent invitations + Resend | **PASS** | Invite → PENDING row in `sent-invitations` → resend kept the id and returned a newer `sentAt` (15:56:01.840Z → 15:56:02.054Z) → revoked |
| RSVP Maybe / change | **PASS** | Meeting created; organiser invitation added through the API; `MAYBE`, then changed to `ACCEPTED` on the same invitation; meeting canceled |
| Sprint burndown + point capacity | **PASS** | Planning mode set to Sprints → sprint started → `current()` read `burndown` (1 recorded day, hours unit) and capacity (0 h net) |
| Archive the leftover team `7f2350d7…` | **PASS** | Archived through `teamSettings.archive` (lifecycle archived). Every live-check team created later (`28b585ab`, `98ea2519`, `7b8be36b`, `fec58b50`, `cb210eab`) was also archived. `f42f17eb`'s archive answered 409 earlier (most likely already archived). |
| Assignment Undo (revert accept) | **NOT VERIFIED** | Assigning yourself is accepted straight away, so no PENDING offer exists to accept and withdraw. Needs a PENDING offer from a second member account. |
| Team↔Project link request / pending / approve | **NOT VERIFIED** | Two earlier runs that used the full Projects directory failed: one on a 404 (the call after a 429 retry, not logged), one on a 429. The final runs used one list call plus `access/me` per project: `access/me` shows the account is Owner / Admin of **none** of its active projects. The directory had shown `7d0dee70…` as "owner" (probably a project that isn't ACTIVE). Needs a project the account owns or administers. |
| Project calendar events layer (`calendar/sources`) | **NOT VERIFIED** | Depends on a linked project (above) |

No frontend integration defect was confirmed live, so no adapter code changed in this pass. Contract-fake tests still cover the three NOT VERIFIED operations (146 Teams tests passing).

**What would close the gap:** a second verified test account (for the PENDING assignment offer) and one ACTIVE project that the test account owns or administers. Then run:
`LIVE_ONLY="undo,link,calendar,archive" LIVE_PER_MINUTE=6 npx vitest run src/data/api/api-teams-completion.live.test.ts`

## 8. Visual / browser verification

Not run (no browser / E2E by instruction). The UI changes are limited to the capacity form's empty state and the new "Edited" history label.

## 9. Git status

Nothing committed or pushed. Teams changes: the three Team adapters (unchanged in the live pass) + their tests, `team-domain.ts`, `member-dialogs.tsx`, `teamCal.json` (en / fa), regenerated `openapi-p6-teams.d.ts`, new live test and this file. All uncommitted Projects changes (adapters, tests, `openapi-p6-projects.d.ts`, `project-domain.ts`, new-project sheet, `projects.json`, `docs/PROJECTS_FRONTEND_COMPLETION.md`, untracked `docs/Backend-Handoff/openapi.json`) are untouched.
