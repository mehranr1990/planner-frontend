# Backend requirements — Teams, Companies, Messages & Meetings

Gap analysis 2026-11-13. Contract: `planner-backend/docs/api/openapi.json`, 849 ops, sha256 `ea8c49ef…463f` (unchanged since Stage 1c). Read-only analysis: no application code, tests or adapters changed.
Frontend seams compared: `src/data/team-repositories.ts` (from the matrix, not re-checked), `src/data/company-repositories.ts` (84 methods), `src/data/messaging-repositories.ts` (64 methods + `subscribe`).
Projects gaps (R1, R3, R4, R6–R12) stay in `API_COVERAGE_MATRIX.md` and are not repeated.

Legend: **USE** = existing ops cover it (adapter work only) · **FA** = frontend adaptation, no backend change · **BE** = genuine backend blocker · **OD** = owner decision (drop/simplify UI vs. request backend).

## 0. Stabilization status (864-op contract sha256 `022c3121…cdabf`, integrated 2026-11-13)

IMPLEMENTED ≠ LIVE VERIFIED (contract-fake tests only). BE = needs a backend change · FE = frontend-only limitation.

| ID | Status | Detail |
|---|---|---|
| M-X4 | **RESOLVED** | work meetings: `participantActorIds` from Project / Team / Company root rosters (`api-meeting-sources.ts`); no account ids read or inferred. FE: `{id, actorId}` invitations to an existing meeting have no UI surface (MT-02 has no add-invitee) |
| M-X5 | **RESOLVED** | `meeting.create` on root `access/me` drives the New meeting source picker (no role inference; re-read per sheet open) |
| M-A1 | **PARTLY RESOLVED** | read + acknowledge live (`authorDisplayName`, null → no author; manager-only ack totals). BE: audience, scheduling, pin end, pending names, reminders (OD-13) → composer refused |
| T-M2 | **PARTLY RESOLVED** | current transfer (PENDING list item) + cancel (revoke). BE: Team settings read model (undefined Team policies) |
| T-M3 | open (FE) | documented mapping (embedded Project + overview / dashboard) exists; portfolio rows need health (no approved definition) and team ↔ project people overlap (space-local actor ids) → not mapped |
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
