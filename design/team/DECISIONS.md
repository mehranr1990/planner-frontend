# Teams — decision ledger

## APPROVED (owner documents + owner answers 2 Nov 2026)
- Phase 3 = independent Teams; Company association only in Phase 4 (shown disabled).
- Roles Owner / Admin / Lead / Member / Viewer; same person may have different roles in different teams.
- Team membership does NOT grant access to projects; per-project grants only.
- Team tasks / goals / calendar use the same engines; weekly planning; sprint / backlog / review optional; capacity and portfolio dashboards with transparent sources; light meetings (event, invite, agenda).
- Recognition public/private and feedback; no covert scoring; no monetary punishment.
- **Owner answer:** corrective / disciplinary actions are NOT designed in Team → move to Company (Phase 4) with the employee file.
- **Owner answer:** Sprints and backlog are optional per team (Settings › Planning); weekly plan is the default.
- **Owner answer:** presence = manual status set by the person (Available / Busy / Away / Off today + note + clear after). Nothing inferred from calendars or activity.
- **Owner answer:** check-in = three work questions (Did · Next · Blocked by), weekly, no mood, no scores.
- No AI assistant; no messaging (Phase 5); no paywall; notch never empty.

## APPLIED DEFAULTS (design proposals — owner may override)
| # | Decision | Applied | Alternative |
|---|---|---|---|
| T1 | URLs | `/teams/[id]/…` | active team in state |
| T2 | Rail | 3 groups + Settings: [Overview, Work, Calendar, Planning] [Projects, Goals, People, Analytics] [Check-ins, Recognition, Files] | flat list from contexts.ts |
| T3 | Activity | Tab on Overview (no route) | own route |
| T4 | Team task statuses | Fixed simple set: To do · In progress · Review · Blocked · Done (no team workflow editor) | versioned workflow like Projects |
| T5 | Work list | Includes project tasks of team members in projects the viewer can open (toggle, default on) | team tasks only |
| T6 | Booked % | Estimates of team + project tasks planned this week ÷ weekly capacity set per member | task counts |
| T7 | Time off | Person adds a team event of kind “time off” (not presence, not personal calendar) | none |
| T8 | Team projects | Two relations: Team-owned (created under the team) and Linked (project owner approves) | linked only |
| T9 | Feedback | Private 1:1 (writer + recipient only), Leads don’t see it by default | visible to Lead |
| T10 | Analytics | Team-level only; no per-person charts | per-person view for Leads |
| T11 | Mobile nav | Overview · Work · (+) · Calendar · More | Overview · Work · Calendar (code) |
| T12 | Late check-ins | Allowed 24h after closing, “late” visible only to author | not allowed |

## OPEN (Claude Code must NOT invent)
- Manual status storage scope (per team vs global by default) — design shows per team with a “same in all my teams” toggle.
- Check-in default schedule (proposed Sat 09:00 → Wed 18:00).
- Whether Viewers may see this-week booking (default off).
- Whether a team may have more than one Owner (design: exactly one).
- Delete-team retention period (backend retention policy pending).

## DEVIATIONS FROM S5 BOARD
- Removed: “now working on”, live presence, members cards with empty notches, decisions/votes, check-in mood, Message button, Assistant FAB. See TM-01 “S5 reconciliation” tab.

## OWNER UPDATE · 10 Nov 2026 — concept components restored
- Owner asked to bring back **People & workload** (S5 Team) and **Case Flow** (notched board). Spec: `PEOPLE_FLOW.md` (shared components, accent per context).
- People & workload: TM-01 (full), TM-08 (strip).
- Case Flow: TM-02 Flow view.
- “Now working on” is back only as an opt-in share in Set status (supersedes the TM-01 S5 note “removed”).
- Message button in the strip opens a DM in Messages (Messages context is designed).
- TM-02 Flow needs task dependency links for team tasks (mock until P3 backend confirms).
