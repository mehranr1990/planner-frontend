# design/team — Teams (Phase 3) · complete package

**For Claude Code.** Read this file, then `SCREENS.md`, `DECISIONS.md`, and only the `SPEC.md` section of the screen you are building.
Prerequisite: the Projects package is in place (`design/shared/`, `design/project/`) and its shell work (SH-01/SH-02) is implemented — Team reuses those components.
This package only ADDS `design/team/`. Do not touch `design/` Personal files or `design/project/`.

## What is designed
- **Batch A** — TS-01 team shell & access additions · TM-00 All teams · TM-01 Overview · TM-02 Work (List + Board view) · TM-15 Task detail · TM-90 sheets (team-new, team-invite, team-status).
- **Batch B** — TM-03 Calendar · TM-04 Weekly planning · TM-05 Sprint & backlog (optional) · TM-06 Projects (portfolio) · TM-07 Goals.
- **Batch C** — TM-08 People & capacity · TM-09 Check-ins · TM-10 Recognition & feedback · TM-11 Files · TM-12 Analytics · TM-14 Settings.
- **Variants** — dark for every board (`…Dark`); mobile 390 `TMM01TeamMobile`; Persian RTL `TMM02TeamFa`.

## Files
```
design/team/  README.md · PEOPLE_FLOW.md · SPEC.md · SCREENS.md · DECISIONS.md · PROMPTS.md
              boards/TS01, TM00…TM15, TM90, TMM01, TMM02 (+Dark) + support.js · screenshots/ (48 jpg)
```
Serve boards with `npx serve design/team/boards`; folder tabs are clickable. Board files are large — grep / targeted extraction only.

## Non-negotiable (in addition to the locked Personal and Projects rules)
1. Teams scope colour = indigo (`data-scope="team"`, `--team-deep #4343C8`, soft `#ECECFF`, dot `#8B8BFF`; dark deep `#A5A5F5`, soft `#2C2E5E`). Project references inside Team pages stay Projects blue. “In review” status uses teal in Team so it never looks like the scope colour. Volt only for “now/today”.
2. Signature cards (notch never empty): TM-01 This week (Open week plan) · TM-03 event (Open meeting link / Edit / Copy link) · TM-04 plan summary (Publish plan → Open week work; Member: Open my tasks) · TM-05 sprint (Complete sprint) · TM-07 goal (Update progress) · TM-08 person (Assign a task) · TM-09 your check-in (Send) · TM-10 composer (Send thanks) · TM-15 task head (Mark done / Copy link) · TM-11 file preview (Download, as PJ-10). Everything else = product cards.
3. **Team membership never grants project access.** Project rows/counts/titles appear only for projects the viewer can open (forbidden = not found, no hidden counts). Hours from other projects may appear only as untitled hours.
4. **Privacy:** no Personal data anywhere (mood, journal, focus, finance, time blocks, personal goals). Status is manual only (owner decision). Check-ins = 3 work questions, no mood/scores. No rankings, leaderboards, per-person performance charts, or recognition counts.
5. Reuse: Project assignment machinery, PJ-15 drawer pattern, PJ-10 Files, PJ-90 sheets, Personal Calendar / Goals / TaskRow / Board / FolderTabsCard / MetricTile / Undo toast.
6. Mock adapters only (backend Phase 3 not built); repository names in each SPEC “Data & backend” tab; never invent endpoints.
7. Permissions tables → mock `capabilities` per team; hidden vs disabled per SH-02.
8. i18n namespaces: `Teams`, `Team`, `TeamWork`, `TeamTask`, `TeamCal`, `Planning`, `Sprint`, `Backlog`, `TeamProjects`, `TeamGoals`, `People`, `Checkins`, `Recognition`, `Feedback`, `TeamAnalytics`, `TeamSettings`, `TeamNew`, `TeamInvite`, `TeamStatus` (en + fa, identical keys).
9. Not in Team: AI assistant, messaging (Phase 5), polls/votes, corrective actions (moved to Company), company attachment (Phase 4, shown disabled), paywall/quota.
10. One screen per task · stop after each · commit, don’t push · no new dependencies (charts plain SVG) · tsc + eslint + targeted vitest.
11. If something is not in the boards/spec: stop and ask.


## Update 10 Nov 2026
Shared components **PeopleWorkload** and **CaseFlow** restored from the concept boards → read `PEOPLE_FLOW.md`. Affected boards: TM-01 (full), TM-08 (strip) TM-02 Flow view. Build each component once; the first prompt that needs it builds it.
