# Messages & Meetings — frontend completion (P5 gap closure)

Date: 2026-11-17 · Branch: `integration/backend-864-ops` · Not committed (owner instruction).
Contract: `planner-backend/docs/api/openapi.json` (904 paths, OpenAPI 3.1.0, sha256 prefix `c5442c60a77ebe6a`) and
`planner-backend/docs/frontend-handoff/MESSAGES_MEETINGS_GAP_CLOSURE.md` (ADR 0056).

## 1. Existing workflows reused

No repository, hook, client or screen was added or rebuilt. The changes plug into:

- `src/data/api/api-announcements-repository.ts` — `AnnouncementRepository.publish` / `list` (MT-04 composer and feed).
- `src/data/api/api-meetings-repository.ts` — `MeetingRepository.get` / `addAgenda` / `toggleAgenda` (MT-02 Agenda tab).
- Existing UI controls that were already in the approved design and are now live: composer "Schedule for later" switch +
  day/time, scheduled chip on the announcement card, agenda "Add item" form with minutes, agenda done checkbox,
  per-item minutes label.

Already connected before this run (re-verified against the current contract, unchanged): conversations (DM / group /
PROJECT·TEAM·COMPANY channels = `Conversation.kind`), `access/me`, members, invitations + own invitation inbox,
messages / threads / replies / edit / delete / pins / reactions / search / forward, read acknowledgements, receipts
(author-only aggregates), per-conversation notification mode (mute ↔ `MUTED`/`ALL`), contact blocks, announcement
read / acknowledge / manager totals / remind / reminders, meetings list / detail / RSVP (`TENTATIVE`) / work-source create /
invitations inbox / agenda proposals + organiser accept/reject / files / minutes lifecycle.

## 2. Newly connected backend APIs

| Operation | Use |
|---|---|
| `POST /announcements/{id}/versions/{versionId}/schedule` | Composer "Schedule": draft is scheduled instead of published. Body `{scheduledAt: UTC …Z, timezone: planner IANA zone, audience: {audience:"ALL"}}`, `If-Match` = draft revision, `Idempotency-Key` per step (kept across a same-`clientOpId` retry). |
| `GET /announcements/{id}/versions/{versionId}/schedule` | Replay guard (no second schedule) and the manager feed: a never-published announcement whose newest DRAFT has status `SCHEDULED` is listed with `scheduledFor = scheduledAt`. `null`, `CANCELED`, `PUBLISHED`, 403/404 → not shown as scheduled. Called only when root `access/me` grants the publish capability. |
| `GET /meetings/{id}/agenda/{entryId}/details` | Agenda item `minutes = plannedMinutes` (null stays null, never 0) and `done = completed` (accepted entries only; proposals keep `done: null`). 403/404 → unknown (null). |
| `PATCH /meetings/{id}/agenda/{entryId}/details` | Organiser add (create → accept → `{plannedMinutes}`) and done toggle (`{completed}`), `If-Match` = entry revision / details ETag, `Idempotency-Key`. 409 reported, never retried. |

`canEditAgenda` now follows `access/me` `meeting.manage` (organisers only manage duration / completion; the server re-checks).

## 3. Previously mock-only workflows now connected

- Scheduled announcements (was refused "scheduled publishing is not in the API").
- Agenda item duration and completion, organiser "Add item" with minutes (were refused "no duration / done state").

## 4. Contract compatibility

- `src/api/generated/openapi-p6-messaging.d.ts` regenerated with the pinned `openapi-typescript 7.8.0` from a subset of the
  canonical OpenAPI: the previous 112 paths + 5 new (`…/schedule`, `…/schedule/cancel`, `…/agenda/{entryId}/details`,
  `…/agenda/{entryId}/history`, `…/agenda-summary`). Diff is additive (+1203 / −1: `GET /meetings/{id}/invitations` now typed).
  Raw JSON not committed (scratchpad only).
- `tsc --noEmit` passes with the new types; no handwritten DTOs or routes.

## 5. Policy-gated, deferred and not mapped (exact gaps)

| Item | Status / reason |
|---|---|
| P5-04 WebSocket / presence / typing | Deferred by owner. `subscribe` stays silent; existing query refresh unchanged. |
| Voice/video calling | Deferred. |
| File upload / download content | Policy-blocked in local Shared test mode until malware scanning; existing adapters unchanged, not bypassed. |
| Timed pins (composer 3/7/14 days) | API pins have no end (`pinned`, nullable `pinnedAt`); still refused before any write. An untimed pin/unpin control (`PATCH …/pin`) needs a design decision — no approved control exists. |
| NAMED announcement audience | Needs `{accessId, generation}` pairs; the approved composer offers only mock-defined subsets and no served audience groups → whole-source (`ALL`) only. |
| Schedule cancel / reschedule (`…/schedule/cancel`) | Typed, not wired: the feed card has no approved cancel/edit control. |
| Agenda per-item notes, history, summary (`exceedsMeetingLength`) | Typed, not wired: the approved Agenda tab has no per-item notes, history or advisory slot; the meeting-level Notes tab has no API (stays hidden, `notes: null`). |
| Organiser invitation ledger (`GET /meetings/{id}/invitations`) | Typed, not wired: rows carry `recipientActorId` only (no display name); the invitee list shows named members. |
| Personal meeting invitees | `POST /meetings/{id}/invitations` takes an account `userId`; no account directory/lookup is served (MB-4) → Personal create stays organiser-only. |
| Global messaging privacy screen (`/messages/settings`) | Approved fields (last seen, online, typing, who-can-DM, global quiet hours, link-preview default) have no API; receipt sharing, mode and quiet hours are per conversation. Screen still reports unavailable in live; blocks list works. Account Push consent (`/messaging-notifications/settings`) has no approved control. |

## 6. Focused unit / contract tests (fake HTTP, no backend)

`npx vitest run` on 4 data files: `api-announcements-repository.test.ts` (refusal test updated; +3 scheduling tests),
`api-meetings-agenda-details.test.ts` (new, 5), `api-meetings-repository.test.ts`, `api-messaging-gap-closure.test.ts` → **40/40 pass**.
Regression: `src/features/messages/**`, `mock-messaging.test.ts`, `api-messaging-repository.test.ts` → **49/49 pass**.
Full suite: NOT RUN (instruction).

## 7. Build / typecheck / lint

- `npx tsc --noEmit`: PASS (exit 0).
- `npx eslint` on the 4 touched source/test files: PASS (0 problems).
- `npm run build`: PASS (exit 0, 125/125 pages). No Next process was running when built.

## 8. Live backend verification (2026-11-17, second session)

Safety checks before testing (read-only): `/health/live` and `/health/ready` 200 (database up). Port 3000 is served by the
stable dist API (`apps/api/dist/main.js`, started 22:07). A separate `nest start --watch` process (Social agent) does not own the port.
No prisma/migrate or other vitest process was running. The backend was not modified or restarted.
Contract: the canonical OpenAPI changed (sha256 `e6feb535…`). Regenerating the messaging subset differs **only** in the 429 response headers
(`Retry-After: string` + `RateLimit-*`). All P5 request/response shapes are identical, and the header-only regeneration was adopted.

Harness: new env-gated `src/data/api/api-messaging-p5.live.test.ts`, which drives the same adapters the UI uses, with two synthetic
accounts from the backend's ignored `.tools/company-development-accounts.json` (Company owner = A, member = B). It was paced, and credentials were never printed.
It ran twice: the first run found the defects below, and the second run verified the fixes.

| Workflow | Result |
|---|---|
| DM create (A→B) + same-intent retry → same id | PASS (FAIL on run 1 → fixed) |
| DM invitation inbox (B) + accept; open DM (presence hidden, never fabricated) | PASS |
| Send / list / retrieve; receipt null (sharing off by default) | PASS |
| Unread → mark read (global count decreases; not fabricated) | PASS |
| Thread reply + thread read; reaction | PASS |
| Edit own message | PASS (FAIL on run 1 → fixed) |
| Edit another's message refused (403) | PASS |
| Delete for everyone → recipient sees deleted state | PASS (FAIL on run 1 → fixed) |
| Mute/unmute (notification mode); own link-preview preference | PASS |
| Block → blocked user cannot send (403) → unblock | PASS |
| Private group create + accept + participants | PASS |
| Global privacy screen | NOT VERIFIED — no API for the approved global fields (documented gap) |
| Announcement access: manager can publish, member cannot (403 on publish) | PASS |
| Scheduled announcement: create, persisted `scheduledFor`, same-intent retry → one announcement | PASS (retry FAIL on run 1 → fixed) |
| Scheduled announcement hidden from member | PASS |
| Publish now (ALL, ack) → member sees + acknowledges → manager totals 1/2 | PASS |
| Company meeting create with invitee; organiser read + rename | PASS (rename FAIL on run 1 → fixed) |
| Invitation inbox (B) + RSVP TENTATIVE | PASS |
| Agenda add with planned minutes; completion toggle persisted (organiser) | PASS |
| Member reads minutes/done, cannot edit (403), `canEditAgenda` false | PASS |
| Agenda proposal (B) + organiser accepts | PASS |
| Personal (INDEPENDENT) meeting, organiser only | PASS |
| Shared meeting notes | NOT VERIFIED — UI notes are meeting-level; the API has per-entry notes only |
| Message attachments / meeting files | POLICY-BLOCKED (not attempted) |
| WebSocket / presence / typing / calls | Deferred, not claimed |

### Frontend defects found live and fixed

1. **Message edit / delete / pin / moderate sent no `If-Match`.** `POST …/advanced-actions` requires the current message revision
   (400 otherwise). `act` now reads the message (text or media details) and sends `If-Match: "<revision>"`
   (`api-messaging-repository.ts`). The existing unit test that expected `null` was corrected.
2. **Meeting PATCH used the response `ETag`.** `GET /meetings/{id}` sets no ETag of its own; the automatic hash ETag fails `IfMatchSchema`
   (bare 400). The adapter now uses the JSON `revision`, as the gap doc specifies (`api-meetings-repository.ts`). This affected rename/reschedule/link.
3. **Conversation create retry created a new conversation.** Each call generated a new resource id. It is now memoised per `clientOpId`
   (same id, key and body on retry).
4. **Announcement publish/schedule retry after success created a duplicate.** The replay record was deleted on success; it is now kept.

Focused tests: `api-messaging-repository`, `api-announcements-repository`, `api-meetings-repository` 35/35 and `api-messaging-gap-closure` 10/10.
`tsc` 0 errors, eslint clean on touched files. Build was not re-run (adapter-only changes).

### Backend/contract discrepancies (not frontend defects)

- `GET /meetings/{id}` returns an automatic weak/hash `ETag` that is not usable as If-Match (`/^"[1-9][0-9]{0,9}"$/`). Clients must use `revision`.
- Invalid If-Match returns a generic `BAD_REQUEST`, not `IF_MATCH_REQUIRED`/validation detail.

### Test resource cleanup

Test-owned records only. Both "Live check" Company meetings and the personal meeting were canceled; the sweep also canceled the 2 meetings left
active by run 1. Published announcements were withdrawn and scheduled ones canceled (including the run-1 duplicate). Group conversations were left by both members.
**Remaining:** the DM conversations between the two synthetic accounts (the API has no DM delete/close; messages in them are labelled "Live check").

## 9. Visual / browser verification

NOT VERIFIED (no browser / E2E automation).

## 10. Git status and preservation

Changed by Messages & Meetings work (both sessions), uncommitted:
`src/api/generated/openapi-p6-messaging.d.ts`, `src/data/api/api-messaging-repository.ts` (+ test),
`src/data/api/api-announcements-repository.ts` (+ test), `src/data/api/api-meetings-repository.ts` (+ test),
new `src/data/api/api-meetings-agenda-details.test.ts`, new `src/data/api/api-messaging-p5.live.test.ts`, this document.
All Projects / Teams / Companies uncommitted changes were left untouched (no reset, stash, clean or formatter). The backend was not modified.
`SESSION_HANDOFF.md` / `API_COVERAGE_MATRIX.md` were not edited (other sessions own uncommitted edits); merge §2, §5 and §8 there later.
Nothing committed or pushed.
