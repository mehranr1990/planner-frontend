# Personal live acceptance — P1-FRONTEND-LIVE

Date: 2026-11-17. Verdict: **API ACCEPTED, UI NOT VERIFIED.** Build passes (Next.js 16.4.6); every Personal flow passes against the real backend, including reminder delivery and export once the local worker ran. Only the visual review remains (no browser in this environment); the Insights "time" tab stays POLICY-GATED.

## 1. Environment and backend identity
- Backend `D:\New folder\planner-backend` at `a17c2e3` (read only). Contract `docs/api/openapi.json`, 1,193 operations, sha256 `99ad4f54…8d8c4b`.
- API `http://127.0.0.1:3000` (local only). CORS preflight from the local frontend origin: 204. Better Auth cookie session; the live transport sends the trusted Origin and reuses cookies (no tokens stored).
- Frontend app live switch: `NEXT_PUBLIC_API_MODE=live` + `NEXT_PUBLIC_API_ORIGIN` (no `.env.local` is present, so a dev server runs in mock mode by default). Live checks used the app's own adapters and transport (`createApiClient`) from vitest (Node fetch to the real API). No mocks, MSW or stubbed responses.

## 2. Health and migrations
- `/health/live` 200, `/health/ready` 200.
- `prisma migrate status` (read only): database `mehran_dev` at `localhost:5432`, **101 migrations found, schema up to date**. No migrations run.

## 3. Test account
- Existing dedicated local test account (created 2026-11-12 through normal sign-up + local mail verification). Credentials only in git-ignored `.env.live.local`; not printed or recorded.
- Sign-in rate limit is 3 / 10 s (`create-auth.ts`), so live files were run one at a time with an 11 s pause.

## 4–6. Workflows exercised, persistence, frontend behaviour
Existing live suites (`src/data/api/*.live.test.ts`), each with create → read back → edit → re-read (fresh adapter) → If-Match / 409 recovery where applicable:
- Tasks (create, list, edit, labels, checklist/subtasks, 409 recovery, complete/reopen, delete/restore); recurrence + bulk priority; My Day planning (plan order, top-three priorities, move on reschedule, catch-up without duplicates); calendar blocks + task follow; habits (check, skip, amount, edit, archive/restore); goals (measure, milestones, linked task, lifecycle); inbox capture (capture, list, archive/restore, process, drop); journal + mood check-in; finance; legacy focus stats.

New `src/data/api/api-personal-completion.live.test.tsx` (gap closure):
- Unread count `GET /notifications/unread-count` = 0 and equals the real unread list. Deletion readiness: server policy unset (409) and no env fallback → Delete stays disabled; current request `{job:null}`.
- Unauthenticated `GET /me/settings` → 401; foreign/unknown routine → 404; sign-in → 200, sign-out → next request 401.
- Working hours: exception added, then the Settings write-through replaced the weekly intervals and the **exception was kept**; stale If-Match → 409; capacity day CONFIGURED (480 / 0 reserved), explicit Friday 0 min, week (account week start) contains 480, a misaligned week start is refused; cleared config → day UNKNOWN / null. Original configuration restored.
- Routines: schedule PATCH/GET round trip; stale revision → 409; occurrences for 4 days; habit check-in shows `1/1` progress on the occurrence; START → RUNNING; second START → 409; COMPLETE with a replayed Idempotency-Key returns the same revision (no second transition); SKIP after COMPLETE → 409; future day refused; history `PENDING, PENDING, COMPLETED`.
- Recoverable Focus via the **real browser mirror** (`useFocusRecovery`): create(recoverable) + START, finish early → claim + FINISH; the follow-up `recordFocusSessions` wrote **no MANUAL entry**; exactly one TRACKED entry linked to the session (~4 s); session FINISHED.
- Focus gap: START, heartbeat at 3 s, 65 s silence → HEARTBEAT 409, state INTERRUPTED; RECOVER → PAUSED with workMs 3,017 (**the gap was not counted**); RESUME + FINISH; second FINISH → 409.

## 7. Defects found and fixed
| Defect | Evidence | Fix | Re-verified |
|---|---|---|---|
| Goal milestone inserted in the middle came back in random order | live goals: expected `First, Middle, Second`, got `First, Second, Middle`. Backend stores `position` as sent and orders by (position, id); the adapter assumed the server shifts siblings | `api-goals-repository.ts` `addMilestone`: PATCH `/goals/{id}/milestones/{childId}` `{position}` (If-Match) to renumber later milestones, then POST the new one | live goals suite + goals unit tests pass (10/10) |
| Export download saved nothing (parsed JSON instead of a Blob) | server sends `application/json`, contract declares `application/octet-stream` | `downloadExport` returns a JSON Blob for a parsed artifact | live download 285,495 bytes; unit 7/7 |

No backend logic defect found; one backend media-type mismatch with the contract (export download, above).

## 8. Remaining blockers
- **UI not visually verified**: no browser access in this environment; no browser/E2E suites created (out of scope). Review the screens with `NEXT_PUBLIC_API_MODE=live`.
- Resolved: worker prerequisite. The backend README / `docs/runbooks/notifications.md` start it with `pnpm worker` (`node --env-file=.env apps/api/dist/worker.js`) after `pnpm jobs:migrate`. A read-only check found the `planner_jobs` schema already installed (no schema change needed) and the only queued work in `mehran_dev` was the test account's own export, so the worker was started with the existing command, verified, and stopped again. It is not left running; run `pnpm worker` beside the API for reminders and exports.
- **Insights "time" pattern**: `GET /insights/patterns?id=time` → 403. The backend resolves it through the Shared kernel (`MessagingAuthority` → `sharedActor`), and Shared activation is not authorized. The UI shows that tab's per-tab error; the other four patterns are served.
- Resolved: the production build gate (Next.js upgraded, §11).

## 9. Security / policy limits
- Browser review: no browser tool is available in this environment and browser automation is out of scope, so navigation, rendering, forms, RTL/LTR, responsive layout and themes in live mode were **not visually verified**.
- Insights "time" tab: kept POLICY-GATED (Shared kernel; Shared not activated, nothing substituted).
- Account deletion: POLICY-GATED (server erasure policy unset, no env fallback). No deletion request, cancellation or erasure was performed; `/cancel-deletion` was not exercised live.
- Export: not exercised (needs the password + running export worker; non-essential to this batch).
- Browser Push: not activated (no service worker / VAPID config).
- Notifications read/unread/snooze: inbox is empty and nothing fires without the reminder worker → mutation not exercised.
- Revoked shared access, network-failure recovery in the browser: not exercised (Personal-only account; no browser).

## 10. Test data and cleanup
- Second pass: brain-dump lines and their captures removed / dropped; carry tasks deleted; reminder deleted. Left: one past-week review (finished, "LIVE-ACC"), today's reflection on the test account, one READY export artifact (server retention applies). Final pass: second reminder deleted after its notification was dismissed.
- `LIVE-ACC …` habit and routine: archived (contract has no hard delete).
- Recoverable focus sessions: FINISHED; their 2 TRACKED time entries remain (the contract refuses deleting non-MANUAL entries).
- Earlier suites: their own cleanup (tasks deleted, goal archived, captures archived, journal day removed, legacy manual focus entries voided, finance postings reversed).
- Working hours restored to the pre-run configuration. No unrelated records touched.

## 11. Production build status
- Owner-authorized upgrade: `next` and `eslint-config-next` 16.4.3 → **16.4.6** (pinned, exact); `package-lock.json` changes only those packages and their `@next/*` binaries. `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run build`: **exit 0** — compiled, TypeScript passed, 125/125 pages. No code changes were needed for the upgrade; the security check was not bypassed.

## 11c. Worker pass (final)
- Worker started: "Planner notification worker ready"; it also consumes the Personal lifecycle queue.
- Export: the already queued test-account job went QUEUED → **READY**; the frontend's own calls (`exportStatus` for a fresh `downloadProof` → `downloadExport`) returned a 285,495-byte JSON file.
- Notification: a "LIVE-ACC" reminder due in 70 s was **delivered**; unread 0 → 1, then read → unread → dismiss moved the exact count 1 → 0 → 1 → 0. Reminder deleted.
- **Defect found and fixed (contract mismatch, frontend-side fix):** `GET /me/exports/{id}/download` is `application/octet-stream` in the OpenAPI, but the server sends `Content-Type: application/json` (attachment). The transport JSON-parses JSON media, so Settings › Export would have passed a parsed object to `saveBlob` and saved nothing. `downloadExport` (`account-lifecycle-api.ts`) now keeps a real Blob, or turns a parsed artifact back into a JSON Blob (same data; whitespace may differ from the server's bytes). Unit test added (7/7); the live download was re-verified. Backend note for its owner: align the declared media type or the response header.

## 11b. Remaining flows verified (second pass, `api-personal-remaining.live.test.ts`, one test per sign-in)
- Brain Dump: add 2 lines → page read-back → strike → send to inbox (line `sortedTo: inbox` + `inboxItemId`, capture listed) → remove → restore. Lines and captures cleaned up.
- Weekly review: draft saved for a past week on the account week start → read back by a fresh adapter → finished (`completedAt` persisted). The account `firstDayOfWeek` is Monday (1); the app syncs it into the planner week at sign-in, so the UI keys reviews correctly (a Saturday key is refused with 400, as the contract says).
- Daily shutdown / rollover: two tasks moved from today to tomorrow via `bulkUpdate` (the Shutdown / carry-over write) → a fresh adapter lists them on tomorrow and not today; reflection saved (mood 4, energy high). Tasks deleted afterwards.
- Insights: summary (4 weeks, 1 active day of 14 needed, no headline); patterns focus / signals / estimates / habits served; time 403 (§8).
- Export: `POST /me/export` (password) → QUEUED, status polled for ~30 s → still QUEUED (no worker).
- Notification read/unread: a reminder due in 70 s was created; unread count stayed 0 for ~2 min and its delivery stayed `pending` (no worker), so read / unread / dismiss could not be exercised. Reminder deleted.

## 12. Acceptance matrix
| Feature | Live request | Persistence | Frontend behaviour | Result |
|---|---|---|---|---|
| Auth: sign-in, session reuse, sign-out, unauthenticated | `POST /auth/sign-in/email`, `GET /me/settings`, `POST /auth/sign-out` | session cookie; 401 after sign-out | transport only | API PASS / UI NOT VERIFIED |
| Tasks, subtasks, complete/reopen, dates, priorities, recurrence | `/tasks*` | read-after-write, 409 recovery | adapters | API PASS / UI NOT VERIFIED |
| My Day plan, order, top three, reschedule | `/planning/days/*` | read-after-write | adapters | API PASS / UI NOT VERIFIED |
| Calendar blocks + task follow | `/me/calendar/*` | read-after-write | adapters | API PASS / UI NOT VERIFIED |
| Goals + milestones | `/goals*` | ordered milestones after fix | adapters | API PASS (after fix) / UI NOT VERIFIED |
| Inbox capture | `/capture*` | archive / restore / process | adapters | API PASS / UI NOT VERIFIED |
| Brain Dump | `/brain-dump/pages*`, `/capture` | add / strike / send / remove / restore read back | adapters | API PASS / UI NOT VERIFIED |
| Habits | `/habits*` | check / skip / amount | adapters | API PASS / UI NOT VERIFIED |
| Routines schedule / occurrences / execution | `/routines/{id}/schedule`, `/occurrences`, `/execute` | revisions, 409s, idempotent replay | adapters | API PASS / UI NOT VERIFIED |
| Recoverable Focus + no duplicate entry | `/focus/sessions`, `/recovery`, `/time-entries` | 1 TRACKED, 0 MANUAL; gap excluded | real mirror hook | API PASS / UI NOT VERIFIED |
| Focus +5 min | — | browser-only (server EXTEND is POMODORO-only) | unchanged | POLICY-GATED (by design) |
| Working hours + capacity day / week / zero / unknown | `/planning/working-hours`, `/planning/capacity/schedule` | exceptions kept; restored | adapters | API PASS / UI NOT VERIFIED |
| Finance | `/finance/*` | postings reversed | adapters | API PASS / UI NOT VERIFIED |
| Journal + mood | `/journal/*`, `/moods` | entry, check-in, remove/restore | adapters | API PASS / UI NOT VERIFIED |
| Weekly review | `/planning/reviews` | draft + finish persisted | adapters | API PASS / UI NOT VERIFIED |
| Daily shutdown / rollover | `/tasks` bulk date move, `/planning/days`, `/journal` reflection | tasks on tomorrow; reflection saved | adapters | API PASS / UI NOT VERIFIED |
| Insights summary + 4 patterns | `/insights/time`, `/insights/patterns` | server data | adapters | API PASS / UI NOT VERIFIED |
| Insights "time" pattern | `/insights/patterns?id=time` | 403 (Shared kernel) | per-tab error | POLICY-GATED (Shared not activated) |
| Notifications unread count | `/notifications/unread-count` | 0 = list | adapter | API PASS / UI NOT VERIFIED |
| Notification read / unread | reminder → delivered; `PATCH …/read`, `POST …/dismiss`; `GET /notifications/unread-count` | delivered + exact count moves | adapters | API PASS / UI NOT VERIFIED |
| Deletion policy / current request | `/me/deletion-policy`, `/me/deletion-request/current` | policy unset (409), job null | Delete disabled | POLICY-GATED |
| Export | `POST /me/export`, `GET /me/exports/{id}`, `GET …/download` | QUEUED → READY with worker; 285 KB JSON downloaded | adapter (after media-type fix) | API PASS / UI NOT VERIFIED |
| Production build | `next build` (16.4.6) | — | — | PASS |

## 13. Git working tree
Uncommitted (not committed or pushed): the completion batch, the acceptance fixes (`api-goals-repository.ts` milestone order, `account-lifecycle-api.ts` export download + its test), two live verification files (`api-personal-completion.live.test.tsx`, `api-personal-remaining.live.test.ts`), `package.json` / `package-lock.json` (Next 16.4.6) and these documents. `docs/Backend-Handoff/openapi.json` remains untracked and untouched. No backend files changed.
