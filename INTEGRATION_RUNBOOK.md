# Mehran — low-context integration runbook

## Prepare once (user)
1. Open Claude Code in the EXISTING frontend repository root (not an empty folder).
2. Put the seven existing backend handoff files in `docs/backend-handoff/`, preserving original names and `openapi.json` bytes. Do NOT paste their contents into the chat. If sharing a backend repo directly, the agent may reference the local path instead of copying files.
3. Copy the companion `CLAUDE.md` to frontend root. If a `CLAUDE.md` already exists, MERGE its rules into the existing file; do not overwrite project-specific instructions. For `docs/backend-handoff/`, ensure `openapi.json` is not automatically injected as text by an editor/context tool.
4. Keep API origin and frontend origin configurable. There is no published Swagger or HTTP OpenAPI endpoint; the checked-in JSON file is authoritative.

## First Claude Code prompt — use only this short message

> Read `CLAUDE.md`. Follow `INTEGRATION_RUNBOOK.md` if present. First inspect the existing frontend and locate the seven backend handoff files. Create/update `docs/INTEGRATION_PROGRESS.md`. Do NOT dump complete OpenAPI/docs. In this turn implement ONLY phase 00a: inventory the existing frontend, generate local API transport types from the unchanged OpenAPI, add the shared typed fetch layer with cookie/response/error support, and test the session-probe transport. Do not yet refactor auth screens. Preserve existing design and mock compatibility where applicable. Use targeted source lookups, run focused tests plus available typecheck/lint, report concise evidence and next step. If backend is not running, verify with typed/mocked tests and mark live smoke unverified; do not claim live integration.

## Subsequent prompt (one module / session)

> Read `CLAUDE.md` and `docs/INTEGRATION_PROGRESS.md`. Continue ONLY the next unchecked module in the runbook. Read only its reference table, relevant workflow section, and exact OpenAPI operations. Implement into the existing UI, add focused tests, run relevant checks, and update progress. Keep response short. Do not re-audit finished modules unless a failure requires it.

## Module order (repeat the subsequent prompt, one module at a time)
- [ ] 00a. Baseline, generated types, API transport, session-probe transport.
- [ ] 00b. Auth, verification/recovery, session restoration, profile/settings.
- [ ] 01. Tasks, checklist, subtasks, labels, trash, attachments.
- [ ] 02. Task recurrence, occurrences, templates, saved filters, bulk.
- [ ] 03. My Day, week, reviews, rollover, capacity.
- [ ] 04. Calendar events, time blocks, views, conflicts.
- [ ] 05. Habits, entries, routines, water.
- [ ] 06. Goals, milestones, life areas, links, progress.
- [ ] 07. Focus, Pomodoro, time entries, productivity.
- [ ] 08. Notes, folders, versions, private journal, moods.
- [ ] 09. Capture, triage, parsing, personal search.
- [ ] 10. Finance: accounts/categories/transactions/transfers.
- [ ] 11. Finance: budgets/bills/savings/reports/export.
- [ ] 12. Reminders, notifications, browser push.
- [ ] 13. Insights and optional rewards.
- [ ] 14. Private files, supported WAV flows, downloads.
- [ ] 15. Limited offline sync, conflicts, replay/status.
- [ ] 16. Account export, staged deletion, cancellation, recovery.
- [ ] 17. Cross-module E2E/smoke, security/privacy, responsive, build and known release gates.

## Non-negotiable verification per module
- Exact operation, method, body, headers, status and response type checked against `openapi.json`.
- Real UI states: loading, empty, success, validation, unauthorized, conflict, offline/service error.
- Domain checks specific to the module, focused tests green, no regressions in existing UI.
- Live API smoke only when a running, correctly configured backend is available; otherwise mark **NOT VERIFIED**.
- Track gaps explicitly. A passed static build is NOT proof of a working live integration.

## Important backend constraints
- Routes already include `/api/v1`; do not double-prefix. Health routes are `/health/live` and `/health/ready`.
- Cookie authentication, not frontend bearer JWT. SameSite=Lax deployment/site compatibility matters.
- Mutations require trusted browser Origin; never manually set the forbidden `Origin` header from browser JS.
- Retain quoted ETags; correct resource revisions for nested actions; replay idempotent operations with SAME key and body.
- 204/binary/CSV/redirect are not JSON. Errors may be generic; do not expect private internal error labels.
- Finance values are exact decimal strings; no JS Number rounding for money.
- Limited sync is a restricted entity subset, NOT a generic offline engine.
- Backend operator prerequisites (SMTP/worker/storage/erasure control) cannot be worked around with fake frontend endpoints.
