# Integration progress (frontend ⇄ Phase 0/1 backend)

Handoff files live in `frontend-handoff/` (not `docs/backend-handoff/`); all seven present, `openapi.json` unchanged (sha256 verified before/after generation).
Module order: `INTEGRATION_RUNBOOK.md`.

## Frontend inventory (baseline)
- Next.js 16 App Router + TS + Tailwind 4, React Query 5, next-intl, Vitest (jsdom) + Playwright.
- Data seam: `src/data/repositories.ts` (interfaces) → `src/data/mock/*` (adapter) → `src/data/provider.tsx` (`DataProvider`, the single swap point) → hooks in `src/data/queries.ts`. UI never fetches directly.
- API layer: `src/api/`. **Mode switch** `NEXT_PUBLIC_API_MODE=live|mock` (default `mock`): live turns on the real session (auth gate, account sync); every not-yet-integrated module keeps the mock adapter in both modes.

## Status
- [x] **00a** Baseline, generated types, API transport, session-probe transport — 2026-11-03
- [x] **00b** Auth, verification/recovery, session restoration, profile/settings — **accepted** 2026-11-03 (live API + real-browser runs, see "00b acceptance — live + browser run")
- [x] **01** Tasks, checklist, subtasks, labels, trash, attachments — **accepted with documented gaps** 2026-11-03 (see "01 — Tasks")
- [x] **02** Task recurrence, occurrences, templates, saved filters, bulk — **accepted with documented gaps** 2026-11-03 (see "02 — Recurrence + bulk")
- [x] **03** My Day, week, reviews, rollover, capacity — **accepted with documented gaps** 2026-11-03 (see "03 — My Day / Day plans")
- [ ] 04 Calendar events, time blocks, views, conflicts ← **next**
- [ ] 05 … 17 (see runbook)

## 00a — what exists
- `openapi-typescript@7.8.0` (dev, pinned). `npm run api:types` → `src/api/generated/openapi.d.ts` (generated, lint-ignored, do not edit); `npm run api:types:check` detects drift.
- `src/api/client.ts` — typed `request(method, path, init)` from generated `paths`; `credentials: "include"`, `cache: "no-store"`, Origin never sent (stripped from types + runtime), ETag verbatim, 204 → `undefined`, CSV/octet-stream → `Blob`, `redirect: "manual"`. `newIdempotencyKey()`.
- `src/api/errors.ts` (`ApiHttpError`/`ApiNetworkError`/`ApiResponseError`), `src/api/config.ts` (`NEXT_PUBLIC_API_ORIGIN`), `src/api/session.ts` (`probeSession`), `src/api/runtime.ts` (mode + shared client).

## 00b — what exists
- `src/features/auth/auth-api.ts` — typed wrappers for 15 auth + 5 account ops actually used (sign-up/in/out, verification, reset request/submit, change password/email, list/revoke sessions, /me, /me/settings with ETag, /me/spaces). Provider tokens from responses are dropped.
- `session.tsx` — `useSession()` states loading · anonymous · active · unavailable (403) · offline; 401 on get-session = anonymous; revalidates on window focus (stale > 30 s). `leaveToSignIn()` cancels queries, clears React Query + mutation cache and only the account-scoped storage keys (`ACCOUNT_STORAGE_KEYS`: focus session, Overview slot dismissals, last opened sheet); device UI state (calendar layers, Task-create toggle), preference cookies and other origin data are kept, then full-document navigation (drops all in-memory/mock state). Global QueryCache/MutationCache 401 handler (live only). `useSignOut()` POST `{}`; 401 = already out; network failure keeps the user signed in with an error.
- `auth-gate.tsx` — wraps `(app)` shell and `(focus)`; mock mode = pass-through. Anonymous → `/sign-in?next=…` (safe, app-relative only); active→anonymous → `reason=revoked`; 403 → "unavailable" screen with sign-out; offline → retry.
- `account-provider.tsx` + `account-settings-map.ts` — loads `/me`, settings (+ETag), Personal Space under user-scoped keys; two-way sync locale ↔ language, preferredCalendar ↔ calendar, firstDayOfWeek (Sun=0) ↔ planner week start. Server snapshot is authoritative on load; local changes PATCH a partial diff with `If-Match`; on 409 refetch → re-apply same partial patch once; other failure → toast + revert to server.
- Screens (`src/app/(auth)/…`, `features/auth/screens/`): `/sign-in` (401 wrong credentials, 403 unverified + neutral resend, 429, offline, reason banners), `/sign-up` (verification pending, resend), `/forgot-password` (always generic result), `/reset-password` (token moved from URL to memory immediately, invalid/expired state, `referrer: no-referrer`), `/verify-email` (handles `?error`; success only claimed from an active verified session). Utility-card form, existing Field/Input/Button, fa/en `Auth` messages, LTR email/password inputs.
- Shell: profile menu + Overview greeting use the account name/email; "Sign out" item (live only). Settings → Data & account (live only): name, email + change email (fresh-session 403 copy), change password (+ sign out other devices), account time zone ("Use <device zone>"), signed-in devices (revoke one / all others; tokens memory-only, never rendered), sign out. Delete account stays phase 16.

## Evidence
- 00a: `vitest src/api` 20 passed; live cookie-less session probe ✔.
- 00b focused: `vitest src/features/auth src/api src/messages src/components/shell src/features/settings src/app` → **142 passed, 2 skipped** (env-gated live files). Covers credentials/no Origin, If-Match + 409 retry body/headers, 401 global sign-out + cache clear, revoked session, sign-out storage clearing, safe `next`, unverified/401/429 copy, reset token stripping.
- `npm run typecheck` clean; eslint clean on touched scope; `next build` (live env) ✔ incl. `/sign-in /sign-up /forgot-password /reset-password /verify-email`.
- **Live (Node, cookie jar, trusted Origin)** `src/features/auth/auth.live.test.ts` ✔: sign-up 200 (unverified, no session) · unverified sign-in 403 · wrong password 401 · get-session null · verification link 302 → `<trusted>/verify-email` without `?error`. Run: `API_LIVE_ORIGIN=http://localhost:3000 API_LIVE_TRUSTED_ORIGIN=http://localhost:3000 API_LIVE_MAIL_DIR=<backend>/apps/api/.tools/mail npx vitest run src/features/auth/auth.live.test.ts` (login limit 3/10 s/IP; test waits).
- **NOT VERIFIED live** (written in the same live test, auto-runs when `/health/ready` = 200): sign-in cookie, session restore, /me, /me/spaces, settings ETag/If-Match/409, change name, list/revoke sessions, password-reset round trip + single-use token, sign-out → 401. **No real-browser test** (CORS, below). Not exercised anywhere: change-email confirmation mail, change-password live, rate-limit UI live.

## Blockers (backend config/operations — nothing changed in backend)
1. **Backend not ready**: `GET /health/ready` → 503; every verified sign-in → 403. Cause: PrivacyGate quarantine (missing independent erasure-control evidence — guide "Backend and local connectivity"). Operator fix per backend runbook: for a newly provisioned namespace `pnpm personal-data:admin init-control` (never over restored evidence; otherwise `docs/runbooks/personal-data-lifecycle.md`), restart API, confirm `/health/ready` 200.
2. **Browser origin**: backend trusts only `BETTER_AUTH_URL` + `CORS_ORIGINS`; `.env` currently has none for the frontend (preflight from `localhost:3001` → no ACAO; mutation → 403). Exact change in backend `.env`: `CORS_ORIGINS=http://localhost:3001` (exact origin, comma-separated, no slash/wildcard), restart API. Frontend: `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_API_ORIGIN=http://localhost:3000`, `next dev -p 3001`. Same site (`localhost`) → SameSite=Lax cookies work; keep `localhost` (not `127.0.0.1`) on both sides. No proxy introduced.
3. Account locale/calendar from the server win on sign-in (cross-device consistency); a fresh account's server defaults may switch the UI language once — product decision if different behaviour is wanted.
- Test accounts `claude-00b-*@example.com` were created on the local backend DB during smoke runs.

## 00b acceptance check — 2026-11-03
- `GET /health/ready` → **503** (unchanged); preflight from `http://localhost:3001` → no `Access-Control-Allow-Origin`; backend `.env` has no `CORS_ORIGINS` / `ERASURE_CONTROL_ROOT`.
- Fresh installation **not confirmed**: the backend DB already holds accounts (incl. `claude-00b-*@example.com` smoke accounts). Per backend `docs/runbooks/personal-data-lifecycle.md` ("never initialize over restored or missing historical evidence") `init-control` was **not** run; the operator must decide: (a) truly new installation → set `ERASURE_CONTROL_ROOT` (private dir outside `STORAGE_ROOT`) and run `pnpm personal-data:admin init-control` before start; or (b) existing/restored data → follow the runbook's restore-replay / backup-restore procedure. Then restart API + worker and confirm `/health/ready` 200.
- Storage clearing tightened and verified (unit): sign-out removes `mp-focus-session`, `mp-overview-slot-dismissals`, `mp-sheet-opened`; keeps `mp-calendar-hidden-layers`, `mp-task-create-more`, unrelated keys. `vitest auth-gate` 10/10, `tsc`, eslint, `next build` ✔.
- Still **NOT VERIFIED**: login, session restore, /me, settings ETag/409 live, session revocation live, password-recovery round trip, logout → 401, and any real-browser run. Re-run once ready: `API_LIVE_ORIGIN=http://localhost:3000 API_LIVE_TRUSTED_ORIGIN=http://localhost:3000 API_LIVE_MAIL_DIR=<backend>/apps/api/.tools/mail npx vitest run src/features/auth/auth.live.test.ts`; browser: frontend on `:3001` with `NEXT_PUBLIC_API_MODE=live` after `CORS_ORIGINS=http://localhost:3001`.

## 00b acceptance — live + browser run (2026-11-03) — **ACCEPTED**
Backend: `/health/ready` 200; preflight from `http://localhost:3001` → ACAO `http://localhost:3001` + credentials true; mail sink now `<backend>/.tools/mail`.
- **Live API smoke** `src/features/auth/auth.live.test.ts` (trusted origin `:3001`, added email-change step) — **PASS**: sign-up → unverified 403 / wrong password 401 → verification 302 to `/verify-email` → sign-in sets session cookie → session restore → /me, Personal Space, settings quoted ETag → If-Match PATCH new ETag → stale ETag 409 → change name → change-email accepted + confirmation mail to current address → second session listed and revoked by revoke-other-sessions (→ null/401) → reset request → provider 302 to `:3001/reset-password?token` → reset 200, token single-use (400), sessions revoked → sign-in with new password → sign-out → get-session null, /me 401.
- **Real browser** (Chrome via Playwright, frontend `next dev -p 3001`, `NEXT_PUBLIC_API_MODE=live`; script kept out of repo) — **19/19 PASS**: anonymous `/personal` → `/sign-in?next=/personal`; sign-up pending (no cookie); verification link → `/verify-email` with token stripped; UI login → `next`; session cookie HttpOnly + SameSite=Lax, no token in JS storage/`document.cookie`; reload restores session, Settings shows email; name PATCH /me 200; language change PATCH with quoted If-Match → 200 + ETag; external revision bump then UI change → PATCH 409 → GET → PATCH 200, user's choice kept; "Sign out all other devices" 200 and the other browser lands on `/sign-in`; forgot → mail → `/reset-password` (token removed from address bar) → reset 200, old session → `/sign-in`; new-password login; Sign out 200 → `/sign-in?reason=signed-out`; `/personal` → sign-in; old cookie → /me 401.
- **Defect fixed**: dev console "searchParams accessed outside Suspense" on `/sign-in`, `/reset-password`, `/verify-email` → `export const instant = false` (project convention). Re-ran the browser check only: errors gone, 19/19 PASS.
- **Known, not fixed (dev-only, live mode)**: Next dev validator reports "Could not validate instant navigation" for Personal segments because AuthGate withholds them until the session is known; no runtime/functional effect. Fixing means opting every Personal page out (outside 00b scope) or moving the gate server-side — decide later.
- Not exercised: confirming an email change via both mailboxes (only the request + first confirmation mail verified), rate-limit UI against the live limiter.
- Test accounts `claude-00b-*@example.com` / `claude-00b-br-*@example.com` remain in the local backend DB.

## 01 — Tasks (2026-11-03) — **ACCEPTED with documented gaps**
**What exists**
- `src/data/api/api-tasks-repository.ts` — live `TasksRepository` (swapped in by `src/data/provider.tsx` only when `NEXT_PUBLIC_API_MODE=live`; mock unchanged otherwise). Loads root tasks (`rootOnly=true`, paginated, CANCELED hidden) + label names via one `labelId` listing per label; detail loads checklist, labels, READY attachments (→ Links "file"). Views/search/sort/counts reuse `task-query.ts`.
- Mapping: status OPEN/IN_PROGRESS→open, DONE→done; priority NONE↔null; `date`↔`scheduledDate`; `time`↔`plannedStartAt` (device-zone wall time ↔ UTC instant); `deadline`↔`dueAt` (23:59 local); description ↔ `{format:"MARKDOWN",version:1,content}`; checklist ↔ checklist-items (title/completed/position); labels by name (missing labels created via POST /labels).
- Writes: exact ETag from detail/mutation responses (list rows have none → detail GET before first write; ETag never derived from `revision`); 409 → refetch + re-send the same partial intent once; create uses one Idempotency-Key per intent (same key on lost-response retry); complete/reopen/delete/restore via action routes; checklist + label association writes use the Task revision and refresh it from `{task,item}`/Task responses; restore uses the delete response ETag (server restore window applies).
- **Defect fixed (found live)**: a new checklist item created already ticked lost its done state (POST takes no `completed`) → follow-up PATCH `completed:true`.

**New tests (only these were run)**
- `src/data/api/api-tasks-repository.test.ts` (in-memory contract fake) — **10/10 PASS**: time mapping (Asia/Tehran), create body + Idempotency-Key, rootOnly + detail-ETag-before-write, 409 refetch/resend, complete/reopen routes, label + checklist sync with per-revision If-Match, ticked-on-create regression, delete/restore, invalid input, session-only fields.
- `src/data/api/api-tasks-repository.live.test.ts` (real backend, env-gated) — **PASS**: create (day/time/priority/deadline/label) → fresh-adapter reload persistence + counts → edit (date move keeps time, Markdown description, label swap, 2 checklist items incl. ticked) → concurrent write from a 2nd adapter → 409 recovery keeps both changes → complete/completed view/reopen → delete hides → restore → cleanup delete.
- Real browser (Chrome, `next dev -p 3001` live, scratch script outside repo) — **5/5 PASS**, 0 new console errors: UI sign-in → `/personal/tasks`; inline quick add "… !high" → POST 201 with Idempotency-Key, server row HIGH + scheduled day; row Complete → POST `/complete` with quoted If-Match 200; reload shows it, server DONE.
- `tsc` clean during development; eslint clean on `src/data/api`, `src/data/provider.tsx`.

**Gaps / blockers (documented, not faked)**
1. No backend fields for energy, duration, area, project, scope, manual order (`reorder`), notes, goal link, recurring flag → kept **in session memory only**, lost on reload (UI unchanged). Needs a backend contract decision or later phases (goals 06, recurrence 02).
2. Server subtasks (child tasks) have no UI: the UI "Subtasks" tab maps to the server **checklist**; child tasks are excluded from lists (`rootOnly`).
3. Attachments are read-only (listed as Links "file"); binding needs a READY uploaded file (Phase 14 files). Unbind has no UI action.
4. Task `/history` is not mapped to the Activity tab (only the local "created from" line).
5. `bulkUpdate` = sequential per-task writes, not all-or-nothing (POST `/tasks/bulk` is Phase 02).
6. "Today" is still the fixed planner sample day (`getPlannerToday`) app-wide because mock modules depend on it; quick-add dates follow it. Real clock swap belongs with My Day (Phase 03).
7. Cross-module: My Day/blocks, Inbox→task, Goals still use the mock store, so they don't see API tasks until their phases.
- Test data: account `claude-01-…@example.com` (test password not recorded here) with soft-deleted P01 tasks and labels `Work`, `P01`, `P01b`.

## 01 — persistence correction (2026-11-03)
**Changed behavior (live mode only; mock unchanged)**
- Duration → `GET/PATCH /tasks/{id}/productivity` `estimatedMinutes` (own ETag/If-Match, 409 refetch + resend once; 1–10080). Loaded for list rows (bounded parallel, once per row) and refreshed on detail.
- Notes tab / Create "Notes" → `POST /notes {title: first line ≤300, content: MARKDOWN, taskId}` with Idempotency-Key (same key on lost-response retry); detail reads `GET /notes?taskId&state=ACTIVE`. Task description is never written by notes.
- Goal link: **not persisted**. The UI goal picker uses mock Goal IDs until Goals are integrated (Phase 06), and there is no task→goal reverse lookup (would need `GET /goals` + `GET /goals/{id}/links/tasks` per goal). Link writes need goal If-Match + task `sourceRevision` + Idempotency-Key — implement in Phase 06.
- Energy, area, project, non-personal scope, recurring, goal link, manual order → adapter rejects with `RepositoryError("unsupported")`, nothing written, nothing kept in memory. UI (`src/data/task-capabilities.ts`): Task detail energy/area/goal rows read-only with "Not available yet" (fa: «هنوز در دسترس نیست»), detail + bulk "Move" disabled, Create page context (non-personal)/energy/area/repeat disabled with hint, quick add/inline add no longer send default energy or parse areas, list/board drag-reorder shows "Not available yet in this version" instead of reordering (Phase 03).
- Partial failures: when the Task write succeeds but duration/labels/checklist follow-ups fail, the call rejects `RepositoryError("partial", {task, failed})`; `useTaskSaveError` shows "Saved, but {fields} wasn’t saved." with **Retry** re-sending only those fields with the user's values; create flows treat it as created (no duplicate), Create's note failure has its own Retry; create/update/bulk queries invalidate on settled.
**New/affected tests run (only these)**
- `src/data/api/api-tasks-repository.test.ts` + `src/features/tasks/use-task-save-error.test.ts` — **14/14 PASS** (adds: productivity ETag + reload, notes POST/reload + description untouched, unsupported rejection with zero writes, partial create).
- `src/data/api/api-tasks-repository.live.test.ts` (real backend) — **PASS** incl. duration 25→40 reload, note reload, description preserved, energy rejected.
- Browser (Chrome, live `:3001`) — **7/7 PASS**: quick add "~15m" → productivity 15; detail shows 3 "Not available yet" rows; complete + reload; 0 new console errors.
- `tsc` clean; eslint clean on touched files.
**Remaining limitations**: goal links (Phase 06); manual order (Phase 03); energy/area/project have no backend field (area derivable via Goals later; project = backend Phase 2); Task notes are plain Note bodies (no per-note edit/delete UI); list durations of rows changed on another device refresh only on detail open or reload.

## 02 — Recurrence + bulk (2026-11-03) — **ACCEPTED with documented gaps**
**Implementation** (`src/data/api/api-tasks-repository.ts`, live only; mock unchanged)
- UI "Repeat weekly" (Create switch, inline "Repeat" toggle, detail) ↔ WEEKLY series. On: re-read the Task (current revision) → `POST /task-recurrences {taskId, taskRevision, definition{version 1, startDate = task day or today, endDate null, localTime = task time or 00:00 (identity anchor only), timezone = device IANA, WEEKLY×1, exclusionDates []}}` (409 → refetch + resend once) → bounded `catch-up` through today+7 (follows `nextCursor`). Server hides the master; its id aliases to the earliest pending occurrence task (get/update/setDone/remove/addNote resolve it), so an open detail page keeps working.
- Off: `PATCH /task-recurrences/{id}` `ENTIRE_SERIES` with `endDate` = this occurrence's `localDate` (series If-Match; 409 → refetch + resend) — the visible task stays, later pending occurrences are canceled by the server. Not DELETE (verified live: DELETE cancels the current pending occurrence too).
- Every list load: series list → catch-up for non-retired series behind the horizon → occurrences → `recurring` = occurrence of a non-retired series repeating after it (endDate inclusive). Completing an occurrence task uses the plain Task route — verified live that the occurrence becomes DONE too.
- Bulk: `bulkUpdate` with Task-row fields → one `POST /tasks/bulk` (items `{id, revision, action:"PATCH", patch}`, one Idempotency-Key per exact body, lost response → same key/body); REJECTED `CONFLICT` items refetched and re-sent once (new body → new key); remaining REJECTED → `RepositoryError("partial", {failedIds})` → toast "{n} tasks weren't updated" + Retry for those ids. Patches with duration/labels/checklist/repeat stay per-task updates.
- `task-capabilities`: `recurring` now supported in live mode. New partial field "repeat"/«تکرار».
- **Defect fixed (found in browser)**: Create page saved duration first (bumps Task revision) so the series POST sent a stale `taskRevision` → 409 + retry; now the current revision is read right before creating the series.

**New tests (only these ran)**
- `src/data/api/api-tasks-recurrence.test.ts` — **5/5 PASS** (series body + device zone + catch-up horizon + master alias; stop via ENTIRE_SERIES endDate with series If-Match; existing task uses current revision; bulk single request + CONFLICT retry with new key + partial failedIds; per-task fallback).
- `src/data/api/api-tasks-recurrence.live.test.ts` (real backend) — **PASS**: repeat → 2 occurrences on reload, no duplicates on second load, completing an occurrence task → occurrence DONE, stop after 20 Oct keeps both tasks (13 Oct still repeating, 20 Oct last), bulk priority on both → one request, persisted.
- Browser (Chrome, live `:3001`) — **6/6 PASS**, 0 new console errors: Create page "Repeat weekly" enabled → series 201 (WEEKLY, Asia/Tehran, current taskRevision) → catch-up 200 → master id opens the occurrence in Task detail → occurrence tasks on the server.
- `tsc` + eslint clean on changed code.

**Limitations / blockers**
1. Only WEEKLY×1 is reachable: the UI has no rule editor (daily/weekdays/monthly/yearly/interval, end date, exclusions) — needs design.
2. No UI for skip/cancel of a single occurrence (`/task-occurrences/{id}/skip|cancel`), THIS_OCCURRENCE / THIS_AND_FUTURE edits, split lineage, exception or DST-gap reasons; editing an occurrence task changes only that task.
3. Templates (`/task-templates`, `/apply`) and saved filters (`/saved-task-filters`, `/{id}/tasks`) — **no existing UI**, not integrated.
4. `completeMany` / multi-delete still use per-task routes (bulk COMPLETE/DELETE not wired); bulk ADD/REMOVE_LABEL not used (bulk bar has no label action).
5. Catch-up runs on each list load (client-driven by contract); horizon = planner "today" (still the sample day) + 7.
- Test data: series/occurrences from P02 runs on the `claude-01-…` account (one earlier failed run left an active weekly series).

## 03 — My Day / Day plans (2026-11-03) — **ACCEPTED with documented gaps**
**Implementation (live only; mock keeps the sample day and all mock behaviour)**
- Real clock: `getPlannerToday/Now` (`src/data/clock.ts`) use the real time in live mode; the planner zone is settable (`lib/dates/zone.ts` `getPlannerTimeZone/setPlannerTimeZone`, default Asia/Tehran) and `AccountProvider` applies the account `/me/settings` timezone before rendering the app (spinner until loaded; a later zone change invalidates all queries). Day math (`clock-time.ts`, DST-aware two-pass offsets), the schedule island and the tasks adapter's wall-time ↔ instant mapping now use the planner zone (was device zone). Transport stays Gregorian `YYYY-MM-DD` / UTC instants; Jalali is display only.
- Day plans (`src/data/api/api-day-plans.ts`): GET (404 = no plan, never auto-created on read), POST `{}` only on a user action, PUT item (Day If-Match + current taskRevision + plannedMinutes = duration), PATCH `taskIds` (chosen first, others keep order), item `/move` (targetRevision 0 = no target Day), DELETE item when undated; 409 → refetch Day + resend once; 30 s cache for multi-day order reads.
- Tasks adapter: manual order (`reorder`, list/board drag) = Day plan order for dated tasks (fresh Task revision GET before selecting; undated → "unsupported" message); list `order` = plan positions for days today−7…today+14; rescheduling a planned task moves its plan item **before** the Task date PATCH (verified live: move after the date change → 409) — move failure → task date still saved + partial "My Day plan" toast. `manualOrder` capability now on in live.
- `PlanRepository` live (`api-plan-repository.ts`): My Day priorities = first three non-deleted/non-canceled task items of the Day plan (always a fresh read); `setPriorities` selects missing tasks and orders them first; block priorities → "unsupported" (TimeBlocks = Phase 04); focus stats stay mock (Phase 07).
- Reorder failures in list/board now toast instead of failing silently.
- **Defects fixed (found live)**: (1) ended series (scannedThrough = endDate < horizon) were caught up on **every** load (6 needless POSTs per load) → catch-up only to min(horizon, endDate); (2) reorder sent a stale taskRevision after the estimate write bumped it → fresh revision read; (3) plan move order (above); (4) priorities served a 30 s-cached plan → fresh read.

**New tests (only these ran, plus the directly affected Phase 02 recurrence unit file after the catch-up fix: 5/5)**
- `src/data/api/api-day-plans.test.ts` — **6/6 PASS**: no write on read of a missing Day, on-demand create + PUT with Day If-Match/taskRevision/minutes (no duplicate select), order with 409 retry, move (targetRevision 0) + undated DELETE + not-planned no-op, priorities (top 3, canceled skipped, block refused), live clock (mock sample day; live real date; account zone changes the day; invalid zone ignored).
- `src/data/api/api-planning.live.test.ts` (real backend) — **PASS**: real today in the account zone; repeated + 2 concurrent fresh loads → **0 catch-up POSTs**, every series scanned to min(today+7, endDate), no duplicate occurrence dates; reorder creates today's plan and persists order on reload; priorities B,C then A; reschedule A to tomorrow moves the plan item (today plan without, tomorrow with), still 3 tasks (no duplicate); completed task stays first priority.
- Browser (Chrome, live `:3001`) — **5/5 PASS**: My Day defaults to the real today (account zone UTC), shows a task dated today, Tasks "Today" shows the same persisted task. One "Failed to load resource: 404" console entry remained unidentified (no functional failure; possibly the documented missing-Day-plan 404).
- `tsc` + eslint clean on changed code.

**Limitations**
1. Weeks (`/planning/weeks`), reviews (MORNING/EVENING/WEEKLY), capacity/availability and rollover preview/commit are **not wired**: the existing Shutdown/Weekly Review/capacity UI still uses mock data and needs a mapping decision (Shutdown "move to tomorrow" changes the Task day, which now also moves its plan item).
2. Timeline blocks, block priorities and "scheduled" state on My Day = TimeBlocks (Phase 04); Unscheduled card uses task day/time only.
3. Day plan order is read for today−7…today+14 only; items beyond are not ordered in lists.
4. NextIntl `timeZone` (message date formatting) is still the static default zone.
5. Mock modules in live mode now see the real date while their fixtures sit on 13 Oct 2026 (Habits/Goals/Finance/… may look empty until their phases).
**Leftover test data (claude-01-… account; nothing deleted)**: 5 task series — 2 active weekly with no end (`5e8bb30e…`, `b3344d9f…`; each list load keeps occurrences materialized through today+7, i.e. ~1 new occurrence task per week per series), 2 ended on 2026-10-20 (`0d1077ff…`, `b2c870d6…`; no further writes), 1 retired. Tests that count tasks/occurrences on this account must filter by their own title stamp (all current tests do). Day plans exist for several dates in Nov 2026.
