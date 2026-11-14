# Backend requirements — Teams, Companies, Messages & Meetings

## Phase 1–5 final status (2026-11-14, 1,045-op contract sha256 `e05f9777…c9a049`, backend `ab37a2c`)

Resolved by the backend and now connected in the frontend (see `API_COVERAGE_MATRIX.md` → "Consolidated coverage"): OD-1 (retention catalog → team / conversation create), OD-2 (company goals), OD-3 (rooms, booking titles, utilization), OD-4 (recipient in-app proof: Teams, Projects, Companies), OD-5 (unit move preview / execute), OD-6 (knowledge pages), OD-7 (payment runs), OD-8 (sealed employee files), OD-9/F1 (fixed currency, legal name, fiscal month), OD-10 (conversation settings / reports), OD-11 (global text search), OD-12 (busy-only blocks), OD-13 (announcement remind), M-X6/M-X7 (minutes proposer / assignee / due), B3 (Brain Dump), B4 (insight patterns incl. Estimates), Team TA/CA/GL/SP/T2/RM/MB/PH/AN/FL, rejection reasons (ER/AT), versioned budget changes (BU).

Remaining requirements — no backend change requested by this batch; each is an environment step, an owner decision or frontend mapping work:

1. **Environment / operator (before Live Test):** deploy migrations 046–054 as one controlled step; operator approves the retention catalog for the target environment (dev seed: `mp-rpc-v1.0-work` PROJECT+TEAM, `-conversation`, `-meeting`); Docker build / start checks; Shared activation stays off until then. Test credentials `API_LIVE_ORIGIN`, `API_LIVE_TRUSTED_ORIGIN`, `API_LIVE_EMAIL`, `API_LIVE_PASSWORD` (local `.env.live.local` exists from 2026-11-12) and CORS for the frontend origin.
2. **Legal / owner:** COMPANY retention policy (finance 7 y proposed, sealed files) — until approved, Company create stays refused and settings show no retention years; SOCIAL_GROUP rule.
3. **Design decisions:** a task-category control in P05/P06 (backend `Task.category` is ready); a policy picker if several catalog policies ever apply to one context; organizer UI for busy visibility; reminder inbox surfaces (Company notifications, announcement reminders).
4. **Contract shape (frontend cannot fill):** project create: key + dates now persist via the metadata step (S2) — still missing: built-in / account-level templates (server templates are per project), team-owned create, an atomic create-with-metadata (partial outcome possible), key availability / uniqueness rule; project invitations: per-project pending list, resend / reissue rule, decline note, guest (task-grant) invitations; project files: folders, versions, uploader, size-limit read; task: delete, manual order, shared subtasks, activity with field / old / new values; phases: dates / progress; milestones: server status, open-task count; team project read-through (T5); team task comments (not approved); revert of an accepted assignment; goal ⇄ task link reads; per-day vs weekly capacity template; decline notes on invitations; recipient invitation previews intentionally carry no name / inviter / role.
5. **Frontend mapping not done in this batch (ops exist):** Teams — none left (TM-03 / TM-05 / TM-06 connected in Session 3, 2026-11-14); Company expenses screen, staff directory, overview KPIs (incl. KPI `goals`), resource requests / types / workflows, attach flows, notifications, employee document upload, KB page creation.

Gap analysis 2026-11-13. Contract: `planner-backend/docs/api/openapi.json`, 849 ops, sha256 `ea8c49ef…463f` (unchanged since Stage 1c). Read-only analysis: no application code, tests or adapters changed.
Frontend seams compared: `src/data/team-repositories.ts` (from the matrix, not re-checked), `src/data/company-repositories.ts` (84 methods), `src/data/messaging-repositories.ts` (64 methods + `subscribe`).
Projects gaps (R1, R3, R4, R6–R12) stay in `API_COVERAGE_MATRIX.md` and are not repeated.

Legend: **USE** = existing ops cover it (adapter work only) · **FA** = frontend adaptation, no backend change · **BE** = genuine backend blocker · **OD** = owner decision (drop/simplify UI vs. request backend).

## Teams — Session 3 confirmed contract gaps (2026-11-14, 1,045 ops; frontend cannot fill)

Re-verified 2026-11-14 (S3b) against the same 1,045-op contract (sha256 `e05f9777…`): all eight still apply. Time-off decide / cancel / history and event cancel are no longer gaps (connected in S3b).

| Gap | UI action affected | Missing operation / field | Blocks a core workflow? | Safe to defer? |
|---|---|---|---|---|
| TB-1 | TM-08 pending invitations list, Resend | recipient email + sent time on `GET /teams/{id}/invitations` rows (rows have id, kind, memberRole, state, expiresAt only); a resend op | No (send, revoke, accept / decline work) | Yes — list shows generic rows; resend = revoke + invite again |
| TB-2 | TM-08 capacity editor | weekly capacity template (hours + working days); `/capacity` is dated minutes per day only | No (capacity summary is read) | Yes — editor stays unavailable |
| TB-3 | TM-08 Move member | cross-team move operation | No (remove + invite) | Yes |
| TB-4 | TM-03 RSVP Maybe | tentative state on `meetings/{id}/invitations/{id}/respond` (ACCEPTED / DECLINED, once) | No | Yes — Maybe refused with reason |
| TB-5 | TM-05 points burndown / capacity in points | daily remaining points, points capacity | No (hours shown) | Yes — shown as "—" |
| TB-6 | TM-06 Link request, team-owned projects | link request + project-owner approval record; project create with `ownerTeamId` | No (direct link PUT works) | Yes |
| TB-7 | TM-03 Project events layer | team-scoped read of linked projects events | No (layer empty) | Yes |
| TB-8 | TM-02 Revert accept; T5 project read-through | revert-accept op; read of members project tasks | No | Yes |

## 0. Stabilization status (864-op contract sha256 `022c3121…cdabf`, integrated 2026-11-13)

IMPLEMENTED ≠ LIVE VERIFIED (contract-fake tests only). BE = needs a backend change · FE = frontend-only limitation.

| ID | Status | Detail |
|---|---|---|
| M-X4 | **RESOLVED** | work meetings: `participantActorIds` from Project / Team / Company root rosters (`api-meeting-sources.ts`); no account ids read or inferred. FE: `{id, actorId}` invitations to an existing meeting have no UI surface (MT-02 has no add-invitee) |
| M-X5 | **RESOLVED** | `meeting.create` on root `access/me` drives the New meeting source picker (no role inference; re-read per sheet open) |
| M-A1 | **PARTLY RESOLVED** | read + acknowledge live (`authorDisplayName`, null → no author; manager-only ack totals). BE: audience, scheduling, pin end, pending names, reminders (OD-13) → composer refused |
| T-M2 | **PARTLY RESOLVED** | current transfer (PENDING list item) + cancel (revoke). BE: Team settings read model (undefined Team policies) |
| T-M3 | **RESOLVED (FE, S3 2026-11-14)** | portfolio = active links ∩ Projects access gate; people overlap from `project-summaries.commonMembers`; health Unknown (owner decision 1) |
| C-M4 candidates | open (FE + BE) | candidates readable from `/projects`, `/teams`; the attach flow's request record, association names / counts are still BE (ADR 0039 allow-list undefined) → attach stays off |
| M-X6 / M-X7 | BE | awaiting reviewed database-link (attribution FK) approval |
| T-M1 | BE | Team work model (assignment / status / planning) |
| T-M4 | BE | undefined Team policies / modules |
| C-M1 | BE + OD-9 | company currency |
| C-M2 / C-M3 | OD / BE | policy UI decision; staff profile fields / KPI definitions |
| OD-15…OD-18 | **APPROVED, APPLIED** | reduced invitation rows · agenda proposals · one reviewer + reason · explicit Save |
| OD-1, OD-4, OD-9, others | open | personal meetings / DMs / Team + Company create (OD-1), invitation proof (OD-4), currency (OD-9) |

## 1. Cross-cutting requirements (requested once, apply to every area)

| ID | Requirement | Blocks | Closes |
|---|---|---|---|
| **X1** | Caller's own admission per scope: `GET …/access/me` (`accessId`, `role`, `capabilities`) for Team, Company context (`/companies/{id}/contexts/{scopeId}`) and Conversation — or `isCurrentUser` on member rows. Meetings already return `role` → not needed there. |
| X1-M (found 2026-11-13) | Meetings return the caller's `role` but no own member id / `isCurrentUser`, so my RSVP / minute-taker row cannot be identified | MT-01…MT-03 | **RESOLVED** in the 863-op contract (`GET /meetings/{id}/access/me`), integrated 2026-11-13; remaining meeting gaps → matrix "Remaining blockers" | Teams access gate, Company access gate + role-gated UI, Conversation owner/admin actions, Announcement publish rights | T1 + new C-X1 + M-X1 |
| **X2** | Display identity (`displayName`, optional avatar) for every actor reference: Team `/memberships`, Company `/contexts/{scopeId}/members`, `staff-profiles.member`, `audit.actorId`, approvals `requester/beneficiary`, `employee-cases.author/subject`, Conversation `/members`, Meeting `/members`, `inviterActorId`. Preferred: embed `displayName` as `/projects/{id}/members` already does (one pattern, no new endpoint). | every people list, author line, approver, audit row, chat bubble | T2 + new C-X2 + M-X2 |
| **X3** | People lookup for invite / new conversation: `POST /conversations/{id}/invitations` takes `userId`, but no op resolves an email/handle to a `userId`. Needs a scoped lookup (e.g. by exact email, privacy-safe). | MS-90 new conversation, MS-08 add people, MT-02 invite | new |
| **X4** | Invitee-side invitation lists: Company invitations have only `preview` (token) + accept/decline; no "my pending company invitations" and no inviter-side pending list. Same rule as Projects R4 / Teams invitations. Invitation proof is returned to the inviter → delivery path must be decided (OD-4). | CO-90 invite, CO-03 pending invites, switcher invitations | extends R4 |

## 2. Existing Teams gaps (copied from `API_COVERAGE_MATRIX.md` → "Teams", not re-checked)

| Seam | Status | Reason |
|---|---|---|
| `teamSettings.archive`, `teamSettings.remove` | IMPL | archive (If-Match), delete request with password |
| `teams` (directory, access gate, members, portfolio, create, restore) | BLOCKED T1 + T2 | caller admission; names; create needs operator `retentionPolicyVersion` |
| `teamMembers`, `teamTasks`, `teamCalendar`, `teamEvents`, `teamPlans`, `teamSprints`, `teamGoals` | BLOCKED T1 + T2 | ops exist but rows carry people, actions role-gated; plan/sprint/goal models differ |
| `teamCapacity` | BLOCKED T2 + model | per-day minutes vs weekly hours |
| `teamReports` | BLOCKED T1 + model | dashboard counts only, no series |
| `teamSettings` (get/update/planning mode/transfer) | BLOCKED T1 + T2 | no settings read model; successors need names |
| `projectAssociations` | BLOCKED T1 + model | direct link, no request/approval flow |
| `teamInvitations` | BLOCKED R4 | no invitee list; one-time proof (ADR 0027) |
| `teamRecognition`, `teamFeedback` | BLOCKED model | `/cases` + `/disclosures` ≠ thanks feed / feedback inbox |
| `presence`, `teamActivity`, `teamCheckins`, `teamFiles`, `teamBacklog` | NOT IN API | no operations |

T1 = X1, T2 = X2 (section 1).

## 3. Companies (CS-01, CO-00 … CO-14, CO-90) — 152 ops (`/companies` 149, `/company-invitations` 3)

Note: `company-provider.tsx` serves the **mock in live mode** too — violates D7 (no mock substitution in live). FA: add a live adapter that refuses unsupported methods (like Teams).

| Screen / seam | Usable ops | Status | Gap |
|---|---|---|---|
| CO-00 `list`, `create`, `restore`, `archive`, `remove` | `GET/POST /companies`, `/{id}/archive · restore · delete`, `/{id}/status` | USE (create: OD-1) | create needs operator `retentionPolicyVersion` (same as Projects/Teams) |
| CS-01 `access` (role, department scope) | `GET /companies/{id}`, `/departments` (each has `scopeId`) | **BE X1** | no caller role/capabilities |
| CO-01 `overview` | `/contexts/{scopeId}/reports/operations · finance · portfolio` | USE + X1 | role-dependent cards need X1 |
| CO-02 `departments`, `create/updateDepartment` | `/departments`, `/departments/{id}/units`, `/units/{id}` (PATCH title/description) | USE | `managerId` not in model → FA (show via staff `supervisor` or hide) |
| CO-02 `previewMove`, `moveDepartment` | — | OD-5 | fixed 2-level department → unit tree, no reparent op |
| CO-02 `effectivePolicies`, `overridePolicy`; CO-14 `setPolicyLevel` | `GET/PUT /contexts/{scopeId}/policy` (rules: key, mode, roles, overrideDefault; chain) | USE + FA | no `reason` field on override → FA (drop reason or audit-only) |
| CO-03 `staff`, `updateWorkProfile` | `staff-profiles` (+ `work-contact`), `availability` | USE + **BE X2** | names; `location`/`phone` not in profile → FA (hide) |
| CO-03 `pendingInvites`, CO-90 `invite`, `invitations/accept/decline` | `/contexts/{scopeId}/invitations` (returns `proof`), `/company-invitations/{id}/accept · decline` | **BE X4** + OD-4 | no lists; invite takes `memberRole, recipient` (no position/supervisor → set later via staff-profile, FA) |
| CO-04 `projects`, `teams`, `attachRequests`, `requestAttach`, `accept/decline/cancelAttach` | `associations`, `attachments`, `associations/{kind}/{target}/accept · attachment-requests · …/accept · revoke · detach` | USE + X2 | per-project consent shape to verify at adapter time |
| CO-04 `attachCandidates` | `GET /projects`, `GET /teams` (caller's own) | FA | derive client-side |
| CO-05 `goals`, `createGoal`, `updateKeyResult` | — | **OD-2** | no company goals/OKR ops at all |
| CO-06 `resources`, `addResource` | `resources` (+ retire) | USE + FA | no `type`/`tag`/department on resource → FA convention or hide |
| CO-06 `resourceRequests`, `requestResource`, `withdrawResourceRequest` | `resources/{id}/allocations`, `allocations/{id}/cancel · return` | FA | API allocates directly (no request/approval step) |
| CO-06 `rooms`, `bookRoom` | allocations on a resource | OD-3 | no room type / day schedule read → treat rooms as resources or drop the tab |
| CO-06 `capacity` (heat) | `availability`, `reports/operations` (aggregate) | OD-3 | no per-person/per-day heat series |
| CO-07 `kbFolders`, `kbPages`, `kbPage`, `kbSearch` | `knowledge/folders`, `knowledge/documents?search&folderId`, `/versions` | USE | — |
| CO-07 `kbSave`, `kbCreate`, `kbVersionBody`, `kbRestore` | documents + file versions (upload, complete, publish, download) | **OD-6** | KB is **file-versioned**, UI is rich-text body; restore = republish an old version |
| CO-07 `kbAck`, `kbRemind` | — | OD-6 | no read-acknowledgement for KB (announcements have it) |
| CO-08 `expenses`, `saveExpense`, `withdrawExpense` | `expenses` (+ submit, cancel, corrections, reversals, receipts) | USE | — |
| CO-09 `approvals`, `approvalHistory`, `decide`, `chains`, `saveChainDraft`, `publishChain` | `finance/approvals` (+ history, decision, escalate, restart), `approval-workflows` + versions + publish | USE + X2 | requester/approver names |
| CO-10 `budgets`, `requestBudgetChange` | `finance/budgets` (+ adjustments, commitments) | USE + FA | adjustment is direct, not a request |
| CO-11 `reimbursements`, `markNotReceived` | `reimbursements` (+ close, history, balances), `payment-acknowledgements` (+ decision, corrections) | USE | — |
| CO-11 `paymentRuns`, `createRun`, `confirmRun` | per-reimbursement acknowledgements only | OD-7 | no batch payment run |
| CO-11 `markRecordedInPersonal` | Personal `/finance` transactions | FA | client-side Personal write; no server flag → idempotency via local memory only |
| CO-12 corrective actions (`open/respond/appeal/closeCorrective`) | `employee-cases` (+ entries, erase) | USE + X2 | — |
| CO-12 `employeeFile`, `requestFileAccess`, `addDocument`, `downloadPack` | — | OD-8 | no sealed employee file / access-grant / pack ops |
| CO-13 `reports`, `audit` | `reports/*`, `audit` | USE + X2 | audit actor names |
| CO-13 `exports`, `requestExport` | `POST /contexts/{scopeId}/exports` (response untyped `object`) | **BE** | no export list/status read; response schema undefined |
| CO-14 `settings`, `updateGeneral` | `GET/PATCH /companies/{id}` (title, description) | FA + OD-9 | `legalName`, `currency`, `fiscalStartMonth` not in API |
| CO-14 `setGrant` | — | OD-9 | no time-boxed grants |
| CO-14 `requestTransfer` | `ownership-handovers` (+ accept/decline/revoke) | USE + X2 | successor by `accessId` (needs names); no password in body → FA |

Company rows (31, covering 84 methods): USE / FA 17 · backend-blocked 4 (X1, X2, X4, exports read) · owner decision 10. Most USE rows still show "Unknown" people until X2.

## 4. Messages & Meetings (MS-01 … MS-09, MS-90, MT-01 … MT-04) — 114 ops

`/conversations` 48, `/conversation-invitations` 3, `/messaging*` 8, `/meetings` 38, `/announcements` 17. `messaging-provider.tsx` already returns `available: false` in live mode (correct, keep until adapters exist).

| Screen / seam | Usable ops | Status | Gap |
|---|---|---|---|
| MS-02 `conversations.list` | `GET /conversations` (id, kind, sourceId, title, writable) | **BE M1** | no `lastMessage`, `unreadCount`, `muted`, `updatedAt` per row → list cannot render/sort without N+1 (`progress` + `timeline` per row) |
| MS-02 `get`, `participants` | `GET /conversations/{id}`, `/members` | USE + X1 + X2 | caller role, names |
| MS-90 `create`, `lookup`; MS-08 `addPeople` | `POST /conversations` (participants), `/invitations` (`userId`) | **BE X3** | no person lookup |
| MS-02 `markRead`, `unreadCount` | `POST /acknowledgements`, `GET /progress`, `/messaging-notifications` | USE + FA | global unread = sum client-side, or notifications count |
| MS-08 `mute` | `PATCH /conversations/{id}/notification-settings` (mode) | USE | — |
| MS-08 `leave`, `removePerson` | `/leave`, `/members/{id}/remove` | USE | — |
| MS-08 `rename` | — | **BE M2** | no `PATCH /conversations/{id}` (title) |
| MS-08 `updateSettings` (`linkPreviews`, `newcomerHistory`, `collapseBlocked`), `updatePolicy` | `GET /message-policy`, `advanced-actions` (`authorDelete`), `receipt-settings` | FA + OD-10 | only author-delete policy exists; linkPreviews / newcomerHistory / membersCanPin / collapseBlocked not in API |
| MS-08 `report` (conversation) | `advanced-actions` report (message-level) | OD-10 | no conversation-level report |
| MS-01 `workspaceMentions` | `/conversations/{id}/mentions` | FA | aggregate per workspace client-side (N calls) |
| MS-02/04/06 `page`, `thread`, `send`, `edit`, `deleteForEveryone/ForMe`, `moderate`, `react`, `pin`, `pinned`, `forward`, `report` | `timeline`, `threads/{id}`, `pins`, `advanced-actions` (11 variants: send+reply+mentions, forward, edit, delete ×2, react, pin, report, moderate, policy), `message-details`, `revisions` | USE + X2 | author = `memberId` → needs member names |
| MS-04 `forwardTargets` | `GET /conversations` | FA | — |
| MS-02 `media`, MS-05 `upload` | `attachments` (+ complete/cancel), `media-messages`, `media-timeline`, `media-forwards`, download | USE + FA | client computes sha256, upload to signed URL; voice = audio attachment |
| MS-07 `search` (global, with filters) | `GET /conversations/{id}/message-search?q`, `media-search` | **OD-11** | search is per conversation only |
| `subscribe` (live events) | `message-changes`, `media-changes` (`changeCursor`) | FA | polling; no push/stream (presence/typing not in API → hide) |
| MS-03 `channels.list`, `create`, `workspace` | `GET /conversations` (filter by `kind`/`sourceId` client-side), `POST /conversations` (kind + sourceId) | USE + FA + X1 | no `sourceId` filter param; `canCreate`/defaults need X1 |
| MS-09 `settings.get/set` | `/messaging-notifications/settings` (enabled, web push), per-conversation notification/receipt settings | USE + FA | UI global fields beyond these → hide |
| MS-09 `blocked`, `block`, `unblock` | `/messaging/blocks` (by direct `conversationId`), `/conversations/{id}/contact-block` | USE + FA + X2 | block = direct conversation; names via X2 |
| MT-01 `meetings.list` (tabs) | `GET /meetings`, `/meetings/invitations` | USE + FA | tab filter client-side (no time/state filter) |
| MT-02 `get`, `create`, `update` | `GET/POST/PATCH /meetings` (`event.schedule`, `externalUrl`) | USE | create (personal kind) needs `retentionPolicyVersion` (OD-1) |
| MT-02 `rsvp` | `POST /meetings/invitations/{id}/respond`, members `rsvp` | USE + FA | RSVP only while an invitation is open; changing a later RSVP → verify |
| MT-02 `addAgenda`, `toggleAgenda` | `GET/POST/PATCH /agenda` (text, state) | USE + FA | no `minutes` per item → hide duration |
| MT-02 `saveNotes`, `attach` | `versions` (draft minutes), `attachments` (+ share) | USE | — |
| MT-02 `invitable`, `sources` | Team/Project/Company member lists | FA + X2 | derive from workspace rosters |
| MT-01/calendars `forCalendar` (busy-only) | `GET /meetings` (all pages), calendar events | FA + OD-12 | no range query; busy-only view for non-invitees not in API |
| MT-03 `minutes.get/save/submit/approve/requestChanges/finalize` | `versions` (+ reviewer, submit, review, finalize, withdraw) | USE | single reviewer (`reviewerMemberId`) vs UI `reviewerIds[]` → FA (one reviewer) |
| MT-03 `linkTask` | `actions/{id}/tasks`, `actions/{id}/release` | USE | — |
| MT-04 `announcements.list`, `publish`, `ack` | `GET /announcements/scopes/{kind}/{scopeId}`, `POST /announcements` + `/versions` + `/publish`, `/acknowledge`, `/acknowledgements` | USE + X1 | publish = 3 calls; rights need X1 |
| MT-04 `remind` | — | OD-13 | no reminder op |

Messaging rows (29, covering 64 methods + subscribe): USE / FA 21 · backend-blocked 3 (M1, M2, X3) · owner decision 5. Most USE rows still need X2 for author / member names.

## 5. Genuine backend blockers (minimum request set)

| # | Request | Priority | Unblocks |
|---|---|---|---|
| 1 | **X2** `displayName` on all member / actor projections | Critical | Teams, Companies, Messaging, Meetings (every people surface) |
| 2 | **X1** caller access/me per Team, Company context, Conversation | Critical | access gates, role-gated actions |
| 3 | **M1** conversation list summary (`lastMessage`, `unreadCount`, `muted`, `lastActivityAt`) on `GET /conversations` | Critical for MS-02 | conversation list |
| 4 | **X3** scoped person lookup → `userId` | High | new conversation, invites |
| 5 | **X4** pending invitation lists (invitee + inviter) for Company / Team / Conversation | High | invite flows (with OD-4) |
| 6 | **M2** `PATCH /conversations/{id}` title (If-Match) | Medium | rename group/channel |
| 7 | Company exports: typed response + `GET …/exports` list/status | Medium | CO-13 exports |

Everything else is FA (no backend change) or an owner decision below. No other endpoints requested.

## 6. Unresolved owner decisions

| ID | Decision | Recommendation |
|---|---|---|
| OD-1 | Operator `retentionPolicyVersion` source for create (Company, personal meeting/conversation) | one operator config value exposed to the client |
| OD-2 | CO-05 Company goals: drop/hide or request a goals module | hide in live until Phase 4 goals exist |
| OD-3 | CO-06 rooms + capacity heat | rooms = resources (no day grid); hide heat |
| OD-4 | Invitation proof delivery (inviter receives `proof`) | same answer as Projects R4 |
| OD-5 | Department move (reparent) | drop move UI |
| OD-6 | Knowledge base: file-versioned docs vs rich-text pages; ack/remind | adopt file model (upload/download, publish = restore); drop ack/remind |
| OD-7 | Payment runs | per-reimbursement acknowledgement only |
| OD-8 | Sealed employee file / access grant / download pack | keep corrective actions (cases); hide file tab |
| OD-9 | Company settings fields (legalName, currency, fiscal month) + grants | hide until backend adds them |
| OD-10 | Channel settings beyond author-delete; conversation-level report | hide extra toggles; report via a message |
| OD-11 | Global message search | scope MS-07 to one conversation |
| OD-12 | Busy-only meetings in source calendars | hide for non-invitees |
| OD-13 | Announcement remind | drop |
| OD-14 | Phase 2+ activation: Companies/Messaging are out of the authorized scope (`CLAUDE.md`) — integration starts only when the owner authorizes and Shared activation (B2) is on | — |

## 7. Recommended Codex implementation batches (frontend, after OD-14)

Each batch: generated type subset → adapter + contract-fake tests → `provider.tsx` live wiring → docs. Refuse unsupported methods with `RepositoryError("unsupported")`; no mock in live.

1. **C-A** Types `openapi-p6-companies.d.ts` (`/companies`, `/company-invitations`) + live refusal adapter replacing mock-in-live (fixes the D7 violation). No backend needed.
2. **C-B** Directory + lifecycle + departments/units + policy + reports/audit (USE rows; names stubbed "Unknown" until X2).
3. **C-C** Finance: expenses, approvals + workflows, budgets, reimbursements + acknowledgements.
4. **C-D** Knowledge (after OD-6), resources/allocations, associations/attach, employee cases.
5. **M-A** Types `openapi-p6-messaging.d.ts` (`/conversations`, `/conversation-invitations`, `/messaging*`, `/meetings`, `/announcements`); timeline/thread/advanced-actions/attachments adapters; polling `subscribe`.
6. **M-B** Meetings: list, detail, agenda, minutes versions, action → task.
7. **M-C** Announcements + messaging settings/blocks.
8. **Backend (Codex backend batch, separate owner):** X2 → X1 → M1 → X3 → X4 → M2 → exports read. After X1/X2 land, revisit Teams (T1/T2) and the blocked rows above.

## Companies — Session 4 confirmed contract gaps (2026-11-14, backend `ab37a2c`, 1,045 ops)

Checked against the canonical OpenAPI; only interactions of the existing Company UI are listed. Everything else on the Company screens is mapped (see `API_COVERAGE_MATRIX.md` → "Company · S4").

| # | Screen · interaction | Missing capability | Narrow backend change |
|---|---|---|---|
| CB-1 | CO-14 approval chains editor | workflow versions bind each step to one person (`primary` / `alternate` access); the screen edits role approvers, amount conditions and escalation days | role-based step approvers (+ optional amount threshold / escalation) or owner accepts a person-based editor (FA) |
| CB-2 | CO-02 / CO-14 policies (effective value, override, level) | `contexts/{s}/policy` returns capability rules (key, mode, roles); no named values, inheritance level or override reason | named policy values with level + override, or owner decision to show capability rules |
| CB-3 | CO-03 pending invitations | **partly closed 2026-11-14**: list connected (role, context); rows still carry no recipient email | `recipientEmail: string \| null` (inviter / admins only) on `GET contexts/{s}/invitations` items |
| CB-4 | CO-06 add resource | resources have no asset tag (required by the dialog); `description` is free text, so the tag is not stored there; Add resource stays hidden in live (`manageResources` false), nothing is discarded | `assetTag: string` (unique per company) on `POST/PATCH contexts/{s}/resources` and the resource read |
| CB-5 | CO-13 open corrective action | **CLOSED 2026-11-14** (frontend): reviewer picker added (Owner / Org Admin other than author and employee) | — |
| CB-6 | CO-11 Mine: "not received" note, "recorded in Personal" | `payment-acknowledgements/{t}/decision` takes only `ACKNOWLEDGE \| DISPUTE` (no note); no Personal-recorded marker. Both stay refused (the note is never dropped) | `note: string` (required for DISPUTE) on the decision body + read; `recordedInPersonalAt: string \| null` on the beneficiary's reimbursement read with `POST reimbursements/{t}/personal-record` (idempotent) |
| CB-7 | CO-01 / CO-04 unserved figures | project health split + quarter history, teams that sent a plan, joiners / leave, goals on pace, capacity watch, project milestone / spend, team plan completion, pending budget change totals | aggregate fields on `reports/kpis` / `association-summaries` (all optional; screens show "—" until served) |
| CB-8 | CO-14 lifecycle: ownership transfer | no list of pending handovers (pending survives only in the session); handover takes no password → live hides the password field (`transferReauth` false, 2026-11-14) | `GET companies/{id}/ownership-handovers?state=PENDING` (owner + successor); optional step-up (recent-auth) requirement on `POST ownership-handovers` if the owner wants re-authentication |

Environment (C): company create needs an approved COMPANY retention policy in the operator catalog (OD-1) — the create sheet stays refused with that reason. Live run also needs migrations 046–054, CORS for the frontend origin, credentials and Shared activation.
Closed 2026-11-14 (A): company notifications (bell) and employee department transfer (People) are connected. Still outside the approved UI (D): resource types / workflows admin. CB-1 / CB-2 / CB-7 unchanged (model gaps; screens keep their honest unavailable states).


## Messages & Meetings — Session 5 confirmed contract gaps (2026-11-14, backend `ab37a2c`, 1,045 ops)

Checked against the canonical OpenAPI and the backend services (read only); only interactions of the existing Messages / Meetings / Announcements UI are listed. Everything else is mapped (see `API_COVERAGE_MATRIX.md` → "Messages & Meetings · S5").

| # | Screen · interaction | Missing capability | Narrow backend change |
|---|---|---|---|
| MB-1 | MS-06 New channel (members / all members), channel info Add people | `POST /conversations` channel `participants` and `POST /conversations/{id}/invitations` take **account (user) ids**; every workspace roster (`/projects/{id}/members`, `/teams/{id}/memberships`, Company context members) serves only space-local actor ids | accept source-roster `actorId`s (as `participantActorIds` on work meetings), or an "all source members" flag; plus Project root access/me `conversation.create` hint (Teams / Companies already serve it) |
| MB-2 | MT-04 composer: schedule later, pin for N days, audience subsets | publish is immediate; pin is a flag with no end; NAMED audience takes access ids but no subsets (department / team / office) are served | optional `publishAt`, `pinnedUntil`; a subsets read for NAMED audiences. Also: Team / Company `announcement.publish` hint does not include the `work.manage` part of the server's source-manager check (may over-report; the server 403 is shown) |
| MB-3 | MS-09 global messaging settings | only `/messaging-notifications/settings` {enabled} and per-conversation `receipt-settings`; no global receipts default, last seen, online, typing, who can DM, quiet hours, link-preview default | an account-level messaging privacy settings resource, or an owner decision to reduce MS-09 to the served fields |
| MB-4 | MT-02 Personal meeting invitees | INDEPENDENT `participants` are account ids; no directory serves them (exact-email discovery exists, but the sheet has no email field) | accept contact / conversation actor ids, or an owner decision to add an email field to the Personal invitee picker |

Still open from before: OD-16 agenda duration / done / shared notes (proposals used instead).
Environment (C): Personal meetings and DM / group create need the approved MEETING / CONVERSATION policies loaded in the operator catalog (OD-1); without them create fails with that reason and nothing is written. Live run needs migrations 046–054, CORS, credentials, Shared activation.
Outside the approved UI (D): meeting file share / cancel, meeting leave / member remove / invite more, invitation revoke (sender), report resolve, per-conversation receipt sharing toggle, busy-visibility toggle, announcement withdraw / pin toggle, recovery / lifecycle jobs. (Invitation inbox, file download, minutes withdraw, bell notices / reminders: CONNECTED in the final gap closure, see below.)

### Messages & Meetings — final gap closure reconciliation (2026-11-14, contract sha256 `e05f9777…c9a049`, 1,045 ops, read only)

Now CONNECTED (were D): conversation invitation inbox (accept / decline), bell messaging notices + announcement reminders, meeting file download, minutes withdraw. Still open — exact contract evidence and the narrow change each needs:

| # | Affected UI action | Missing operation / field (evidence) | Required request / response | Authorization | Blocks a core workflow? | Can wait for the final patch? |
|---|---|---|---|---|---|---|
| MB-1 | MS-06 New channel (members), channel info Add people | `POST /conversations` channel participants and `POST /conversations/{id}/invitations` body `{id, userId}` take account ids; no read returns account ids (`/projects/{id}/members`, `/teams/{id}/memberships`, Company directory `member.accessId` are space-local; `userId` appears only in request bodies) | accept `{id, actorId}` (source-roster actor, as `/meetings/{id}/invitations` already does) or an "all source members" flag; Project root access/me `conversation.create` hint | server resolves actor → account inside the source space; must re-check source membership + `conversation.create` / channel manage | yes for channel creation with members (create stays unavailable in UI) | yes — UI keeps the actions unavailable with a reason |
| MB-2 | MT-04 composer: schedule later, pin for N days, audience subsets | `POST /announcements/{id}/versions` body = {id, title, text, acknowledgement, attachments}; `PATCH …/pin` = {pinned}; no `publishAt`, `pinnedUntil`, no subsets read for NAMED | optional `publishAt` (server-side scheduler, version state SCHEDULED), `pinnedUntil`; `GET …/audiences` (department / team / office subsets) | same source-manager rule as publish (+ `work.manage`, hint gap noted) | no (publish now, whole workspace works) | yes |
| MB-3 | MS-09 global settings: receipts default, last seen, online, typing, who can message, quiet hours | only `/messaging-notifications/settings` {enabled} and per-conversation `receipt-settings` | one account-level messaging privacy resource (GET / PATCH with If-Match) | owner-only | no | yes (or owner reduces MS-09 to served fields) |
| MB-4 | MT-02 Personal meeting invitees | INDEPENDENT participants are account ids; `/meetings/{id}/invitations` accepts `actorId` only for work-source rosters; the only exact-email discovery is `POST /social/discovery` (Phase 6, out of scope) | accept contact / conversation actor ids for INDEPENDENT meetings, or an approved non-Social email resolver | recipient consent / discoverability rules | no (organiser-only Personal meetings work) | yes |
| OD-16 | MT-02 agenda duration, done state, shared notes | `POST /meetings/{id}/agenda` = {id, text}; `PATCH …/agenda/{entryId}` = {state ACCEPTED / REJECTED}; no notes resource | optional `durationMinutes`, `done` (+ revision) on agenda entries; a meeting notes document (GET / PUT with If-Match) | `meeting.manage` for duration / done; attendees for notes | no (proposal model live) | yes |

## Personal gap closure — confirmed contract gaps (2026-11-14, backend `ab37a2c`, 1,045 ops)

Checked against the canonical OpenAPI and backend contracts (read only). Everything else in this batch is connected (see `API_COVERAGE_MATRIX.md` → "Personal gap closure").

| # | Feature · interaction | Missing capability (contract evidence) | Narrow backend change |
|---|---|---|---|
| PR-1 | Habits › Routines · schedule a routine | `/routines` (5 ops) stores only `title`, ordered `habitIds`, `status` ACTIVE / ARCHIVED (`packages/api-contracts` routine schema; POST body `{title, habitIds}`, PATCH `{title?, habitIds?, status?}`) — no days, time, reminder link or routine check-in | optional `schedule` (the shared repeat rule) + `time` on the routine, or document that routines are scheduled through reminders |
| PR-2 | Settings › Delete account · policy version | `POST /me/deletion-request` requires `policyVersion` = the operator's `PERSONAL_ERASURE_POLICY_VERSION`; no endpoint returns it (handoff: "agreed policy supplied in deletion UI") — the frontend reads `NEXT_PUBLIC_ERASURE_POLICY_VERSION` and disables deletion without it | expose the active erasure policy version (+ its retention summary) read-only, e.g. on `GET /me/settings` or `GET /me/deletion-policy` |
| PR-3 | Bell · unread badge | no count endpoint: the badge reads one `state=UNREAD` page (100) and shows 99+ beyond | optional `GET /notifications/unread-count` (cheap poll) |

Not backend gaps (frontend / environment): browser push subscribe needs a service worker (`POST /push/subscriptions` exists); signed-out deletion status / cancel needs a recovery screen (`GET /me/deletion-request`, `POST …/cancel` exist); the export worker must run for `/me/export` to reach READY.

## Projects final gap closure — backend patch specification (2026-11-14, backend `ab37a2c`, 1,045 ops, sha256 `e05f9777…c9a049`)

Checked against the canonical OpenAPI and backend source (read only). Everything implementable is connected (`API_COVERAGE_MATRIX.md` → "… — final" rows). **Essential** = blocks a user action the approved UI offers; **Secondary** = a display stays Unknown / hidden or an action stays disabled with an explanation. All writes: If-Match = the resource revision, 409 on stale; reads respect `access/me` scope.

| # | Screen · action | Missing (contract evidence) | Expected behaviour / auth | FE impact | Weight |
|---|---|---|---|---|---|
| PB-1 | Tasks / Board / Detail · Delete task | no `DELETE /projects/{id}/tasks/{taskId}` (policy already has `task.delete`) | soft delete → `deletedAt`, 204 / item; If-Match task revision; `task.delete`; restore window optional | `deleteTasks` capability turns on; seam `projectTasks.remove` exists | Essential |
| PB-2 | Members · Pending invitations, Resend | spaces expose `POST invitations`, `GET …/{id}`, `POST …/revoke` only | `GET /spaces/{spaceId}/invitations?state=PENDING` (inviter-side, public-safe recipient label) + `POST …/{id}/resend` (new proof to the recipient, same id or revoke-and-reissue rule) ; `membership.admin` / `.manager` | Members pending tab + Resend wired (`memberInvites.listPending / resend`) | Essential |
| PB-3 | Overview · Activity tab | `content/{kind}/{id}/activity` logs content events only (`comment.create`, `file.initiate / ready / delete`, `document.*`), untyped `action`, no task title / from-to | `GET /projects/{id}/activity?limit&after`: `{kind: TASK_STATUS · TASK_COMPLETED · MILESTONE_REACHED · STATUS_NOTE, actorId, at, target {id, title}, from?, to?}`; `task.read`, only visible targets | `activity.list` maps 1:1 to `ProjectActivity` | Secondary |
| PB-4 | Status chip · health | no health field / write (`statusNote` only) | `health: ON_TRACK · AT_RISK · OFF_TRACK · null` on metadata + PATCH (`settings.manage`), with author / at | `editStatus` + `setStatus` | Secondary |
| PB-5 | Tasks · manual order | no task position | `position` per section on the LIST view + `PATCH …/tasks/{taskId}` {position, sectionId?} | `reorderTasks` | Secondary |
| PB-6 | Task detail · subtasks, show in calendar | no shared checklist on project tasks | `…/tasks/{taskId}/checklist` CRUD (`task.update`) | `toggleSubtask`, counts on rows | Secondary |
| PB-7 | For you · undo accept, remind | assignments: accept / decline / revoke / reassign only | `POST …/assignments/{id}/revert` (accepted → pending within a window, recipient) + `POST …/remind` (assigner, rate-limited notification) | `revertAccept / remind` | Secondary |
| PB-8 | Recipient invitation · decline note | decline body has no note | optional `note ≤ 500` on decline, visible to the inviter | note field enabled | Secondary |
| PB-9 | Analytics · cycle time, scope series | views serve no task `createdAt` / first `startedAt` | add both instants to the LIST view task | median cycle time + real burn-up scope | Secondary |
| PB-10 | Workflow editor · drafts | versions publish immediately; no draft / impact preview | version `state DRAFT`, `PATCH` draft, `POST …/publish-preview` (tasks per removed state), `POST …/publish` {mapping} (`workflow.publish`) | `workflowDrafts` | Secondary |
| PB-11 | Files · folders, versions, uploader, size limit | content files are flat, single-binary; limit only via env `FILE_MAX_BYTES` | `folderId` + folders CRUD; `POST …/files/{id}/versions`; `createdByActorId` on the file; `GET /projects/{id}/files/config` {maxBytes, allowedTypes} | `manageFiles`, version upload, real limit | Secondary |
| PB-12 | Risks · code, close reason, checklist, links, comments, convert | register item has no code, close reason / note, checklist, milestone / task links; comment targets exclude REGISTER_ITEM | `code` (server sequence R-n / I-n), `closeReason` + `closeNote`, `checklist[]`, `milestoneId`, `taskIds`, comment target `REGISTER_ITEM`, `POST …/{id}/convert` (RISK → ISSUE, link back) | `closeRisk`, checklist, comments, convert, PJ-08 risk-linked "at risk" | Secondary |
| PB-13 | Risks · probability | API 0–100 vs the approved 3-level scale | **owner decision** (band mapping) or a 3-level enum on the item — no backend change if a mapping is approved | probability shown / editable | Secondary |
| PB-14 | Members · weekly capacity | `capacity-days` are per-day records | **owner decision** how a weekly number spreads over the Iran work week, or a weekly capacity field per membership | `editCapacity`, workload over-capacity | Secondary |
| PB-15 | Phases · dates / progress / delay | phase component has title / position / completed only | `startDate`, `endDate` on phases (PATCH) | timeline bars, phase progress / behind | Secondary |
| PB-16 | Guests · grants | grants revoke + content-grant offers exist; no list per project, no email admission | `GET /projects/{id}/grants` (recipient label, scope, expiry) + offer by email | `grants.list / set`, Members guests tab | Secondary |
| PB-17 | Create · team-owned, templates, atomic | `POST /projects` {id, title, description, retentionPolicyVersion}; templates are project-scoped; key / dates need the metadata PATCH | optional `ownerTeamId`, `templateId` (org / built-in catalogue), `key` / `startDate` / `endDate` in the POST (removes the partial state) | enable team / template choices; drop partial path | Secondary |

Not backend gaps: risk create form and folder creation (no approved design — "coming soon"); owner "confirm transfer" step (successor accepts with their own password — flow change needs owner approval, R11); key uniqueness (keys are per-project by design — no availability claim made); schedule "only this task" preview / critical path / overlaps (R8 — decisions).
