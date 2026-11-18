# Social Phase 6 — Frontend ⇄ Backend Integration Audit

Date: 2026-11-18 · Read-only audit. No code changed.

| Item | Verified value |
|---|---|
| Backend | `planner-backend` `main` @ `33ef598` (feat(social): complete P6-06 security retention and recovery) |
| Contract | `docs/api/openapi.json`: **1,300 ops**, **149 Social ops** (`/social/*`, `/social-groups*`, `/social-group-invitations*`, `/social-activities*`, `/social-assets*`, `/social-loans*`, `/social-lost-found*`, `/social-goals*`, `/social-notices*`) |
| Frontend | branch `integration/backend-864-ops` (dirty working tree, untouched) |
| Frontend Social types | `src/api/generated/openapi-p6-social.d.ts`: 32 paths, last regenerated at the 1,045-op contract (`21eac3d`). All 32 paths still exist in the backend. |
| Frontend Social adapter | `src/data/api/api-social-repository.ts`: **27 distinct ops called** (of 149 = 18%) |
| Transport mode | `social-provider.tsx`: Mock Mode → `createMockSocial()` (`mock-social.ts`, 2,391 lines). Live mode + session → `createApiSocial()`. Live mode, no session → `social-off`. **No Shared-activation gate on the frontend** (see S1). |
| Typed but not called | 12 paths: invitation `preview`/`accept`/`decline`, `access/me`, handover `get`/`accept`/`decline`/`revoke`, group `history`, group `leave`, `blocks/{id}/unblock`, `restore-replay` |

Adapter behaviour outside the 27 ops: every other seam rejects `SocialError("unsupported", SOCIAL_GAPS.*)` and the UI shows `SocialUnsupported` ("Not available yet"). No mock fallback in live mode (verified: `activities`, `checklist`, `files`, `polls`, `freeBusy`, `expenses`, `balances`, `settlements`, `lending`, `lostFound`, `albums`, `challenges` are all `refused(...)`).

**Stale adapter assumptions (now wrong vs contract):**
- **X-S1** "no display names": connections now return `requesterDisplayName` / `recipientDisplayName`; memberships return `displayName`.
- **X-S2** "no access/me": `GET /social-groups/{id}/access/me` now returns `role, state, revision, groupState, capabilities`. This unblocks `myRole`, owner rights, `leave`, `transferOwnership` and settings.
- `SOCIAL_GAPS` text for activities / expenses / lending / challenges says "not in the contract". All of them are now in the contract.

---

## 1. Coverage matrix

Legend: **Live** = adapter calls the backend · **Mock** = mock only, live refuses · **Missing** = no UI.

| # | Module | Backend ops | Adapter calls | FE routes / screens | Data source (live mode) |
|---|---|---|---|---|---|
| 1 | Connections & Circles | 18 | 14 | `/social/connections` (`connections-screen.tsx`), privacy in same screen | **Live (partial)** |
| 2 | Groups & membership | 23 | 13 | `/social/groups`, `/social/groups/[id]` (overview), `/members` (+`invite-dialog`), `/settings`, `/social` home | **Live (partial)**. Create is refused |
| 3 | Activities, invitations, RSVP, polls, free/busy, checklist | 31 | 0 | `/social/activities`, `/social/groups/[id]/activities`, `/social/groups/[id]/calendar`, `/social/activities/[id]`, `/[id]/poll`, `calendar-projections.tsx` (Personal calendar) | **Mock** |
| 4 | Activity messaging | 3 (+ Messaging `/conversations/*`) | 0 | `/social/groups/[id]/chat` (`group-chat.tsx` via Messaging repo); activity screen links a conversation | **Mock** (group chat has no backend: P6-01 §7) |
| 5 | Expenses & settlements (Group + Activity ledgers) | 26 (13 + 13) | 0 | `/social/groups/[id]/expenses`, `/[eid]`, `/settle`; same under `/social/activities/[id]/expenses…`; `/social/balances` | **Mock** |
| 6 | Lending & Lost & Found | 27 | 0 | `/social/lending`, `/social/groups/[id]/lending` (`lending-screen`, `lending-parts`), `my-things-screen` | **Mock** |
| 7 | Goals & Challenges | 13 | 0 | `/social/groups/[id]/challenges` only | **Mock** |
| 8 | Social notifications | 2 | 0 | "Needs you" on `/social` (composed from join + connection requests) | **Live (composed)**. `/social-notices` is not used |
| 9 | Exit, deletion, recovery | 6 (+ `balances/me`, `settlements`) | 0 | Leave / delete in `group-settings-screen.tsx` | **Refused** (`leave`, `deleteGroup`, `leaveChecklist`) |
| — | Albums | 0 (deferred) | — | `/social/groups/[id]/album`, `/album/[albumId]` | Mock. **Keep refused** |
| | **Total** | **149** | **27** | 24 `page.tsx` routes | |

### Cross-cutting state handling (all modules)
- Loading / error / retry: `queryGate()` in `social-ui.tsx` (loading → `AccessLoading`, error → `ErrorState onRetry`, unsupported → `SocialUnsupported`). Screens use `AccessState social-not-available` for other `SocialError`s. These patterns are consistent and can be reused.
- Empty states exist per screen in Mock Mode. **Not verified against live empty payloads.**
- RTL / Jalali / Friday-red / Saturday-first, light + dark coral `social` scope, and mobile sheets were done in Mock Mode (code review only; no Playwright). Known defect: `poll-screen.tsx:157` uses `-space-x-1.5` (fails `logical-css.test.ts`). This is pre-existing.
- 429 / `Retry-After`: there is no Social handling (the Social family is limited to reads 600/min, writes 120/min, sensitive 20/min).
- `Origin`: the browser sets it. `client.ts` correctly never sets it.

---

## 2. Module detail

### 1. Connections & Circles: Live (partial)
- **Implemented:** `GET/POST /social/connections`, `POST /social/connections/{id}/{action}`, `POST /social/discovery`, `GET/PATCH /social/privacy`, `POST /social/blocks`, circles `GET/POST`, `GET/DELETE /{id}`, `GET /{id}/members`, `PUT/DELETE /{id}/members/{connectionId}`.
- **Missing ops:** `GET /social/blocks`, `POST /social/blocks/{id}/unblock`, `PATCH /social/circles/{id}` (rename), `POST /social/restore-replay` (operator restore procedure, not a UI action; leave out).
- **Missing UI:** blocked list + unblock, circle rename. Names are blank (X-S1). They should now come from `*DisplayName`.
- **Contract diffs:** privacy has `allowFriendRequests` (+`discoverable`) only. The FE "people in my groups" option stays refused. Phone contact is not in the contract.
- **Permissions:** server-side. The 404/403 indistinguishability is respected.

### 2. Groups & membership: Live (partial)
- **Implemented:** list, discover, get, PATCH (name/description/discoverable), memberships list + PATCH, join requests (create/list/decide), invitations create/get/revoke, handover start.
- **Missing ops:** `POST /social-groups` (create), `GET …/access/me`, `GET …/history`, invitation `preview`/`accept`/`decline` (`/social-group-invitations/*`), handover `get`/`accept`/`decline`/`revoke`.
- **Missing UI/flows:** group create wizard live; incoming group-invitation accept/decline (preview screen); handover accept/decline for the recipient; activity log (`events` → `history`); `myRole`-driven owner/admin controls.
- **Contract diffs:** the FE `NewGroupInput` has `topic`, `currency`, `visibility`, `inviteIds`. The BE takes `name, description, publicSummary, discoverable, retentionPolicyVersion`. There is no topic, no group currency (ledgers are per-currency) and no bulk invite (invite one by one). `memberCount`, `topic` and per-member status are not served. `resendInvite` and the pending-invites list have no op.
- **Blocker:** create needs the **operator-supplied `retentionPolicyVersion` (OD-1)**.

### 3. Activities / RSVP / polls / free-busy / checklist: Mock
- **Missing ops (31):** `GET/POST /social-activities`, `GET /social-activities/calendar`, `GET/PATCH/DELETE /{id}`, `POST /{id}/restore`, `/lifecycle/{cancel|close}`, `/join`, `/leave`, `/invitations`, `/rsvp`, `GET /participants`, `/participants/{pid}/remove`, `PUT /participants/{pid}/role`, `/succession`, `/succession/{action}`, `GET/POST /items`, `PATCH/DELETE /items/{itemId}`, `/items/{itemId}/restore`, `/items/{itemId}/task`, `GET/POST /polls`, `PUT /polls/{pollId}/vote`, `/polls/{pollId}/close`, `GET/PUT/DELETE /free-busy`, `PUT /reminder`.
- **Contract diffs to map:**
  - Templates: FE `trip/sport/gathering/family/blank` ↔ BE `TRAVEL/SPORT/GATHERING/FAMILY/GENERAL`.
  - Schedule: FE `startDay/endDay/startTime` ↔ BE `startsAt/endsAt` (instants) + IANA `timezone`.
  - FE `recurringWeekly`, `currency`, `withPoll`, `guestIds` are not on create. Invitations are separate per-user calls. Recurrence has no BE support.
  - Waitlist: FE `joinWaitlist`/`leaveWaitlist`/`acceptOffer` ↔ BE `rsvp GOING` with `seat` `WAITLISTED`/`OFFERED` (12 h `offerExpiresAt`). Leaving the waitlist is an RSVP change.
  - Polls: FE kinds `date/single/multiple` + `pickFinal` ↔ BE `GENERAL|SCHEDULE` + `multiple`. Closing a `SCHEDULE` poll with `chosenOptionId` moves the schedule. Results are aggregate counts + `myOptionIds` only.
  - `setCalendarBlock` has no BE op. The calendar is an overlay only (`GET /calendar`, ≤93 days).
  - Checklist → Personal task: the FE uses `useCreateTask` + `linkTask`. The BE `POST /items/{itemId}/task` creates the task server-side (idempotent, `created:false`). **Switch to the server op** to avoid duplicate tasks.
  - Deleted activities/items: `state DELETED`, `recoverUntil` (30 days), managers restore. No UI exists for this.
  - Succession (`successorParticipantId`), `orphanedAt` read-only state and reminders: no UI exists for these.
  - Activity Files: ADR 0063 disabled. **Keep refused.**

### 4. Activity messaging: Mock
- **Missing ops:** `POST /social-activities/{id}/conversation/open` (organizer, `{id, retentionPolicyVersion}`, `If-Match`), `POST …/conversation/join` (each participant), legacy `PUT …/conversation`. After joining, use the existing Messaging `/conversations/{id}/…` adapter.
- **Group chat** (`group-chat.tsx`) has no Social Group chat backend (P6-01 §7). It must stay `SocialUnsupported` in live mode (it currently is: `chatMembers` refused).
- **Blocker:** `open` needs **`retentionPolicyVersion` (OD-1)**. There is no push, presence or typing.

### 5. Expenses & settlements: Mock
- **Missing ops (13 per ledger × Group/Activity):** `GET/POST …/expenses`, `GET …/expenses/{eid}`, `…/history`, `…/revisions`, `…/decisions/{approve|reject|withdraw}`, `…/finance-posting/preview`, `…/finance-posting`, `GET …/balances`, `…/balances/me`, `GET/POST …/settlements`, `…/settlements/{sid}/decisions/{confirm|dispute|cancel}`.
- **Contract diffs:**
  - Money: FE `amount: number` + `SocialCurrency "toman"|"try"|"eur"` ↔ BE `amountMinor` **decimal string of integer minor units** + ISO `currency` + `scale`, per currency and never converted. `social-money.ts` integer math must take string/BigInt input. **No floats.**
  - Split: FE `SplitSpec` ↔ BE `method EQUAL|PERCENT(bp=10000)|WEIGHTED|FIXED` + ordered `shares`. The remainder rule is "payer first, then recorded order". Check that it matches `social-money.ts`.
  - FE `editAndApprove` = BE `revisions` then `decisions/approve`. FE `decideEdit` = revision decision. `sharesRestricted: true` for non-approvers.
  - Finance posting: the FE `claimFinancePosting`/`releaseFinancePosting` (local, Toman-only) is replaced by **preview (`accountId`, `categoryId`) → confirm with `revisionId`**. Handle `EXPENSE_CHANGED_REVIEW` / `NO_POSTABLE_SHARE` / `CURRENCY_MISMATCH`. **Never** offer posting for settlements.
  - `/social/balances` (`mineAll`, `between(personId)`) has no aggregate op. It must be composed from per-group/per-activity `balances/me` (N calls), or `between` refused.
  - Settlement `cancel` (payer) has no FE action. A dispute requires `note`.
- **Permissions:** approvers = Group Owner/Admin and Activity organizers. `GET balances` returns `403 BALANCE_PERMISSION_REQUIRED` for non-approvers. These rights come from `access/me` `capabilities`.

### 6. Lending & Lost & Found: Mock
- **Missing ops (27):** assets `GET/POST`, `GET/PATCH /{id}`, `/{id}/actions/archive`. Loans `GET/POST`, `GET /{id}`, `/actions/{action}` (15 actions), `/due-date`, `GET/POST /evidence`, `/history`. Lost & Found `GET/POST`, `GET /{id}`, `/actions/{withdraw|hide|unhide}`, claims `GET/POST`, `GET /{claimId}`, `/claims/{claimId}/actions/{action}`, claim evidence `GET/POST`, post evidence `GET/POST`, `/history`, `/matches`.
- **Contract diffs:**
  - FE `Thing` (`category`, `condition`, per-group `share`) ↔ BE asset `{title, description, audience CONNECTIONS|GROUP, groupId}`. There is a single audience and no category or condition.
  - FE `step()` / `reportIssue` / `resolveIssue` ↔ BE explicit actions. **Render `allowedActions`; never infer them.**
  - Due-date proposals (`accept-due`/`decline-due`/`withdraw-due`) have no FE UI.
  - Lost & Found: FE `missing|found` + `claim`/`confirm` ↔ BE `LOST|FOUND` + audience + claims sub-resource with its own state machine, and `matches`. Show "contested" when `contested` is true.
  - Group moderation view (`GET /social-loans?groupId=`, `myRole MODERATOR`, read-only) has no FE UI.
  - Evidence is **text only** (`kind`, `label`, `note`). There is no photo or file evidence.
- **Blocker:** migrations `202611180079/80` are not applied to `mehran_dev`. Retention/disposal is policy-gated.

### 7. Goals & Challenges: Mock
- **Missing ops (13):** `GET/POST /social-goals`, `GET/PATCH /{id}`, `/actions/{close|cancel}`, `/join`, `/withdraw`, `GET /participants`, `GET/POST /entries`, `/entries/{entryId}/actions/{approve|reject|retract}`, `/corrections`, `/history`.
- **Contract diffs:**
  - FE "challenges" (group only) ↔ BE `kind GOAL|CHALLENGE` with context **either** `groupId` **or** `activityId`. There is no activity-context UI.
  - BE has a review workflow (`reviewRequired`, `PENDING` entries outside totals, `SELF_REVIEW_FORBIDDEN`, `independentReviewerAvailable` warning) and organizer corrections. FE `setIndividualTotals` has no BE equivalent.
  - Visibility tiers: non-participants see aggregate only (403 `GOAL_PARTICIPATION_REQUIRED`). **No leaderboards, no sorting by progress.** A badge means "completed" only. Audit the FE challenge screen for ranking/ordering.
- **Missing route:** activity-level goals (e.g. `/social/activities/[id]/goals`). This is a design decision; do not invent a screen.

### 8. Social notifications: Live (composed only)
- **Missing ops:** `GET /social-notices` (poll, newest 1000), `POST /social-notices/{id}/read`.
- ~40 kinds (activity, seat offer, expense, settlement, `LOAN_*`, `CLAIM_*`, `GOAL_*`, `ORGANIZER_NOMINATED`, `ACTIVITY_DELETED`). Notices carry only ids, so the FE must route by `kind` and re-read the resource. There is no push.
- **Missing UI:** unread state + mark read, routing table, and possibly bell integration (Social has no bell hook today; it is shell-only).

### 9. Exit, deletion, recovery: Refused
- **Missing ops:** `GET …/exit-check`, `POST …/leave` (If-Match membership revision, optional `outstandingBalanceConfirmation`), `POST …/delete` (password + confirmation), `GET …/lifecycle-job`, `POST …/lifecycle-job/recovery-proof`, `POST …/lifecycle-job/recover` (`X-Deletion-Recovery`).
- **Missing UI/flows:**
  - Leave with obligations warning + second confirmation, and re-check on `409 OUTSTANDING_BALANCE_CONFIRMATION_REQUIRED`.
  - Owner delete with password re-entry.
  - Recovery screen (deadline prominent; states `CLOSING_GRACE → CLEANUP_PENDING → PURGING → DELETED | BLOCKED_POLICY`).
  - **Post-exit "own obligations" view**: `balances/me` + own settlements for a group the user can no longer open. This needs an entry point outside `/social/groups/[id]` (e.g. `/social/balances`).
  - Cache purge of all group queries on leave/removal/delete.
- **Contract diffs:** the FE `leave(groupId, removeMyPhotos)` photos option has no BE meaning (Albums are deferred). `leaveChecklist` (balance, things held, photos) maps to `exit-check` obligations only.
- **Policy:** disposal of retained records is policy-gated (ADR 0066 G). `BLOCKED_POLICY` must be shown, not treated as an error.

---

## 3. Security & permission gaps (frontend)

| # | Gap | Severity |
|---|---|---|
| S1 | Live mode calls Social for any signed-in user. There is **no frontend gate on Shared activation** (`sharedActivationAuthorized:false`, B2). Disabled-Shared responses must render `social-off`, not a generic error. Decide whether to add a config gate. | High |
| S2 | Roles are guessed (`myRole null`; admin = "join-request list answered"). Switch to `access/me` `capabilities` for every owner/admin/approver control. The server stays the authority. | High |
| S3 | Cache isolation on leave/removal/delete/recovery: clear all `social` queries for the group and its activities. `404` after exit must not show stale data. | High |
| S4 | Finance posting must always preview first, be explicit and idempotent, and pass the server's `revisionId`. The current mock is Toman-only and local. | High |
| S5 | `If-Match` from the last read for every transition (exists for P6-01 seams; extend to all). `Idempotency-Key` per user intent, reused on retry. | Medium |
| S6 | No 429 `Retry-After` handling for the sensitive class (20/min: invitations, roles, join/leave, lifecycle, decisions). | Medium |
| S7 | Lending/Lost & Found actions must come from `allowedActions` only. Notice payloads carry no authority, so always re-read the resource. | Medium |
| S8 | Goals: never rank, never imply verification; hide peer data per visibility tier. | Medium |
| S9 | Delete/recover send a password in the body. Never log, cache or persist it; clear the field on failure. | Medium |
| S10 | `restore-replay` must never be exposed as a generic retry for 403. | Low |

---

## 4. Backend / policy blockers (not frontend gaps)

| ID | Blocker | Affects |
|---|---|---|
| B2 | Shared not activated (`sharedActivationAuthorized:false`, `deploymentAuthorized:false`, `apiOrigin:null`). Every handoff says "not Live / isolated verification only". | All live verification (Batch 8) |
| OD-1 | Operator-supplied `retentionPolicyVersion` is unresolved. | Group create, Activity conversation open |
| OD-1…OD-14 | P6-01 open decisions are still unresolved per `FABLE_BACKEND_HANDOFF_P6_01.md`. | Various |
| DB | P6-04 migrations `202611180079/80` are not applied to `mehran_dev`. | Lending live |
| ADR 0063 | File/media contract only, disabled. | Activity Files, receipts, evidence photos, Albums |
| ADR 0064 / 0066 G | Retention/disposal of lending, financial, audit and history records is policy-gated (`BLOCKED_POLICY`). | Deletion final states |
| — | Not available: settlement → Finance posting, push/realtime, dispute arbitration, payments, debt collection, Social-specific export. | Do not build UI |
| — | No BE op for group topic/currency/member count/per-member status/pending-invites list/resend invite/activity recurrence/calendar block/challenge "individual totals"/cross-group balance aggregate/"between person" balance. | Keep refused or redesign (owner decision) |
| ADR 0060 | Still "pending ratification". | Activities/ledger semantics |

### Deferred: Albums
There are no album routes in the contract (`docs/architecture/social-albums-deferred-contract.md`). The FE album routes (`/social/groups/[id]/album*`, `album-screen.tsx`) must stay `SocialUnsupported` in live mode. Remove the `leave(…, removeMyPhotos)` option from the live flow.

---

## 5. Implementation batches

Each batch is one session, followed by focused vitest (contract-fake adapter tests + touched UI tests), `tsc`, and eslint on touched files. No E2E. Update `docs/integration/*` (matrix "Social", handoff) after each batch.

| Batch | Scope | Acceptance criteria |
|---|---|---|
| **1. Shared adapter & contracts** | Regenerate `openapi-p6-social.d.ts` from the 1,300-op contract (all 149 Social ops; generated TS only). Split the adapter into `api-social-*.ts` modules with shared helpers: revision cache/If-Match, Idempotency-Key per intent, minor-unit string ↔ `social-money` (BigInt/string), 429 `Retry-After`, `SocialError` code mapping (403/404/409/422). Shared-disabled → `social-off` (S1). Update `SOCIAL_GAPS` to the real remaining gaps. | Types compile; every adapter path is checked against the contract programmatically (0 outside); money round-trip tests (no float); disabled-Shared fake → `social-off`; existing 9 contract fakes pass. |
| **2. Connections & Groups** | Display names (drop X-S1). `access/me` → `myRole`/capabilities (drop X-S2). Group `history` → events. Invitation preview/accept/decline. Handover get/accept/decline/revoke. Blocks list/unblock. Circle rename. Group create **behind OD-1** (refused until a version is configured). | Owner/admin controls are driven only by `capabilities`; invite accept flow works on fakes; handover recipient sees accept/decline only; create shows the exact OD-1 reason when unset. |
| **3. Activities core** | List/get/create/patch, calendar overlay (replace `projections`), join/leave/rsvp/waitlist seats, invitations, participants/roles, lifecycle, delete/restore, succession, items (itinerary/agenda/checklist incl. restore), checklist → server `items/{id}/task`, reminder. Map templates and timezone instants. Files stay refused. | Jalali display of Gregorian instants in the activity timezone; 12 h offer shows `offerExpiresAt`; orphaned/closed/deleted read-only with `recoverUntil`; checklist task creation is idempotent (no client `useCreateTask`); `LAST_ORGANIZER`, `CAPACITY_BELOW_HELD` shown. |
| **4. Polls, free/busy, activity conversation** | Polls GENERAL/SCHEDULE + `multiple`, vote, close with `chosenOptionId`. Free/busy consent PUT/DELETE. Conversation open (**OD-1**) / join → hand off to the Messaging adapter. Group chat stays unsupported. Fix `poll-screen.tsx:157` logical CSS. | Counts only, no voter identity; consent is explicit and revocable; non-participants get 404 → not-available; `logical-css` test passes. |
| **5. Expenses & settlements** | Shared ledger adapter for both Group and Activity paths: expenses, revisions, decisions, history, balances (`me` vs all by capability), settlements (record/confirm/dispute/cancel). Finance posting preview → confirm. `/social/balances` composed from `balances/me`; `between` refused. | Exact minor-unit strings end to end; split methods + remainder match the BE; `sharesRestricted` respected; posting always previewed, never offered for settlements, repeat → `created:false`; per-currency balances, no conversion. |
| **6. Lending & Lost & Found** | Assets (audience model), loans (actions from `allowedActions`, due-date proposals, text evidence, history), moderator view, Lost & Found posts/claims/evidence/matches/hide. Map the FE Thing model; drop category/condition or keep them local-only (owner decision). | No action rendered unless in `allowedActions`; `contested` shown; moderator view read-only; evidence text-only. Live verification is deferred until migrations are applied. |
| **7. Goals & Challenges** | `social-goals` adapter (GOAL/CHALLENGE, group context; activity context only if the owner approves a route). Join/withdraw, entries + review, corrections, history, close/cancel. Remove `setIndividualTotals` from live. | No ranking or progress sort; pending entries excluded from totals; self-review warning when `independentReviewerAvailable=false`; visibility tiers enforced (403 → aggregate view). |
| **8. Notices, exit, deletion, recovery** | `/social-notices` poll + read, kind → route table, unread badge (no push). Exit-check → leave with double confirmation. Owner delete (password). Recovery (proof → recover). Post-exit own-obligations view under `/social/balances`. Full cache purge (S3). | `409 OUTSTANDING_BALANCE_CONFIRMATION_REQUIRED` triggers a re-check; group views clear immediately after leave; recovery deadline prominent; `BLOCKED_POLICY` shown as a state; password never persisted. |
| **9. Live verification & UI fixes** | Only after **B2 Shared activation** + OD-1 + migrations. Live smoke per module, RTL/dark/390-1440 review against `design/social` screenshots, update matrix to LIVE VERIFIED. | Owner authorization recorded; every module has live evidence or a documented blocker. |

**Order notes:** Batch 1 is a prerequisite for everything. Batches 2–3 unblock 4–8 (ledgers and goals need activity/group context + capabilities). Batches 6 and 7 are independent of each other. Albums are not in any batch.

---

## 6. Open owner decisions needed before or during the batches
1. Frontend Shared-activation gate (config flag) vs rely on the server response (S1).
2. OD-1 `retentionPolicyVersion` source (group create, activity conversation).
3. FE-only fields with no BE (topic, group currency, recurrence, calendar block, thing category/condition, challenge individual totals, member status, resend invite): hide in live mode, or keep as local-only?
4. Activity-context Goals/Challenges route (not in the current design).
5. Social notices in the global bell vs Social home only.

## 7. Final integration and live verification (2026-11-18)

Supersedes the Group chat, OD-1 and migration blockers above (backend ADR 0067).

- **Contract:** `openapi-p6-social.d.ts` regenerated from the 1,303-op backend contract (120 paths; +3 Group chat paths, additive Group ledger actor fields).
- **Retention (OD-1 resolved by owner D1/D2):** catalog serves `mp-rpc-v1.1-social-group` (SOCIAL_GROUP) and `mp-rpc-v1.0-conversation` (CONVERSATION); the adapters read the single catalog policy per context, never a constant.
- **Group chat (D7):** `groups.openChat` (live only): GET `/social-groups/{id}/conversation` → Owner/Admin `open` (If-Match group revision, stable idempotency key, CONVERSATION policy) → `join` → existing Messages conversation. Members see "chat not started" until an admin opens it. Mock mode keeps its own path; no live→mock fallback.
- **Group ledger (D3):** Group participants are current members by Group actor id; proposals/edits send `payerActorId` / `shares[].actorId` (self as own user id), settlements `payeeActorId`; Activity ledgers keep user ids.
- **Cache:** leave/delete/recover purge also drops cached Messages queries.
- **Evidence:** contract fakes `api-social-group-chat.test.ts` (4); full frontend suite 319 files / 2,502 tests pass (19 env-gated live files skipped); tsc, ESLint, production build pass. LIVE: backend API smoke 103/103 against `mehran_dev`; frontend adapters (group create via catalog, invitation proof+revision, Group chat open/join, actor-id expense + approval, exact 1001 minor units) passed against the Development API in a temporary, uncommitted env-gated check.
- **Not verified:** no browser automation is available in this environment; RTL/LTR, Jalali, dark/light and 390–1440 px visual review remain a manual owner check.
