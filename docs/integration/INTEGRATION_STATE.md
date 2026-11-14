# Integration state

Last updated: 2026-11-14 (Projects final gap closure; per-module log in `SESSION_HANDOFF.md`). Detailed per-phase history (00a–03): `docs/INTEGRATION_PROGRESS.md`.

## Backend contract in use

| Item | Value |
|---|---|
| **Current contract (2026-11-14, Phase 1–5 final)** | `D:New folderplanner-backenddocsapiopenapi.json` at backend `ab37a2c`, **1,045 operations**, sha256 `e05f977716a2c537a8c1b41721668785a82d852ac6b386cddaedaaafd0c9a049`. All subset types regenerated from full prefixes + new `openapi-p6-personal.d.ts`; coverage in `API_COVERAGE_MATRIX.md` → "Consolidated coverage". The untracked `docs/Backend-Handoff/openapi.json` is the older 845-op copy (not used; never commit) |
| Package | `docs/Backend-Handoff/Mehran-Backend-Fable-P6-01.zip` (untracked, **not ignored** — do not `git add`) |
| ZIP sha256 | `ca2b3c5f447c90f174ec5763cced7fbb40154aa7f43ba03a219595e9e4aa59c1` |
| Release | "Mehran Planner backend through P6-01", 2026-11-11, backend `7bcc10e2b133bc67976e5684f2aba82760890ea8` |
| `api/openapi.json` | OpenAPI 3.1.0, **841 operations**, sha256 `c9bf9ec01cbfdeed4183c7e963c4ab4fc6d09e0f3bddab4c3b12f1582d8d200e` — matches `RELEASE.json` and `SHA256SUMS.txt` (all 49 files OK) |
| Release flags | `deploymentAuthorized:false`, `sharedActivationAuthorized:false`, `phase6Complete:false`, P5-04 realtime DEFERRED, P6-02+ NOT STARTED, c09 EXCLUDED, `apiOrigin:null` |
| Contract 849 (2026-11-12) | same path, **849 operations**, sha256 `ea8c49ef225d6a5e23d00522550e93f96b6b8bba18522b047fb9ea7dc262463f`; adds `access/me`, metadata dates / statusNote, report snapshots list, CSV inspection, ownership-handovers list, dependency error codes. Types regenerated (subset + `/api/v1/me/work`) |
| Updated contract (2026-11-12) | `D:\New folder\planner-backend\docs\api\openapi.json`, **845 operations**, sha256 `1423729d191a239b94526cc846f43678297fb95e3088441b9e99ee0b2e871959`; adds Projects metadata, members and dashboard reads. `openapi-p6-projects.d.ts` regenerated from it (same subset paths) |
| Type source in repo | `frontend-handoff/openapi.json` (Phase 0/1, 293 ops, sha256 `224c07a5…97d6`) → `src/api/generated/openapi.d.ts` via `npm run api:types` |

**Contract comparison (programmatic, 2026-11-11):** all 293 Phase 0/1 operations exist in P6-01; after resolving every `$ref` and ignoring documentation text, **0 removed, 0 changed**. The 548 new operations are additive (Projects 134, Teams 80, Companies 149, conversations/messaging 56, meetings 38, announcements 17, Social 40, spaces/invitations/`/me` additions 34). The existing generated types and adapters are therefore valid against P6-01 for everything integrated so far; types were **not** regenerated (see D1 in `DECISIONS_AND_BLOCKERS.md`).

Approved 2026-11-11 (D1): Phase 2+ types will be generated from this verified spec without committing the raw JSON; not done yet.

The ZIP is only extracted to a session temp directory. Re-verify only if the ZIP hash above changes.

## Architecture (preserve)

- Seam: `src/data/repositories.ts` → adapters → `src/data/provider.tsx` (`createRepositories`, the single swap point) → React Query hooks in `src/data/queries.ts`. UI never fetches.
- Mode: `NEXT_PUBLIC_API_MODE=live|mock` (default mock). **Hybrid in live mode**: integrated modules use `src/data/api/*`; every other module keeps the mock adapter (no silent fallback inside an integrated module — API failures surface as errors).
- Transport: `src/api/client.ts` (typed `request`, `credentials:"include"`, no-store, quoted ETag verbatim, 204/Blob handling, `newIdempotencyKey`), `errors.ts`, `config.ts` (`NEXT_PUBLIC_API_ORIGIN`), `runtime.ts`, `session.ts`.
- Session: `src/features/auth/*` (auth-api, session, auth-gate, account-provider, account-settings-map, screens). Cookie session only; 401 → global sign-out + cache clear.
- Clock/zone: live mode uses the real clock in the account time zone (`src/data/clock.ts`, `src/lib/dates/zone.ts`); mock keeps the sample day.

## Module status

| # | Module | Status | Notes |
|---|---|---|---|
| 00a | Types, transport, session probe | COMPLETE + LIVE VERIFIED (2026-11-03) | |
| 00b | Auth, recovery, sessions, profile/settings | COMPLETE + LIVE VERIFIED (2026-11-03, API + real browser 19/19) | |
| 01 | Tasks, checklist, labels, trash, notes, duration | COMPLETE + LIVE VERIFIED (2026-11-03) with documented gaps | |
| 02 | Recurrence (weekly), bulk PATCH | COMPLETE + LIVE VERIFIED (2026-11-03) with gaps; templates/saved filters have no UI | |
| 03 | My Day plan order, priorities, real clock | PARTIAL, live-verified part (2026-11-03); weeks/reviews/capacity/rollover not wired | |
| 04 | Calendar blocks (views, time blocks, event move) | **IMPLEMENTED, NOT LIVE VERIFIED** (wired 2026-11-11; unit 11/11) | series edits, event create/edit, conflicts, all-day not wired |
| 05 | Habits | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-12; unit 11/11) | routines, water summary, server stats have no UI |
| 06 | Goals | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-12; unit 9/9) | task ⇄ goal via links/tasks; no API field for free-text target / key results / money |
| 07 | Focus stats | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-12; unit 4/4) | server focus sessions not driven (browser timer) |
| 08 | Journal, mood, energy | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-12; unit 8/8) | went-well / prompts / tags live inside the entry Markdown |
| 09 | Inbox (capture) | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-12; unit 5/5) | snooze unsupported; Brain Dump stays MOCK (no API model) |
| 10–11 | Finance | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-12; unit 8/8) | IRR only; transfers/adjustments/other currencies not listed; bills, savings, accounts read-only |
| 13 | Insights | **IMPLEMENTED (summary only), NOT LIVE VERIFIED** (2026-11-12; unit 3/3) | patterns blocked by contract (B4) |
| 03b | Weekly review | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-12; unit 5/5) | one text field holds the draft; rollover/capacity not used |
| — | Verification phase 2026-11-12 | live verification **not run** (credentials unset); Reschedule Undo failure not reproduced (11/11); lint warning fixed | live-verified = 00a–03 only |
| 12, 14–16 | Notifications, reminders, routines, task files, bills / reports / finance export, account export / deletion | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-14 gap closure; owner-approved UI; contract fakes + UI tests) | bell inbox (read / snooze / dismiss / task deep link), Settings › Notifications (preferences, push devices revoke, reminders list), Task detail › Files + Reminders tabs, Habits › Routines, Finance › Bills + Reports (+ CSV / JSON export), Settings › Data (account export, staged deletion). Deletion ENVIRONMENT BLOCKED until `NEXT_PUBLIC_ERASURE_POLICY_VERSION`; push subscribe needs a service worker; sync stays out of scope. Gaps PR-1…PR-3 (`BACKEND_REQUIREMENTS.md`) |
| — | Projects, Teams | MOCK ONLY; **BLOCKED** (Shared activation not authorized; D1/D2) | |
| S3 | Teams (TM-00…TM-15) | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-14; contract fakes) | every existing Team screen reads / writes the API in live mode; TM-03 events + time off, TM-05 sprints, TM-06 portfolio, calendar overlays added in S3; remaining refusals are backend gaps TB-1…TB-8 (`BACKEND_REQUIREMENTS.md`) or outside the approved UI. Live run needs migrations, retention catalog, CORS, credentials, Shared activation |
| S3b | Teams final gaps | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-14; contract fakes) | time-off list / approve / reject / cancel / history and event cancel (owner-authorized minimal UI on TM-03); TB-1…TB-8 re-verified, none blocks a core workflow |
| S4 | Companies (CS-01, CO-00…CO-14, CO-90) | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-14; contract fakes) | live mode reads / writes the API on every existing Company screen; S4 added overview KPIs, staff + work profile, projects / teams + attach, resource requests, expenses (receipt bytes, chain submit), KB create, employee document upload, grants, ownership handover, invitations; fixed payment-run override. Gap closure (2026-11-14): company notifications in the bell, employee department transfer, pending invitations (no email), corrective-action reviewer picker, truthful ownership-transfer form. Remaining refusals: CB-1, CB-2, CB-3 (email only), CB-4, CB-6, CB-7, CB-8 (`BACKEND_REQUIREMENTS.md`), company create (C: retention). Live run needs migrations, COMPANY retention policy, CORS, credentials, Shared activation |
| S5 | Messages & Meetings (MS-01…MS-09, MS-90, MT-01…MT-04) | **IMPLEMENTED, NOT LIVE VERIFIED** (2026-11-14; contract fakes; final gap closure added invitation inbox, bell messaging notices + announcement reminders, meeting file download, minutes withdraw) | every existing Messages / Meetings / Announcements screen reads / writes the API in live mode; S5 added announcement composer (publish ALL), Remind, unread mentions, read receipts, Personal meeting create. Blocked: MB-1…MB-4, OD-16 agenda fields (see `BACKEND_REQUIREMENTS.md`) |
| — | Social (Phase 6) | out of scope | |

"LIVE VERIFIED" evidence dates from 2026-11-03 against the local Phase 0/1 backend build. Nothing has been live-verified against the P6-01 build: on 2026-11-11 `http://localhost:3000/health/live` = 200 but `/health/ready` = **503** (see B1).

## Projects (Stage 1, 2026-11-12; Session 2 closure 2026-11-14)

**Final gap closure (2026-11-14, same contract) — IMPLEMENTED, NOT LIVE VERIFIED:** workload + team load and analytics computed from the visible task list; PJ-08 rows, milestone rename, phase order; risk register read / edit; Settings → Access = role-default policy; create limits + stable attempt id; live upload gate fixed. Remaining true backend gaps PB-1…PB-17 (`BACKEND_REQUIREMENTS.md`, PB-1 task delete and PB-2 pending invitations / resend are the essential ones).

Session 2 (contract 1,045 ops, sha256 `e05f9777…`): create (sequence + partial outcome), inviter invitations (send / cancel), decline-note refusal, invitation count, task comments + files, PJ-10 files with real bytes, phases + milestones lists (nullable domain; fixes a live loading hang on Tasks / Board / Detail / Overview / Timeline), unavailable states on refused reads. IMPLEMENTED, NOT LIVE VERIFIED. Rows: `API_COVERAGE_MATRIX.md` → Consolidated coverage (Projects · … S2).

Types: `src/api/generated/openapi-p6-projects.d.ts` (subset of the 845-op contract). Live mode: `api-project-repositories.ts` — members (list / role / remove), status-card KPIs, schedule graph + links + cascade reschedule, task comments, task dependencies, field deprecate, template save, project deletion request connected (contract fakes 12/12, NOT live verified); all other Projects methods refused as "unsupported" (blocker B5, requirements R1, R3, R4, R6–R12 in the matrix). R5 seam change applied. Session 5 live results for Personal: see `SESSION_HANDOFF.md`.
