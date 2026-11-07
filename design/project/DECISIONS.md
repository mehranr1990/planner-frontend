# Projects — decision ledger

## APPROVED (from owner documents — do not re-ask)
- Phase order P2 Projects → P3 Teams → P4 Companies → … ; Personal P01–P18 locked.
- Project roles Owner / Admin / Manager / Member / Viewer + verified external collaborator with narrow grant (no anonymous guests).
- Phases, Sections, Milestones; no nested subprojects. Independent projects only in P2 (Team/Company association = future interface, shown disabled).
- Assignment Pending / Accepted / Declined (reason on decline), independent from task status; accepted task = projection in Personal Tasks / My Calendar, private time block optional.
- Versioned workflow with custom statuses; dependencies FS/SS/FF/SF with lag; no automatic reschedule without preview.
- Risk/issue register (severity, probability, owner, mitigation, history); files, comments, audit; estimates, workload, reports.
- All features free; no paywall, no quota enforcement (2-project cap is a future candidate only).
- AI deferred; Assistant FAB not shown in new contexts.
- Notch never empty (always one real action, or two with the double notch).

## APPLIED DEFAULTS (proposed by design, applied — owner may override)
| # | Decision | Applied | Alternative |
|---|---|---|---|
| D1 | URLs | `/projects/[id]/…` with id in the URL | Keep current code `/projects/tasks` + active workspace in state |
| D2 | Project rail | 3 groups + Settings: [Overview, Tasks, Timeline, Gantt, Calendar] [Milestones, Risks, Workload] [Members, Files, Analytics] | Flat 9-item rail from doc 02 |
| D3 | Board / Flow | View modes inside Tasks (segmented List/Board/Flow), routes kept (`/board`, `/flow`) | Separate rail items |
| D4 | Budget | Not on Project screens (Company, Phase 4) | Keep budget tile as proposal |
| D5 | Variants | Dark for every board; mobile + Persian as per-context validation boards | Every screen × every variant |
| D6 | Code ids | `case-flow` → `flow`, `docs` → `files` in `contexts.ts` | keep old ids |
| D7 | Collection rail | `/projects` shows All projects + 4 recent projects + New project | No rail on collection page |
| D8 | Mobile nav | Overview · Tasks · (+) · Calendar · More | Overview · Tasks · (+) · Board · More (doc 02) |
| D9 | Project status | Set manually by Manager+ with a short status note (not computed, no AI) | Computed health |
| D10 | Sheet ids | `project-new`, `project-invite`, `assignment-reassign`, `assignment-decline` | — |
| D11 | Risk scales | Severity Low/Medium/High/Critical × probability Low/Medium/High; heat map = cell, no numeric score | 5×5 numeric score |
| D12 | Risk vs issue | One register, segmented Risks / Issues; risk → “Convert to issue” keeps history | Two separate pages |
| D13 | Workload source | Estimates of open tasks spread evenly start→due; capacity = weekly project hours per member (Members page); pending assignments counted | Task count only |
| D14 | Files | One folder level + smart filters; versions by re-upload; scan before download; limits from server only | Nested folders |
| D15 | Settings | One page, folder tabs General · Workflow · Fields · Access · Import · Lifecycle; members on PJ-13 | Separate settings pages |
| D16 | Workflow versions | Draft → publish with migration preview; tasks always on published version | Live editing |
| D17 | Ownership transfer | Successor (Admin/Manager) accepts → owner re-enters password; owner stays until accepted | Immediate transfer |
| D18 | Phone scope | No Gantt, no Flow graph, no workflow editing on 390px; Board = snap pages | Full parity |
| D19 | Goal Milestone Path | Offered only as optional “Journey” view on PJ-08 (proposal tab), list is default | Use it as default |

## OPEN (needs owner decision later — Claude Code must NOT invent)
- Exact capability matrix per endpoint (backend ADR pending). Design uses the permission tables in SPEC.md as the UI contract; adjust when backend publishes capabilities.
- Whether Viewers may comment (project setting proposed, default off).
- Default workflow statuses (proposed: To do · In progress · In review · Blocked · Done, with Persian labels).
- Capacity source for Team load / Workload (applied as D13; confirm).
- Members may invite Viewers (Settings › Access, default off).
- Guest grant default expiry (proposed 30 days).
- CSV import Undo window (proposed 10 minutes) and max rows (from server).
- Who approves a Member’s date change that moves dependents (proposed: Manager+).
- Analytics week start per locale (proposed: Saturday fa, Monday en — follows Personal setting).

## DEVIATIONS FROM SOURCE DOCS
- `09_LOCKED_DESIGN_SYSTEM.md` listed “Board” as a rail item (doc 02); applied D3 instead (view mode = segmented per tab rules).
- S4 board elements removed: ring, budget, kanban preview, AI insight, Assistant FAB, header tabs (see PJ-01 “S4 reconciliation” tab).
