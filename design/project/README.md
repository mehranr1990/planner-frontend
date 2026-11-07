# design/project — Projects (Phase 2) · complete package

**For Claude Code.** Read this file, then `../shared/SHARED.md`, then `SCREENS.md`, `DECISIONS.md`, and only the `SPEC.md` section of the screen you are building.
Personal design files stay exactly where they are (`design/CLAUDE.md`, `design/PERSONAL.md`, `design/boards/`, `design/screenshots/`). This package only ADDS `design/shared/` and `design/project/`.
If you already copied the Batch A package: replace both folders with these (Batch A boards are unchanged; docs are updated).

## What is designed (all of it)
- **Batch A** — SH-01 shell · SH-02 access states · PJ-00 All projects · PJ-01 Overview · PJ-02 Tasks (List) · PJ-15 Task detail · PJ-90 sheets.
- **Batch B** — PJ-03 Board · PJ-06 Flow · PJ-08 Phases & milestones · PJ-07 Calendar · PJ-04 Timeline · PJ-05 Gantt.
- **Batch C** — PJ-09 Risks & issues · PJ-16 Risk detail · PJ-10 Files · PJ-13 Members · PJ-11 Workload · PJ-12 Analytics · PJ-14 Settings.
- **Variants** — dark for every board (`…Dark`); mobile 390 `PJM01` (A) + `PJM03` (B+C); Persian RTL `PJM02` (A) + `PJM04` (B+C).

Build order and one prompt per screen are in `PROMPTS.md` (Persian, for the owner to paste).

## Files
```
design/shared/   SHARED.md · boards/SH01ContextShell(.Dark) · SH02AccessStates(.Dark) · screenshots/
design/project/  README.md · SPEC.md · SCREENS.md · DECISIONS.md · PROMPTS.md
                 boards/PJ00…PJ16, PJ90, PJM01–PJM04 (+Dark) + support.js · screenshots/ (60 jpg)
```
Boards: serve the folder (`npx serve design/project/boards`); folder tabs under each screen are clickable. Board files are large: read with grep / targeted extraction, never whole. `SPEC.md` holds the same text as the tabs.

## Non-negotiable (in addition to the locked Personal rules)
1. Projects scope colour = blue (`data-scope="project"`, `--scope-deep #0F5BA8`). Never black surfaces. Volt only for "now" (timeline/Gantt now-dot, PJ-01 phases dot, mobile timeline today banner).
2. Card geometry & tab families exactly as `P00CardsTabs`. Signature cards (notch) in Project: PJ-01 status (Open tasks), PJ-15 head (Mark done / Copy link), PJ-08 milestone detail (Edit milestone), PJ-16 head (Close risk / Resolve / Copy link), PJ-10 file preview (Download), PJ-11 member-week (Reassign a task). **Notches are never empty.** Everything else is a product card.
3. Reuse Personal components first (TaskRow, BoardColumn, Calendar month/week/agenda, drawer + intercept pattern, sheet host, FolderTabsCard, MetricTile, Undo toast, BulkBar, EmptyState). New components only where `SCREENS.md` lists them.
4. Data: repositories with **mock adapters only** (names in each SPEC "Data & backend" tab). Backend Phase 2 does not exist — never call it, never invent endpoint URLs.
5. Permissions: each screen's Permissions table → a mock `capabilities` object per project from the repo; UI never derives rights from the role label. Hidden vs disabled rule from SH-02. Forbidden = not found.
6. Every state in a board's **States** tab and SH-02 must be reachable via a demo-state switch (`?state=…` in styleguide/dev).
7. i18n: namespaces per screen (`Projects`, `Project`, `ProjectTasks`, `ProjectTask`, `ProjectBoard`, `Milestones`, `ProjectCalendar`, `Timeline`, `Gantt`, `Risks`, `Risk`, `Files`, `Members`, `Workload`, `Analytics`, `ProjectSettings`, `Access`, `ContextShell`) in en + fa with identical keys; copy in each "Copy EN/FA" tab.
8. Privacy: nothing from Personal (journal, mood, focus, finance, time blocks, other projects) is ever shown or used in Project screens. The only bridge is the accepted-assignment projection into Personal Tasks/Calendar and the current user's own untitled busy overlay (PJ-07, off by default).
9. Do not change `/personal/*` routes, the `@drawer` intercept rules or `proxy.ts`. Project drawers (task, risk) get their own intercepts — no catch-all.
10. Assistant FAB hidden on all project routes. No AI, no paywall/quota, no audio/video, no offline sync.
11. One screen per task · stop after each · commit, do not push · no new dependencies (Gantt and charts are plain SVG) · tsc + eslint + targeted vitest per task.
12. If something is not in the boards/spec: stop and ask; do not invent.
