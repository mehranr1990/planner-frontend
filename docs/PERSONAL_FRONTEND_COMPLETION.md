# Personal frontend — completion against the Personal gap closure

Date: 2026-11-17. Scope: Personal only. Backend read only, nothing committed.

Contract: `planner-backend/docs/api/openapi.json` at backend `a17c2e3`, **1,193 operations**, sha256 `99ad4f54cbfc6df01c14bcc2dbe17c3c5d1fc709d928ef4b514f19768b8d8c4b` (handoff `docs/frontend-handoff/PERSONAL_GAP_CLOSURE.md`, batch P1-GAP-CLOSURE). `src/api/generated/openapi-p6-personal.d.ts` was regenerated from it (openapi-typescript 7.8.0): the 13 earlier subset paths are unchanged, 11 paths were added. All new calls are typed against those generated types.

**Final status (2026-11-17, superseding the notes below): API ACCEPTED, VISUAL/BROWSER ACCEPTANCE NOT VERIFIED.** Live results, fixes and open items are in `docs/PERSONAL_LIVE_ACCEPTANCE.md`: production build passes on Next.js 16.4.6; all Personal flows pass against the real backend; export download is served as `application/json` while the contract declares `application/octet-stream` (frontend handles both); Insights "time" tab and account deletion are policy-gated; reminders and exports need the backend worker (`pnpm worker`) running.

Original status at implementation time: IMPLEMENTED, NOT LIVE VERIFIED (contract-fake unit tests only).

## 1. Connected in this pass (live mode)

| Requirement | Existing UI | Backend operations | Behaviour |
|---|---|---|---|
| PR-3 exact unread badge | Header bell (badge + Unread count) | `GET /notifications/unread-count` | Exact count over the whole Personal inbox (was: one 100-row page, 99+). Polls every 60 s and after every bell write (unchanged hooks). |
| PR-2 deletion policy + current request | Settings › Data › Delete account | `GET /me/deletion-policy`, `GET /me/deletion-request/current` | Server `policyVersion` is read before the request is offered; 409 (unset) falls back to `NEXT_PUBLIC_ERASURE_POLICY_VERSION` (kept, as the handoff asks). The row shows the latest request's state (en/fa). No retention text is inferred. |
| Signed-out deletion recovery | Promised by the existing Delete dialog ("cancel with your password and the recovery code") — no surface existed | `GET /me/deletion-request?jobId` + `POST /me/deletion-request/cancel` (`X-Deletion-Recovery`) | New minimal `/cancel-deletion` auth screen (same AuthPage/fields as Forgot password) + a small link on Sign in. Code only in a header and component memory; canceled → "sign in again". |
| PR-1 routine schedule | Habits › Routines (create / edit dialog) | `GET/PATCH /routines/{id}/schedule` | Optional schedule in the existing dialog: Every day / Every week (start day's weekday) / Picked days (Sunday = 0, Saturday-first display, Friday red), time (`HH:mm`, account zone saved with it), start / optional end day (Jalali picker), optional minutes, reminder opt-in. Routine ETag; the schedule PATCH uses the revision the routine write returned; unchanged schedules are not re-sent. |
| Routine occurrences, history, execution | Routine row in the same card | `GET /routines/{id}/occurrences` (paged by `nextDate`), `POST …/occurrences/{date}/execute` | Row shows the schedule summary, today's state + "n of m habits" (server count from real habit records), Start / Complete / Skip (only after the start time, never on terminal days), and a "Last 14 days" history. Occurrence revision as If-Match + Idempotency-Key. Completing never writes habit entries. |
| Working hours | Settings › Work hours (+ week day kinds) | `GET/PUT /planning/working-hours` | Read-modify-write on save and on Undo: full work days get the range, half days its first half, others none; exceptions are always preserved; 409 re-reads and re-applies. A range saved on the server (another device) is adopted when Settings opens. |
| Daily capacity | My Day capacity pill, overload bar, empty state; Overview hero + live slot | `GET /planning/capacity/schedule?date=` | Totals from the server (events ∪ time blocks ∩ availability, overlaps once). UNKNOWN / DST_GAP / failed read → "Capacity unknown · set work hours in Settings" and free time "—" (no invented hours). Local overlap detection still marks "over". Refreshes with every timeline write (key under `blocks`). |
| Weekly capacity | Weekly review › next-week strip | `GET /planning/capacity/schedule?weekStartDate=` | Weekly read when the planner week start equals the account `firstDayOfWeek`, else 7 day reads; unknown days show "—" and are never "over". |
| Recoverable Focus + duplicate prevention | Focus screen / My Day focus card (existing timer) | `POST /focus/sessions` (`recoverable: true`, STOPWATCH), `POST /focus/sessions/{id}/recovery`, `GET /focus/sessions/{id}` | Each browser focus cycle = one recoverable session: START / PAUSE / RESUME, HEARTBEAT every 30 s, RECOVER when INTERRUPTED (then RESUME if the timer still runs), FINISH when the cycle completes, DISCARD for a partial cycle (as before, partial cycles are not recorded). A finished cycle is claimed synchronously, so `recordFocusSessions` writes **no** manual time entry for it (FINISH records the TRACKED entry); unclaimed spans keep the legacy manual entry. Stable retry key per command (persisted with the session id), 30 s backoff after a refused command. Totals still come from `/productivity/summary` after the FINISH commits. |

Seam additions (no competing systems): `RoutinesRepository.schedule / setSchedule / occurrences / execute`, `WorkingHoursRepository` on the existing Personal services seam, optional `PlanRepository.focusRecovery`. Mock mode implements routines and working hours in memory; mock capacity is "not served" (`null`) so mock My Day / weekly review keep the local P02 model; mock has no focus recovery.

## 2. Left unchanged (already connected, no new contract reason)

Tasks, My Day planning, Calendar blocks + task follow, Habits, Goals, Inbox, Brain Dump (live adapter over `/brain-dump/pages`), Journal + mood / energy, Finance (accounts, transactions, budgets, bills, reports, export), Insights, Weekly review persistence, Daily shutdown (persists through Tasks + Journal), rollover (Task day + Day-plan move), reminders, notification preferences, push devices, task files, account export. Their remaining `unsupported` refusals (habit type/unit change, one-off rest days, free-text goal target, capture snooze, converted capture edit) are earlier documented contract limits, not part of this gap closure.

## 3. Mock dependencies in Live mode

Every Personal repository key (`tasks, blocks, inbox, plan, habits, goals, journal, finance, insights, brainDump, review, notifications, reminders, routines, workingHours, taskFiles, bills, financeReports`) is served by an API adapter in live mode (`src/data/provider.tsx`). Removed in this pass: the local work-hours capacity model in live My Day / Overview / weekly review; the env-only deletion policy; the page-count unread badge; anonymous manual time entries for recoverable focus cycles.

## 4. Verification

- `tsc --noEmit`: pass. ESLint on every touched file: 0 problems.
- New / updated tests: routines adapter +4 (`api-personal-services.test.ts`), unread count, routines UI +1 (`personal-services-ui.test.tsx`), working hours + capacity 6 (`api-working-hours-repository.test.ts`), focus adapter +4 (`api-focus.test.ts`), focus mirror 3 (`focus-recovery.test.tsx`), deletion status / signed-out cancel +2 (`account-lifecycle-api.test.ts`).
- Personal scope (features auth … tasks, `src/data`, shell, lib, messages): **173 files / 1,628 passed, 11 skipped** (env-gated live tests), 0 failed.
- `npm run build`: compile, TypeScript and all 125 pages (incl. `/cancel-deletion`) succeed; the build then exits 1 with `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability` (Next.js 16.4.3 checks the npm advisory registry). Not caused by this change; fixing it needs a Next.js upgrade (dependency change, not done here).

## 5. Contract mismatches / blockers

- No contract mismatch found for the gap-closure operations.
- EXTEND (+5) is not sent: the server accepts EXTEND only for POMODORO sessions, while each focus cycle is mirrored as a STOPWATCH session (recorded time is the actual work); +5 stays a browser timer change. Not a gap.
- Heartbeats run while a Focus reader is mounted (Focus screen or My Day). Leaving both while a cycle runs lets the server mark it INTERRUPTED; on return it RECOVERs at the last acknowledged work (server-authoritative accounting, by design).
- Build blocker (environment / dependency): Next.js 16.4.3 advisory gate, see §4.
- Environment (unchanged): live verification needs `API_LIVE_*` credentials, migrations and a configured `PERSONAL_ERASURE_POLICY_VERSION`; browser push still needs a service worker / VAPID config; the export worker must run for exports to reach READY.
