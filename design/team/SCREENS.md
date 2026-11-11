# Teams — screen registry

All designed ✅ (awaiting owner approval). Backend Phase 3 not built → mock adapters.

| ID | Route | Screen | Batch | Board | New components (rest = reuse) | Backend (V3) |
|---|---|---|---|---|---|---|
| TS-01 | (shell) | Switcher Teams row, team rails, mobile nav, status sheet, team access states | A | `TS01TeamShell` | TeamRail, TeamCollectionRail, PresenceDot/StatusChip | P3-01 |
| TM-00 | `/teams` | All teams | A | `TM00AllTeams` | TeamCard, TeamInvitationStrip | P3-01 |
| TM-01 | `/teams/[id]` | Overview | A | `TM01TeamOverview` | WeekCard, PeopleCard, SourceChip (team/project) | P3-01/02/03, **PeopleWorkload** |
| TM-02 | `/teams/[id]/work` (Board: `/teams/[id]/work?view=board`) | Work | A | `TM02TeamWork` | — (TaskRow + source column) | P3-02, **CaseFlow (Flow view)** |
| TM-15 | `/teams/[id]/work/[taskId]` | Task detail drawer/page | A | `TM15TeamTaskDetail` | — (PJ-15 drawer) | P3-02 |
| TM-90 | `?sheet=team-new · team-invite · team-status` | Sheets | A | `TM90TeamSheets` | StatusSheet | P3-01 |
| TM-03 | `/teams/[id]/calendar` | Calendar + team events | B | `TM03TeamCalendar` | TeamEventDetail (agenda, RSVP) | P3-02/04 |
| TM-04 | `/teams/[id]/planning` | Weekly planning + review | B | `TM04TeamPlanning` | PlanBoard (people columns), PlanSummary | P3-02/03 |
| TM-05 | `/teams/[id]/planning?tab=sprint·backlog·reviews` | Sprint & backlog (only if enabled) | B | `TM05TeamSprint` | BacklogList, SprintCard, Burndown | P3-02 |
| TM-06 | `/teams/[id]/projects` | Projects portfolio | B | `TM06TeamProjects` | PortfolioTable, PortfolioTimeline | P3-01 (+P2-03 association) |
| TM-07 | `/teams/[id]/goals` | Goals | B | `TM07TeamGoals` | — (Personal Goals components) | P3-02 |
| TM-08 | `/teams/[id]/people` | People & capacity | C | `TM08TeamPeople` | MemberRow, PersonCard, CapacityEditor | P3-01/03, **PeopleWorkload (strip)** |
| TM-09 | `/teams/[id]/checkins` | Check-ins | C | `TM09TeamCheckins` | CheckinForm, CheckinReply | P3-02/04 |
| TM-10 | `/teams/[id]/recognition` | Thanks & feedback | C | `TM10TeamRecognition` | ThanksComposer, ThanksCard, FeedbackInbox | P3-04 |
| TM-11 | `/teams/[id]/files` | Files | C | `TM11TeamFiles` | — (PJ-10) | P3 files |
| TM-12 | `/teams/[id]/analytics` | Analytics | C | `TM12TeamAnalytics` | PlanVsDone chart | P3-03 |
| TM-14 | `/teams/[id]/settings?tab=general·planning·access·lifecycle` | Settings | C | `TM14TeamSettings` | — (FolderTabs + setting rows) | P3-01/02/05 |

## Mobile & locale
- Mobile 390 `TMM01TeamMobile`: TM-00, 01, 02, 15, 04, 03 (agenda), 08, 09, 10. Not on phones: planning drag (sheet instead), portfolio timeline, check-in schedule editing.
- Persian RTL `TMM02TeamFa`: TM-01, 02, 09, 08.
- Dark: every board `…Dark`.

## Required states
SH-02 + TS-01 team states on every route, plus each board's States tab (empty, published/draft plan, sprints off, sent/closed check-in, link request, etc.).
