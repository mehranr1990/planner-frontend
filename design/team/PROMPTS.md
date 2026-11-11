# پرامپت‌های Claude Code — تیم‌ها

## راه‌اندازی
0. فایل `design/team/PEOPLE_FLOW.md` دو کامپوننت مشترک (People & workload و Case Flow) را توضیح می‌دهد؛ اولین پرامپتی که به آن‌ها برسد آن‌ها را می‌سازد و بقیه فقط استفاده می‌کنند.
1. پوشه‌ی `design/team` داخل zip را کنار `design/project` در ریپو بگذار. به بقیه دست نزن.
2. قبلش پوسته‌ی پروژه‌ها (پرامپت ۱ بسته‌ی پروژه، SH-01/SH-02) باید زده شده باشد.
3. پرامپت‌ها را به ترتیب و هر بار فقط یکی بده؛ بعد از هر کدام خودت ببین و تأیید کن.

---

### T0 — بررسی فقط‌خواندنی
```
Read design/team/README.md, SCREENS.md, DECISIONS.md (SPEC.md only by section). Inspect contexts.ts/types.ts (team context), the shell implemented for Projects
(switcher, rails, AccessState), Project repos/assignment machinery, PJ-15 drawer intercept, PJ-10 files, sheet host, Personal Calendar and Goals components.
READ ONLY. Report reuse, conflicts with T1–T12, and a step plan for prompts T1–T19 with files per step. Stop.
```

### T1 — پوسته‌ی تیم (TS-01)
```
Implement TS-01 only: enable Teams in the context switcher (Your teams / Invitations / Archived from mock teamRepo), TeamCollectionRail, TeamRail (groups per T2),
mobile nav Overview·Work·(+)·Calendar·More + More sheet, ?sheet=team-status (manual status, clear-after, mock presenceRepo), team access states added to AccessState.
Routes /teams/[id]/… render ComingSoon until their prompt. Indigo scope via data-scope="team". Hide assistant FAB on team routes. Gates, commit, stop.
```

### T2 — همه‌ی تیم‌ها (TM-00)
```
Implement TM-00 /teams only. Spec SPEC.md “TM-00”. TeamCard (product), invitation strip with “joining does not give project access”, pills, Grid/List,
states empty/archived/loading. Project counts only of projects the viewer can open. Light/dark, RTL, mobile (TMM01). Gates, commit, stop.
```

### T3 — نمای کلی تیم (TM-01)
```
Implement TM-01 /teams/[id] only. Read the S5 reconciliation tab and design/team/PEOPLE_FLOW.md §1 first. If a shared PeopleWorkload component does not exist yet, build it first (accent prop, notch avatar picker radiogroup,
selected-person strip with Now working on only when shared + Message → Messages DM / Set status for self, A–Z rows with booked bars, status-only mode, RTL) and use it here full width at the top.
WeekCard signature (notch Open week plan),
Work FolderTabs In progress·Review·Blocked with source chips (team indigo / project blue only if viewer can open), team calendar week strip, Projects card,
bottom FolderTabs Activity·Check-ins·Recognition. Mock planRepo, presenceRepo, capacityRepo, teamCalendarRepo, activityRepo. Gates, commit, stop.
```

### T4 — کارهای تیم (TM-02)
```
Implement TM-02 /teams/[id]/work only (List + Board + Flow view modes). Flow = shared CaseFlow component from design/team/PEOPLE_FLOW.md §2 (build it first if it does not exist yet; accent prop, notch people badges, stage columns, SVG connectors, outcome tiles, RTL mirror, stacked phone layout); data = this week’s plan tasks + task dependencies (mock). Reuse Personal TaskRow/board + PJ-02 status/assignee columns; source column; “Include project tasks” toggle;
group by week plan; fixed team statuses (T4); quick add; assignment machinery. Project tasks open PJ-15 in the project context. Mock teamTaskRepo. Gates, commit, stop.
```

### T5 — جزئیات کار تیم (TM-15)
```
Implement TM-15 /teams/[id]/work/[taskId] with its own drawer intercept (pattern of PJ-15). Notch Mark done (Viewer: Copy link); assignment block; goal link; related project task link. Gates, commit, stop.
```

### T6 — برگه‌ها (TM-90)
```
Implement ?sheet=team-new and ?sheet=team-invite (team-status was done in T1). Company row disabled. Invite copy: never reveals account existence; project access separate. Gates, commit, stop.
```

### T7 — مرور دسته‌ی الف
```
QA Batch A against screenshots (light, *Dark, TMM01, TMM02). Fix differences only. Full gate once; report PASS/FAIL/NOT RUN. Commit, stop.
```

### T8 — تقویم تیم (TM-03)
```
Implement TM-03 /teams/[id]/calendar by reusing the Personal Calendar with the team layer: team events (title, time, invitees, agenda, external URL, RSVP), task dues,
time-off events, visible project events (blue), own busy overlay off by default. Event detail signature card (notch Open meeting link / Edit / Copy link). Mock teamEventRepo. Gates, commit, stop.
```

### T9 — برنامه‌ریزی هفتگی (TM-04)
```
Implement TM-04 /teams/[id]/planning (weekly mode) only: To plan list, people columns with booked/capacity, drag to plan+assign (keyboard “Plan for…”), week focus,
plan summary signature card (Publish plan → Open week work; Member: Open my tasks), Review last week tab with carry-over decisions. Mock planRepo. Gates, commit, stop.
```

### T10 — اسپرینت و بک‌لاگ (TM-05)
```
Implement TM-05 only, shown only when the team setting “Sprints” is on (mock flag): Backlog ranking, Sprint card (goal, dates, burndown SVG, notch Complete sprint),
Start/Complete dialogs, Reviews tab; “sprints off” empty state otherwise. No per-person velocity. Gates, commit, stop.
```

### T11 — پروژه‌های تیم (TM-06)
```
Implement TM-06 /teams/[id]/projects only: portfolio table + timeline of projects the viewer can open (Team-owned / Linked), Link a project request flow (project owner approves),
New team project → ?sheet=project-new with owner = team. No hidden counts. Mock projectAssociationRepo. Gates, commit, stop.
```

### T12 — اهداف تیم (TM-07)
```
Implement TM-07 /teams/[id]/goals by reusing Personal Goals components with team scope; KR sources (auto / linked task / manual), pace chip, linked work; notch Update progress. Mock teamGoalRepo. Gates, commit, stop.
```

### T13 — افراد و ظرفیت (TM-08)
```
Implement TM-08 /teams/[id]/people only: PeopleWorkload strip (shared component, rows hidden) at the top drives the selection of the table row and person card; member rows (manual status, role popover, capacity, this-week booking), Invitations tab, person signature card (notch Assign a task),
capacity editor, move to another team and remove previews (tasks → Unassigned). No ranking. Mock teamMemberRepo, capacityRepo. Gates, commit, stop.
```

### T14 — چک‌این (TM-09)
```
Implement TM-09 /teams/[id]/checkins only: your check-in signature card (3 questions, suggested done tasks, notch Send → Edit until close), replies list with comments and
“Make task from blocker”, who-replied card with one reminder per week, week switcher, closed state. No mood, no streaks. Mock checkinRepo. Gates, commit, stop.
```

### T15 — قدردانی و بازخورد (TM-10)
```
Implement TM-10 /teams/[id]/recognition only: Thanks composer (signature, notch Send thanks, visibility Team / Only recipient), thanks feed, Feedback tab (requests, private 1:1 notes).
No counts per person anywhere. Mock recognitionRepo, feedbackRepo. Gates, commit, stop.
```

### T16 — فایل‌های تیم (TM-11)
```
Implement TM-11 /teams/[id]/files by reusing the PJ-10 Files component with team folders and scope. Gates, commit, stop.
```

### T17 — تحلیل تیم (TM-12)
```
Implement TM-12 /teams/[id]/analytics only: KPI tiles with source captions, planned-vs-done SVG with “View as table”, project progress (visible projects), work mix (others aggregated for Lead/Admin),
export snapshot. Team-level only. Gates, commit, stop.
```

### T18 — تنظیمات تیم (TM-14)
```
Implement TM-14 /teams/[id]/settings only with FolderTabs General·Planning·Access·Lifecycle. Planning mode switch rules (weekly→sprint draft; sprint→weekly requires completing the sprint),
check-in schedule, status toggle; lifecycle: transfer (successor accepts + reauth), archive, Join a company disabled, delete (owner, reauth). Gates, commit, stop.
```

### T19 — مرور نهایی
```
QA Batches B and C against screenshots (light, dark, tab captures, TMM01, TMM02). Fix differences only. Full gate once; report PASS/FAIL/NOT RUN per screen. Commit, stop.
```

## نکته‌ها
- اگر Claude Code به چیزی رسید که در بوردها نیست، باید بپرسد.
- موارد باز در `DECISIONS.md › OPEN` است؛ تا تو تصمیم نگرفته‌ای، Claude Code باید پیش‌فرض طراحی را بزند و جای تصمیم را علامت بگذارد.
