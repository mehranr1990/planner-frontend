# پرامپت‌های Claude Code — پروژه‌ها (بسته‌ی کامل)

## راه‌اندازی (یک بار)
1. پوشه‌های `design/shared` و `design/project` داخل zip را در ریپو کنار `design/` فعلی کپی کن. اگر بسته‌ی دسته‌ی الف را قبلاً گذاشته‌ای، هر دو پوشه را با این‌ها جایگزین کن. به فایل‌های Personal دست نزن.
2. پرامپت‌ها را به ترتیب و هر بار فقط یکی بده. بعد از هر کدام خودت در مرورگر ببین و تأیید کن، بعد سراغ بعدی برو.
3. اگر دسته‌ی الف (۰ تا ۷) را قبلاً زده‌ای، از پرامپت ۸ شروع کن و قبلش پرامپت «۰ب» را بده.

---

## دسته‌ی الف

### ۰ — بررسی فقط‌خواندنی (کد عوض نمی‌شود)
```
Read design/project/README.md, design/shared/SHARED.md, design/project/SCREENS.md and DECISIONS.md (SPEC.md only by section).
Then inspect only: src/features/navigation/contexts.ts and types.ts, the shell (context switcher, rail, mobile nav, breadcrumbs),
src/data/repositories.ts + domain.ts + provider, the Personal task detail drawer intercept, the sheet host, Personal board + calendar components, and src/messages/client.ts.
READ ONLY: no code changes, no dependencies, no commits.
Report: (1) what already exists that the Project screens reuse, (2) exact conflicts with DECISIONS D1–D19, (3) a step plan matching PROMPTS 1–21 with the files each step will touch. Then stop.
```

### ۱ — پوسته‌ی مشترک و حالت‌های دسترسی (SH-01 + SH-02)
```
Implement SH-01 and SH-02 only (design/shared). Update contexts.ts/types.ts for the Project context per DECISIONS D1, D2, D3, D6, D7, D8
(routes /projects/[id]/..., grouped ProjectRail + CollectionRail, mobile Overview·Tasks·(+)·Calendar·More, More sheet with every project module).
Extend the context switcher with the workspace list sections (Recent, Owned, Member, Invitations, Archived) from mock data;
Teams/Companies stay disabled “not available yet”. Add Breadcrumb, Quick Create target line, AccessState + AccessBanner
components with every state of SH02 and the Access.* copy (en+fa). Add mock projectRepo/invitationRepo with a capabilities object.
Every project module route that is not built yet renders the existing ComingSoon state until its prompt.
Hide NonPersonalAssistant on project routes. Do not touch /personal routes, @drawer or proxy.ts.
Add a demo-state switch for all SH02 states. Run tsc + eslint + targeted vitest. Commit, do not push. Stop.
```

### ۲ — همه‌ی پروژه‌ها (PJ-00)
```
Implement PJ-00 /projects only. Spec: design/project/SPEC.md “PJ-00”. Visual: screenshots/PJ00AllProjects*.jpg, mobile PJM01, Persian PJM02.
ProjectCard is a product card (no notch). Pills: All · Owned by me · Member · Invitations · Archived (server counts from the mock).
Invitation strip with Accept/Decline (public-safe preview only). Grid/List segmented. States: loading, empty first use, empty filtered,
error, archived tab. Copy from the Copy EN/FA tab. Light/dark, RTL, 390/1024/1440. tsc + eslint + targeted vitest. Commit, don't push. Stop.
```

### ۳ — نمای کلی پروژه (PJ-01)
```
Implement PJ-01 /projects/[id] only. Spec: SPEC.md “PJ-01” (read the S4 reconciliation, Rules, Permissions, Data tabs).
One SignatureCard (status) with notch action “Open tasks” → /projects/[id]/tasks; number + linear bar with expected-pace marker (no ring);
status note set by Manager+ via the status chip popover; MetricTile family; For you card with Accept/Decline (decline opens the
assignment-decline popover); Phases & timeline card (volt only on the now-dot); Next milestones; FolderTabsCard Activity · Risks & blockers · Team load
(team load hidden for Viewer/Guest, estimates only). Mock repos: milestoneRepo, activityRepo, riskRepo (read), workloadRepo (read), assignmentRepo.
All SH02 states. Light/dark, RTL, mobile. Gates, commit, stop.
```

### ۴ — کارهای پروژه، نمای فهرست (PJ-02)
```
Implement PJ-02 /projects/[id]/tasks (List) only, reusing Personal Tasks list components. Add Status (workflow) and Assignee-with-acceptance columns,
Phase grouping, dependency marker, view pills All · My tasks · Unassigned · Overdue · Completed, filters incl. milestone,
BulkBar with capability-aware partial message, quick add parsing @person/!priority/due/~estimate, conflict banner on revision mismatch.
Segmented List/Board/Flow: Board and Flow keep ComingSoon until prompts 8 and 9. Viewer/Guest behaviour per Permissions tab.
Mock workflowRepo (published statuses) + projectTaskRepo. Gates, commit, stop.
```

### ۵ — جزئیات کار پروژه (PJ-15) + نپذیرفتن / واگذاری دوباره
```
Implement PJ-15 /projects/[id]/tasks/[taskId] using the Personal task detail drawer pattern (soft-nav intercept, full page on hard load,
full screen on mobile) — add a separate intercept for this route, no catch-all. Head = SignatureCard, notch Mark done (Viewer: Copy link).
AssignmentBlock for the pending assignee (Accept / Decline with reason chips + note), managers see Remind / Reassign (assignment-reassign sheet from PJ-90).
Properties per spec; FolderTabs Comments · Subtasks · Links · Activity; dependency cycle error. Accepting adds the task to the Personal Tasks/Calendar
projection in the mock (source chip “Website Redesign”), never a copy. Gates, commit, stop.
```

### ۶ — برگه‌ها (PJ-90)
```
Implement PJ-90 sheets only: ?sheet=project-new (drawer; Team/Company association row disabled “available in a later phase”),
?sheet=project-invite (verified-only copy that never reveals whether an account exists; roles with descriptions; pending invites resend/cancel),
?sheet=assignment-reassign. Bottom sheets on mobile. Undo toasts. Gates, commit, stop.
```

### ۷ — مرور موبایل، فارسی و دارک دسته‌ی الف
```
QA pass for Batch A only: compare 390px with screenshots/PJM01ProjectMobile*.jpg, Persian RTL with PJM02ProjectFa*.jpg, dark with every *Dark.jpg.
Fix only differences in Batch A screens. Then run the full gate once (tsc, eslint, build, full vitest, existing e2e incl. axe) and report PASS/FAIL/NOT RUN.
Commit, do not push. Stop.
```

---

## دسته‌ی ب

### ۰ب — فقط اگر دسته‌ی الف قبلاً زده شده (فقط‌خواندنی)
```
The design package was updated: design/project now covers Batches B and C. Re-read design/project/README.md, SCREENS.md and DECISIONS.md (D11–D19 are new).
READ ONLY. Report what from Batch A must change (rail badges, More sheet entries, PJ-02 segmented links, mock repos) and the files PROMPTS 8–21 will touch. Stop.
```

### ۸ — بورد (PJ-03)
```
Implement PJ-03 /projects/[id]/board only (view mode of Tasks; segmented List/Board/Flow in the header). Spec: SPEC.md “PJ-03”. Visual: screenshots/PJ03ProjectBoard*.jpg, mobile PJM03 (snap pages), Persian PJM04.
Reuse the Personal board columns/cards; columns = published workflow statuses from workflowRepo; Done collapses cards older than 7 days.
Drag = transition request: optimistic move, server (mock) confirms; if the transition is not allowed for the role, the column shows the rose
“Not allowed” state and the card springs back with a toast. WIP limit badge per column (warn for members, confirm for Manager+). Swimlanes None/Phase/Assignee.
Keyboard (Space lift, arrows, Enter drop, Esc cancel) and live-region announcements as Personal board. Gates, commit, stop.
```

### ۹ — گردش کار (PJ-06)
```
Implement PJ-06 /projects/[id]/flow only: read-only SVG graph of the published workflow (status nodes with counts, arrows = allowed transitions)
plus the accessible table under it (the SVG is aria-hidden). Clicking a status opens the List filtered by it. “Edit in Settings” link only for Admin+.
RTL by coordinate mirroring. Not shown on phones (More › Flow opens the table). Gates, commit, stop.
```

### ۱۰ — فازها و نقاط عطف (PJ-08)
```
Implement PJ-08 /projects/[id]/milestones only. Spec: SPEC.md “PJ-08”. Left: phase list (drag to reorder, Manager+). Center: milestone rows (product cards, status chips Reached/Next/At risk/Planned).
Right: selected milestone as SignatureCard, notch = Edit milestone: progress, linked risk, tasks, “Open in Tasks (filtered)”.
Changing a milestone date that has dependents opens the schedule preview dialog (build it here as SchedulePreviewDialog, reused by Gantt).
Do NOT build the Journey view (proposal only). Mock phaseRepo, milestoneRepo, scheduleRepo.preview/apply. Mobile per PJM03, Persian per PJM04. Gates, commit, stop.
```

### ۱۱ — تقویم پروژه (PJ-07)
```
Implement PJ-07 /projects/[id]/calendar only by reusing the Personal Calendar (month/week/agenda, Shamsi/Gregorian) with the project as one blue scope layer:
task due dates, milestones, project events. Layer chips; “My personal busy” overlay off by default and shows only the current user’s own blocks as untitled hatched slots.
Drag a task chip = change due date if allowed; dependents → SchedulePreviewDialog. Mobile = agenda. Gates, commit, stop.
```

### ۱۲ — خط زمانی (PJ-04)
```
Implement PJ-04 /projects/[id]/timeline only: lanes by phase (default) or assignee, bars coloured by status (blocked = rose outline, min width 84px),
milestone diamonds on the axis, now line with the volt dot, zoom Weeks/Months/Quarter, overlap chip in assignee mode. Click bar → task drawer.
Drag bar ends → date change (+ preview if dependents). Plain SVG/CSS, no new dependency. RTL = coordinate mirroring. Mobile = grouped list (PJM03). Gates, commit, stop.
```

### ۱۳ — گانت (PJ-05)
```
Implement PJ-05 /projects/[id]/gantt only. Spec: SPEC.md “PJ-05” (all tabs). Sticky task table + SVG chart, zoom Days/Weeks/Months, FS/SS/FF/SF dependencies with lag/lead,
create by dragging from a bar end, Critical path toggle (mock computes locally). Any change that moves others → SchedulePreviewDialog (ghost bars, moved list,
milestone impact, “move dependents” vs “only this task”, one apply with expected revisions; conflict → SH02 conflict). Cycle → inline error.
Dependencies list tab = full keyboard alternative. RTL mirroring. Not on phones. No new dependency (no gantt library). Gates, commit, stop.
```

---

## دسته‌ی ج

### ۱۴ — ریسک‌ها و مسائل (PJ-09)
```
Implement PJ-09 /projects/[id]/risks only. Spec: SPEC.md “PJ-09”. Segmented Risks/Issues, pills Open/Mine/High+/Closed, register rows (product cards),
heat map severity × probability (D11) with keyboard cell filter, Open issues card. States: empty, issues tab, viewer. Mock riskRepo. Mobile summary tiles (PJM03), Persian (PJM04). Gates, commit, stop.
```

### ۱۵ — جزئیات ریسک (PJ-16)
```
Implement PJ-16 /projects/[id]/risks/[riskId] only, as a drawer with its own intercept (same shell as the project task drawer), full page on hard load, full screen on mobile.
Head = SignatureCard, notch Close risk (reason chips + note); issues: Resolve; Viewer: Copy link. Properties, Convert to issue, Edit, FolderTabs Mitigation (checklist, “Make task”) · History · Comments. Gates, commit, stop.
```

### ۱۶ — فایل‌ها (PJ-10)
```
Implement PJ-10 /projects/[id]/files only. Folder list (one level), file rows with states queued/uploading/scanning (download disabled)/ready/blocked/failed (retry),
drop zone, filters, preview SignatureCard (notch Download, disabled with reason while scanning), versions, linked tasks. Limits come from the mock “server config”, never hard-coded.
No storage meter. Mock fileRepo with timed progress → scan → ready. Guests see only shared files. Gates, commit, stop.
```

### ۱۷ — اعضا (PJ-13)
```
Implement PJ-13 /projects/[id]/members only. Segmented Members/Invitations/Guests, member rows with role popover (Undo toast), capacity per week, open task count,
pending invitations (resend/cancel), role guide card, remove-member preview (tasks become Unassigned), leave project, guest task grants with expiry.
Last Owner cannot be removed/demoted. Invite button opens ?sheet=project-invite. Mock memberRepo, invitationRepo, grantRepo. Gates, commit, stop.
```

### ۱۸ — بار کاری (PJ-11)
```
Implement PJ-11 /projects/[id]/workload only. Members × weeks grid (table semantics, hours + percent; blue up to capacity, rose over), Unassigned row, legend,
member-week SignatureCard with notch “Reassign a task” → ?sheet=assignment-reassign. Uses only project task estimates (D13); never Personal data. Mobile per PJM03. Gates, commit, stop.
```

### ۱۹ — تحلیل (PJ-12)
```
Implement PJ-12 /projects/[id]/analytics only. KPI tiles with source/denominator captions, burn-up and throughput as plain SVG (with “View as table”), by-status and by-assignee bars,
range segmented, Export snapshot (mock: client-side CSV), “data as of” line. Members see only their own assignee row. No score, no AI. Gates, commit, stop.
```

### ۲۰ — تنظیمات پروژه (PJ-14)
```
Implement PJ-14 /projects/[id]/settings only, one page with FolderTabs (?tab=general|workflow|fields|access|import|lifecycle). Spec: SPEC.md “PJ-14” incl. “Page tabs”.
Workflow: draft vs published, status list, transition matrix, migration preview → publish (D16). Fields: custom field list. Access: toggles.
Import: CSV upload → map → dry run (no changes) → import valid rows, error report. Lifecycle: template, archive/restore, transfer ownership (D17, reauth), delete (owner, reauth).
Dirty-state bar. Mobile: settings root list, workflow read-only. Mock workflowRepo, fieldRepo, importRepo, projectRepo lifecycle. Gates, commit, stop.
```

### ۲۱ — مرور نهایی دسته‌ی ب و ج
```
QA pass for Batches B and C: compare 390px with screenshots/PJM03ProjectMobile2*.jpg, Persian RTL with PJM04ProjectFa2*.jpg, dark with every *Dark.jpg,
and every tab capture (*__*.jpg). Fix only differences. Run the full gate once (tsc, eslint, build, full vitest, e2e incl. axe) and report PASS/FAIL/NOT RUN per screen.
Commit, do not push. Stop.
```

## نکته‌ها
- اگر Claude Code به چیزی رسید که در بوردها یا SPEC نیست، باید بگوید و منتظر بماند، نه این‌که خودش بسازد.
- تصمیم‌های D1 تا D19 در `DECISIONS.md` پیش‌فرض اعمال‌شده‌اند؛ اگر یکی را عوض کردی، اول همان‌جا عوض کن و بعد به Claude Code بگو.
- اتصال به بک‌اند واقعی جداست و فقط وقتی بک‌اند Phase 2 ساخته شد انجام می‌شود.

---

## به‌روزرسانی ۱۰ آبان — نمای Flow (برای کسی که پروژه را قبلاً زده)

### ۲۲ — Flow view با CaseFlow (PJ-06)
```
Read design/project/PEOPLE_FLOW.md §2, DECISIONS D20, SPEC “PJ-06 · Flow view” and screenshots/PJ06ProjectFlow*.jpg.
1) Build the shared CaseFlow component once in the shared components folder (accent prop; top-centre notch with people + badges ok/late/done/plus;
   stage columns max 5 rows + “+N more”; SVG connectors solid/dashed-red with dots; outcome tiles grid; aria-hidden lines + “Needs …” text; RTL via dir + scaleX(-1); phone = stacked columns).
2) PJ-06 ?view=flow: filter pills (All open tasks · each milestone · My tasks), CaseFlow of the filtered tasks (columns = workflow statuses except Done/Blocked, Blocked = row state,
   lines = task dependencies from the existing dependency data, outcome tiles = recently Done + milestone tile), then the existing workflow graph + table as the “Workflow” section.
3) Row click = task drawer; notch avatar click = filter by person; + = assign.
4) Fix PJ-08 mock: 3DS verification = Done.
Do not change other screens. tsc + eslint + targeted vitest (no e2e). Commit, don't push. Stop.
```
