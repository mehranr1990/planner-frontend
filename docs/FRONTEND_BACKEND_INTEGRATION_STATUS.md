# Frontend ⇄ backend integration status

Updated 2026-11-11. This is the summary; the maintained detail lives in `docs/integration/` (state, coverage matrix, decisions/blockers, session handoff) and the 00a–03 history in `docs/INTEGRATION_PROGRESS.md`.

## 1. Git
HEAD `4773064` (`main`). Uncommitted: Phase 04a changes (`src/data/provider.tsx`, `src/data/api/api-blocks-repository.ts`, new `api-blocks-repository.test.ts`) and these docs. Untracked, not to be committed: `docs/Backend-Handoff/Mehran-Backend-Fable-P6-01.zip`, `chatgpt-context.zip`.

## 2. Progress by module
| Module | Status |
|---|---|
| 00a transport/types · 00b auth, sessions, account | COMPLETE + LIVE VERIFIED (2026-11-03) |
| 01 Tasks · 02 recurrence + bulk | COMPLETE + LIVE VERIFIED (2026-11-03), documented gaps |
| 03 My Day (plan order, priorities, real clock) | PARTIAL — verified part live; weeks/reviews/capacity/rollover MOCK |
| 04 Calendar blocks | IMPLEMENTED, NOT LIVE VERIFIED (wired 2026-11-11) — events create/edit, series, conflicts not mapped |
| Habits, Goals, Focus, Journal, Inbox/Brain Dump, Finance, Insights, Weekly review, Shutdown | MOCK ONLY |
| Files, sync, push, account export/deletion | NOT BUILT / UI ONLY |
| Projects, Teams | MOCK ONLY, BLOCKED (Shared not activated) |
| Companies | context page only, BLOCKED |
| Messaging, Meetings, Announcements, Social (P6-01) | NOT BUILT |

Per-operation mapping: `docs/integration/API_COVERAGE_MATRIX.md`.

## 3. Infrastructure to preserve
`src/api/*` (typed client, errors, config, runtime, session), `src/features/auth/*`, `src/data/provider.tsx` swap point, `src/data/api/*` adapters, `src/data/clock.ts`, `NEXT_PUBLIC_API_MODE` / `NEXT_PUBLIC_API_ORIGIN`, env-gated `*.live.test.ts` files, mock adapters (Mock Mode unchanged).

## 4. P6-01 contract comparison
Package and OpenAPI hash verified (`c9bf9ec0…200e`, 841 ops). All 293 Phase 0/1 operations are present and schema-identical (0 removed, 0 changed after `$ref` resolution); 548 operations added for Phases 2–6. No compatibility defect in existing integration code; types not regenerated.

## 5. Missing APIs, mismatches, blockers
- B1 backend `/health/ready` 503 on 2026-11-11 → no live verification possible.
- B2 Shared activation/deployment not authorized, no API origin supplied → Phase 2+ gated.
- Owner decisions approved 2026-11-11, not yet applied: D1 generate Phase 2+ types from the verified OpenAPI without committing the raw spec; D2 update only the outdated integration scope in `CLAUDE.md`; D3 git-ignore the two handoff ZIPs; D5 task date/time changes keep the linked time block consistent (04b). Still open: D4 (Shutdown / Weekly review / capacity mapping).
- No contract mismatches found. Full list: `docs/integration/DECISIONS_AND_BLOCKERS.md`.

## 6. Tests and live evidence
- Unit (contract fakes): `src/api` + `src/data/api` → 55 passed, 4 skipped (2026-11-11). Auth/feature suites last recorded 2026-11-03.
- Live (real backend + browser): 00b, 01, 02, 03 on 2026-11-03 against the Phase 0/1 build. **Nothing live against the P6-01 build; Phase 04 has no live evidence.**

## 7. Remaining batches (priority order)
04b live check + task⇄block follow → 04c events/series/conflicts → 05 Habits → 06 Goals → 07 Focus → 08 Notes/Journal/Moods → 09 Capture/search → 10–11 Finance → 12 Notifications → 13 Insights → 14 Files → 15 Sync → 16 Account lifecycle → 17 cross-module gate. Phase 2+ (Projects → Teams → Companies → messaging/meetings/Social) only after B2 (D1/D2 approved, to be applied first).

## 8. Next task
Phase 04b — see `docs/integration/SESSION_HANDOFF.md`.
