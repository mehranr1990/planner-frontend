# Companies (Phase 4) — design spec · COMPLETE (Batches A + B + C)

Status: **all Company screens designed, awaiting owner approval.** Read with `README.md`, `SCREENS.md`, `DECISIONS.md`, `../shared/SHARED.md`, and the Projects + Teams packages (Company reuses their components).
Every section is extracted from the board's folder tabs. Visuals: `screenshots/<Board>.jpg`, dark `<Board>Dark.jpg`, tab captures `<Board>__<Tab>.jpg`.

---

## CS-01 · Company shell & access  
Batch A · `boards/CS01CompanyShell.dc.html` · `screenshots/CS01CompanyShell.jpg` · dark: `CS01CompanyShellDark`

Shell additions on top of `../shared` SH-01 / SH-02.

- **Context switcher** — Companies row enabled; list: Your companies (role + department) · Invitations · All companies / New company. Each company is an isolated custody boundary (no cross-company search, counts or Quick Create targets).
- **Department scope** — header chip “All departments ▾” narrows data the user may already see; never widens access.
- **Company rail** — G1 Overview · Departments · People | G2 Projects & teams · Goals · Resources | G3 Expenses · Approvals (badge = for me) · Budgets | G4 Knowledge · Reports | Settings. Hidden when not permitted.
- **Changed from code** — contexts.ts company nav [overview, departments, projects, people, goals, finance, assets, approvals, reports] → /companies/[id]/…; projects → work, finance → expenses + budgets, assets → resources, knowledge added.
- **Mobile** — Overview · Work · (+) · Approvals · More; department scope sheet.
- **Company access states (add to SH-02)** — Sealed employee file (Request access, audited) · Mandatory policy lock (“Set by Euroly · mandatory”) · Outside your department (names only) · Attach pending (nothing visible until owner consents) · Left the company · Not counted yet (pending expenses / unsettled reimbursements).



## CO-00 · All companies  
Batch A · `boards/CO00AllCompanies.dc.html` · `screenshots/CO00AllCompanies.jpg` · dark: `CO00AllCompaniesDark`

#### States · 3

- **Empty** — No companies yet · Create your organisation or accept an invitation. · New company
- **Archived** — Archived companies are read-only; Owner can restore.
- **Left** — Companies you left are not listed.

#### Rules

- **Job** — Pick the company. Multiple independent companies per account; each is isolated.
- **Card** — Product card: initials, name, my role (+ department), people, departments, approvals waiting for me.
- **Invitation** — Public-safe preview: company, role, department. Accept creates a work profile; personal data is never shared.
- **No quota** — No company limit or upsell (all features free).


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Companies, my role, counts | P4-01 | Not built | companyRepo.list |
| Invitations | P4-01 | Not built | companyInvitationRepo.list / accept / decline |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Companies.title | All companies | همه‌ی شرکت‌ها |
| Companies.new | New company | شرکت جدید |
| Companies.approvals | {n} approvals for you | {n} تأیید منتظر شما |



## CO-01 · Company overview  
Batch A · `boards/CO01CompanyOverview.dc.html` · `screenshots/CO01CompanyOverview.jpg` · dark: `CO01CompanyOverviewDark`

#### S6 reconciliation

| S6 zone | Becomes | Why |
| --- | --- | --- |
| “Company health 82” ring + score history | Portfolio signature card: projects on track (12/14) with quarter history of the same ratio | owner decision: transparent KPIs, no composite score |
| Metric tiles (projects, teams, people, goals) | MetricTile family with source captions | kept |
| Key risk banner | Watch banner with its source (capacity) | no inferred risk without source |
| Executive insight + “Plan allocation” | Removed | AI deferred |
| Departments · Portfolio · Goals · Capacity tabs | FolderTabs (same) | locked tab family |
| Budget Q4 bars | Budget card: approved / committed / left, pending not counted | backend rule |
| Approvals with ✓ / ✕ buttons | Rows with “Review” → approval drawer | approve only after seeing the detail |
| Assistant FAB | Removed | AI deferred |


#### Rules

- **Job** — Executive glance for Owner / Org Admin / Dept managers: portfolio, people, goals, money, approvals. Department selector narrows it.
- **Signature card** — Projects on track / active (status from each project); quarter history; notch Open portfolio → CO-04.
- **Every number has a source** — Tile captions name source and denominator. No composite score, no AI, no prediction.
- **Budget** — Approved + committed vs budget; pending claims shown as text, never in bars.
- **Approvals** — Only items where the viewer is the current step’s reviewer. Review opens CO-09 drawer.
- **Member view** — Members see Overview without Budget and Approvals; tiles limited to what they can see (their department / teams).


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| View overview | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See all departments | ✓ | ✓ | — | — | — | — |
| See budget card | ✓ | ✓ | ✓ | — | — | — |
| Export | ✓ | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Portfolio status counts + history | P4-05 reports | Not built | companyReportRepo.portfolio(quarter, dept) |
| Tiles (teams, people, goals) | P4-01/02/05 | Not built | companyRepo.summary |
| Budget summary | P4-03 | Not built | budgetRepo.summary(quarter, dept) |
| Approvals for me | P4-04 approval engine | Not built | approvalRepo.inbox() |
| Capacity watch | P4-02 capacity | Not built | capacityRepo.dept(month) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Company.portfolio | projects on track | پروژه طبق برنامه |
| Company.openPortfolio | Open portfolio | باز کردن پورتفولیو |
| Company.reviewApprovals | Review approvals · {n} | بررسی تأییدها · {n} |
| Company.budget.pendingNote | Pending claims are not counted until approved. | درخواست‌های در انتظار تا تأیید حساب نمی‌شوند. |
| Company.watch | Watch | زیر نظر |



## CO-02 · Departments  
Batch A · `boards/CO02Departments.dc.html` · `screenshots/CO02Departments.jpg` · dark: `CO02DepartmentsDark`

#### Rules

- **Structure** — Company → Departments → Units / Teams. Teams may belong to a department (after attach, CO-04). Multi-membership allowed (a person can be in two departments).
- **Tree** — Expand/collapse, drag to re-parent (Org Admin) with a preview of moved people/budgets; Chart view = read-only org chart.
- **Department card** — Signature card; notch Edit department (Org Admin / that Dept Manager); others: Copy link.
- **Policies** — Mandatory · Default (override with reason, audited) · Optional — the inherited list for this department with override state.
- **Not data spaces** — Departments are not separate data custody; they scope grants and reporting inside the one company boundary.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| See tree | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See other department details | ✓ | ✓ | — | — | — | — |
| Create / move / delete department | ✓ | ✓ | — | — | — | — |
| Edit own department | ✓ | ✓ | ✓ | — | — | — |
| Override default policy | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Departments, units, membership | P4-01 | Not built | deptRepo.tree / create / move / update |
| Policy inheritance | P4-01 policies | Not built | policyRepo.effective(deptId) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Departments.title | Departments | دپارتمان‌ها |
| Departments.new | Department | دپارتمان |
| Policy.mandatory | Mandatory | اجباری |
| Policy.default | Default | پیش‌فرض |
| Policy.optional | Optional | اختیاری |



## CO-03 · People directory  
Batch A · `boards/CO03CompanyPeople.dc.html` · `screenshots/CO03CompanyPeople.jpg` · dark: `CO03CompanyPeopleDark`

**Main screen:** department pills → PeopleWorkload card for the department (see `PEOPLE_FLOW.md` §1), then the directory + Work profile card.

#### Rules

- **Work profile ≠ employee file** — Directory shows the work profile only: position, department, supervisor, status, verified work contacts, work hours, location, assigned equipment. The sealed employee file is CO-12.
- **Profile card** — Signature card; notch Edit work profile (Org Admin / HR grant); others: Copy contact.
- **Status** — Active · On leave · Left (left people disappear from the directory; their records stay for retention).
- **Personal data** — Nothing from Personal is shown; personal contacts only if the person adds them to the work profile.
- **People & workload** — Notched PeopleWorkload card per department (pills above it: All · each department, server counts). Notch = avatar picker A–Z (8 + “+N” → directory filtered). Selection drives the strip, the highlighted directory row and the work-profile card. Status = manual (same as Teams). Workload bars only for Owner / Org Admin / that department’s manager; everyone else sees status rows. “Now working on” only if the person shares it. “All” shows departments as rows (people count + average booked) instead of avatars.
- **Invite** — ?sheet=company-invite with role, department, position, supervisor.
- **Scope** — Dept-scoped roles see only their department’s people in full; others as name + department.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| See directory (names, departments) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See department workload bars | ✓ | ✓ | ✓ | — | — | — |
| See full work profile | ✓ | ✓ | ✓ | own | — | — |
| Edit work profile | ✓ | ✓ | — | — | — | — |
| Invite / deactivate | ✓ | ✓ | — | — | — | — |
| Request file access | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Directory + work profiles | P4-02 staff work profile | Not built | staffRepo.list / get / update |
| Equipment assigned | P4-02 resources | Not built | resourceRepo.byPerson |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| People.directory | Directory | فهرست افراد |
| People.file.sealed | Employee file · sealed | پرونده‌ی کارمند · مهروموم |
| People.file.request | Request access | درخواست دسترسی |
| People.status.leave | On leave | در مرخصی |



## CO-90 · Company sheets  
Batch A · `boards/CO90CompanySheets.dc.html` · `screenshots/CO90CompanySheets.jpg` · dark: `CO90CompanySheetsDark`

#### Rules

- **Ids** — company-new · company-invite · department-new (no collisions).
- **Create** — Creator = Owner. Currency and fiscal year set once (currency locked after first approved expense).
- **Invite** — Role (Org Admin · Dept Manager · Team Lead · Member · Viewer), department, position, supervisor.
- **Department** — Parent, manager; inherits policies with a summary line.


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| CompanyNew.title | New company | شرکت جدید |
| CompanyNew.currency | Currency | ارز |
| CompanyInvite.title | Invite to {company} | دعوت به {company} |
| DeptNew.title | New department | دپارتمان جدید |



## CO-04 · Projects & teams  
Batch B · `boards/CO04CompanyWork.dc.html` · `screenshots/CO04CompanyWork.jpg` · dark: `CO04CompanyWorkDark`

#### States · 3

- **Attach preview** — Attach preview (shown to the team / project owner) · Euroly becomes the custodian of Design Team’s work data from now on · Members keep their accounts; they get a work profile in Euroly · Past private comments, check-ins, feedback and files are NOT revealed in bulk — only new items after attach · Personal data of members is never transferred · Company mandatory policies will apply (2-step sign-in, expense chain) · 8 members · 3 linked projects (each needs its own consent) · Decline · Accept & re-authenticate
- **Teams tab** — Teams view · Teams tab: team, department, lead, people, this-week plan completion, custody (Company / Attached). Click → /teams/[id] (team context, purple breadcrumb shows the company).
- **Dept-scoped** — Dept Managers see their department’s projects and teams; other departments’ projects only if they have a project role.

#### Rules

- **Portfolio** — Company-custody projects and teams; filter by department; status from each project; budget = approved spend vs project budget (CO-10).
- **Attach existing (P4-06)** — Request → owner sees custody & privacy preview → accepts with re-auth → migration. Separate consent per project. Never bulk-reveals past secrets.
- **New project / team** — Opens ?sheet=project-new or team-new with company + department preselected.
- **Detach** — Not a button: handled as ownership transfer in Settings with retention rules (Owner only).
- **Visibility** — Org Admin sees all company projects (custodian). Others: their department or explicit project roles.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| See portfolio (scope) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Request attach | ✓ | ✓ | — | — | — | — |
| Create project/team in company | ✓ | ✓ | ✓ | ✓ | — | — |
| See budgets column | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Company projects & teams | P4-05 portfolio | Not built | companyWorkRepo.projects / teams |
| Attach request / preview / accept | P4-06 attachment | Not built | attachRepo.request / preview / accept / cancel |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| CompanyWork.attach | Attach existing | پیوستن پروژه/تیم موجود |
| CompanyWork.pending | Pending attach | در انتظار پیوستن |
| Attach.preview.secrets | Past private items are not revealed in bulk | موارد خصوصی گذشته یک‌جا آشکار نمی‌شوند |
| Attach.accept | Accept & re-authenticate | پذیرش و ورود دوباره |



## CO-05 · Company goals  
Batch B · `boards/CO05CompanyGoals.dc.html` · `screenshots/CO05CompanyGoals.jpg` · dark: `CO05CompanyGoalsDark`

#### Rules

- **Cascade** — Company goals → department goals → linked team goals / projects (links, not copies). Same Goal + key-result model as Personal P11 and Team TM-07.
- **Roll-up** — A KR can be “auto · child goals on pace” or manual; every KR shows its source line. No weighted composite score.
- **Visibility** — Company goals visible to all members; department goals to the company; linked team/project items only if the viewer can open them.
- **Notch** — Update progress (owner of goal); others: Open linked work.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create company goal | ✓ | ✓ | — | — | — | — |
| Create department goal | ✓ | ✓ | ✓ | — | — | — |
| Link team / project | ✓ | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Company / department goals, links | P4-05 (goals in company scope) | Not built | companyGoalRepo.tree / update / link |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| CompanyGoals.new | Company goal | هدف شرکت |
| CompanyGoals.cascade | department goals | اهداف دپارتمان |
| CompanyGoals.onPace | on pace | طبق برنامه |



## CO-06 · Resources & capacity  
Batch B · `boards/CO06CompanyResources.dc.html` · `screenshots/CO06CompanyResources.jpg` · dark: `CO06CompanyResourcesDark`

#### Capacity

Engineering

84%

92%

104%

Design

78%

81%

70%

Marketing

60%

64%

72%

Operations

80%

88%

86%

Mehr

Aban

Azar

Department booked ÷ capacity (sum of members’ weekly hours). Basic check only — no HR scheduling.


#### Rooms

Rooms: same list pattern with a day timeline; booking = request with optional approval (policy). Shown in the team/company calendar as busy without title for non-attendees.


#### Rules

- **Equipment** — Inventory with tag, type, assignee, department, status Assigned / Available / Requested / Repair / Retired. Assigning shows on the person’s work profile.
- **Requests** — Member requests a resource with dates and reason → approval chain “Resources” (CO-14) → assignment. Conflicts suggest the next free date.
- **Request card** — Signature card; notch Approve request (current reviewer); others: Withdraw (own) / Copy link.
- **Capacity** — Department capacity heat table by month (basic availability, owner rule: no full HR).
- **Not payroll** — No cost depreciation or accounting here; purchase of equipment is an Expense (CO-08).


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| See resources | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Request | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Approve (if reviewer) | ✓ | ✓ | ✓ | — | — | — |
| Add / retire | ✓ | ✓ | — | — | — | — |
| See capacity | ✓ | ✓ | ✓ | ✓ | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Resources, assignments, requests | P4-02 resources & equipment | Not built | resourceRepo.list / request / assign |
| Department capacity | P4-02 capacity checks | Not built | capacityRepo.dept(range) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Resources.title | Resources | منابع |
| Resources.request | Request | درخواست |
| Resources.status.assigned | Assigned | تحویل‌شده |
| Resources.status.repair | Repair | در تعمیر |
| Resources.approve | Approve request | تأیید درخواست |



## CO-07 · Knowledge base  
Batch B · `boards/CO07Knowledge.dc.html` · `screenshots/CO07Knowledge.jpg` · dark: `CO07KnowledgeDark`

#### Rules

- **Private to the company** — Folders and pages with versions, attached files, search across what the viewer may read. Restricted folders (e.g. HR) are listed only for people with access.
- **Pages** — Rich text (same editor as Personal notes), version history with diff, restore = new version. Owner + editors per folder.
- **Acknowledge** — Optional “acknowledge required” per page version (announcements full workflow in Phase 5); shows count acknowledged; remind once per version.
- **Search** — Server search, results limited to readable items; no snippet from unreadable items.
- **Not a signature screen** — Product cards only; reading page has no notch.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Read (folder grants) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create page in permitted folder | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Manage folders & access | ✓ | ✓ | — | — | — | — |
| Require acknowledgement | ✓ | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Folders, pages, versions, files, search | P4-05 knowledge base | Not built | kbRepo.tree / page / versions / search |
| Acknowledgements | P4-05 (announce ack in P5) | Not built | kbRepo.ack / ackStatus |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Knowledge.title | Knowledge base | پایگاه دانش |
| Knowledge.ackRequired | Acknowledge required | تأیید مطالعه لازم است |
| Knowledge.search | Search all pages and files | جست‌وجو در همه‌ی صفحه‌ها و فایل‌ها |



## CO-08 · Expenses  
Batch C · `boards/CO08Expenses.dc.html` · `screenshots/CO08Expenses.jpg` · dark: `CO08ExpensesDark`

#### States · 3

- **New expense** — New expense (?sheet=expense-new) · Drop receipt or take a photo · Amount (T) · 4,200,000 · Date · 12 Mehr · Category · Meals ▾ · Department · Design ▾ · Project (optional) · — · Who paid · I paid · reimburse me · Company card · Save draft · Submit
- **Changes requested** — Changes requested · Harry B.: please attach the receipt. · Author edits and resubmits; the chain restarts at the step that asked (new revision, history kept).
- **Personal finance** — Personal ledger · Nothing is written to the person’s Personal Finance automatically. After settlement they may choose “Record in my finance” (explicit, once — idempotent).

#### Rules

- **Statuses** — Draft → Pending (step n) → Approved / Rejected / Changes requested → (if reimbursable) Reimbursement → Settled. Approved ≠ paid.
- **Amounts** — One company currency (owner decision), exact integer Toman, no rounding; tabular numbers; short form only in summary tiles.
- **Receipt** — Receipt file + payer metadata (company card / I paid). Missing receipt allowed as draft; policy may require it to submit.
- **Budget link** — Department + optional project + budget line; counted in budget only after final approval (CO-10).
- **Detail card** — Signature card; notch = Open approval (CO-09 drawer) for reviewers; author: Edit (draft/changes) or Withdraw (pending).
- **Mine** — “Mine” tab = own expenses; Reimbursements tab = CO-11.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| See all expenses | ✓ | ✓ | — | — | — | — |
| See department expenses | ✓ | ✓ | ✓ | — | — | — |
| Create own | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Edit own draft / changes | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Approve (current reviewer only) | ✓ | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Expenses, receipts, payer metadata | P4-03 corporate expense | Not built | expenseRepo.list / create / submit / withdraw |
| Approval state | P4-04 approval engine | Not built | approvalRepo.forSubject(expenseId) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Expenses.new | New expense | هزینه‌ی جدید |
| Expenses.iPaid | I paid · reimburse me | خودم پرداخت کردم · بازپرداخت |
| Expenses.companyCard | Company card | کارت شرکت |
| Expenses.status.changes | Changes requested | نیاز به اصلاح |
| Expenses.pendingNote | Pending expenses never count against the budget. | هزینه‌ی در انتظار در بودجه حساب نمی‌شود. |



## CO-09 · Approvals  
Batch C · `boards/CO09Approvals.dc.html` · `screenshots/CO09Approvals.jpg` · dark: `CO09ApprovalsDark`

**Main screen:** approvals inbox + Approval signature card (notch Approve); below it the **Approval flow** CaseFlow of the selected item (see `PEOPLE_FLOW.md` §2).

#### History

| When | Item | Decision | By | Chain version |
| --- | --- | --- | --- | --- |
| 20 Mehr | Conference travel ×3 | Approved (step 1) | Omid R. | Expenses v3 |
| 18 Mehr | USB-C hubs ×6 | Rejected — duplicate of IT stock | Dariush K. | Expenses v3 |
| 15 Mehr | Team lunch | Changes requested — receipt | Harry B. | Expenses v3 |


#### Rules

- **Engine** — Simple sequential chains (owner decision), versioned per subject type (Expenses, Resources, Headcount, Budget change). Steps by role/person with amount conditions (e.g. > 50,000,000 T → Finance).
- **Decision** — Approve (notch) · Reject (reason required) · Request changes (comment required). One decision per step; audit entry with chain version.
- **Conflicts** — Requester can’t approve own item; if the requester is the step’s approver, the step goes to the next eligible (rule shown in the chain).
- **Escalation** — After N days (policy) the step escalates to the escalation target; original reviewer can still decide until then.
- **Grants** — Reviewer must hold the needed grant at decision time (checked server-side); if revoked, step reassigns per chain.
- **Flow view** — CaseFlow board (shared component) for the selected item: one column per chain step (from the chain version the item was submitted under), rows = the actions inside that step with the person, ✓ done / ••• current / + not yet assigned. Last block = what happens after approval (reimbursement, budget commit, notification, audit). Read-only; decisions only in the Approval card. Phones: stacked steps.
- **Inbox** — For me (current step = me) · I requested · History. Overview shows the top 3; rail badge = For me count.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Approve as current reviewer | ✓ | ✓ | ✓ | ✓ | — | — |
| See history of all approvals | ✓ | ✓ | — | — | — | — |
| See own requests | ✓ | ✓ | ✓ | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Approval inbox, decisions, history | P4-04 approval engine (versioned) | Not built | approvalRepo.inbox / decide / history |
| Chain definitions | P4-04 | Not built | approvalChainRepo.list / draft / publish |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Approvals.forMe | For me | منتظر من |
| Approvals.approve | Approve | تأیید |
| Approvals.reject | Reject… | رد… |
| Approvals.changes | Request changes | درخواست اصلاح |
| Approvals.escalates | escalates after {n} days | پس از {n} روز ارجاع می‌شود |



## CO-10 · Budgets  
Batch C · `boards/CO10Budgets.dc.html` · `screenshots/CO10Budgets.jpg` · dark: `CO10BudgetsDark`

#### Rules

- **Levels** — Company → department → budget lines; project budgets (Projects tab) are allocations inside department lines.
- **Numbers** — Approved (final approval) · Committed (approved purchase not yet billed, e.g. signed order) · Left · Variance. Pending claims shown separately, never counted.
- **Budget change** — Signature card notch = Request budget change → approval chain “Budget change” (CO-14). History of versions per line.
- **Exact** — Stored exact in Toman; tiles show short B/M; tables show B with one decimal and exact value in tooltip.
- **Not accounting** — No ledger, tax or invoicing; export is a report, not a book of accounts.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| See company budgets | ✓ | ✓ | — | — | — | — |
| See own department | ✓ | ✓ | ✓ | — | — | — |
| Request change | ✓ | ✓ | ✓ | — | — | — |
| Set budgets | ✓ | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Budgets, lines, allocations, variance | P4-03 budgets/commitments | Not built | budgetRepo.list(quarter) / line / requestChange |
| Pending totals | P4-03 | Not built | expenseRepo.pendingTotal(dept) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Budgets.title | Budgets | بودجه‌ها |
| Budgets.committed | Committed | متعهدشده |
| Budgets.variance | Variance | انحراف |
| Budgets.change | Request budget change | درخواست تغییر بودجه |



## CO-11 · Reimbursements  
Batch C · `boards/CO11Reimbursements.dc.html` · `screenshots/CO11Reimbursements.jpg` · dark: `CO11ReimbursementsDark`

#### Rules

- **Flow** — Expense “I paid” approved → appears in To settle → Finance adds to a payment run → pays outside the app → Confirm payment (notch) with reference → each item Settled (acknowledged).
- **Never automatic** — Request ≠ paid; approval ≠ paid. No money movement, no bank integration in Phase 4.
- **Disputes** — Recipient may mark “not received” within 14 days (proposal) → item returns to To settle with a note.
- **Personal finance** — After settled, recipient may choose “Record in my finance” (explicit, idempotent). Nothing is written automatically.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| See all to settle | ✓ | ✓ | — | — | — | — |
| Create payment run / confirm | ✓ | ✓ | — | — | — | — |
| See own | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Mark not received (own) | ✓ | ✓ | ✓ | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Reimbursements, payment runs, acknowledgements | P4-04 reimbursement / payment acknowledgement | Not built | reimbursementRepo.toSettle / run / confirm / dispute |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Reimb.toSettle | To settle | برای تسویه |
| Reimb.confirm | Confirm payment | تأیید پرداخت |
| Reimb.settled | Settled | تسویه‌شده |
| Reimb.notReceived | Not received | دریافت نشد |
| Reimb.recordPersonal | Record in my finance | ثبت در مالی شخصی من |



## CO-12 · Employee file (sealed)  
Batch C · `boards/CO12EmployeeFile.dc.html` · `screenshots/CO12EmployeeFile.jpg` · dark: `CO12EmployeeFileDark`

#### States · 3

- **Sealed (no grant)** — Without a grant · Employee file · sealed · You need an explicit grant from HR. Your request is logged and the employee is told who asked. · Request access · Org Admin and Owner do NOT get access by role (backend acceptance: admin cannot see sealed files without grant).
- **Access log** — Access log (employee can see it too) · When · Who · What · now · Mehran R. · opened file (grant: HR reviewer) · 12 Mehr · Katy F. · responded to corrective action · 3 Mehr · Harry B. · opened corrective action
- **Open corrective action** — Open corrective action · Reason · Missed security training · Evidence (required) · training-log.csv · Visible to · HR, supervisor, employee · Employee is notified and can respond and appeal. Confidential by default.

#### Rules

- **Separate from profile** — Work profile (CO-03) is the directory; this sealed file holds contract, documents and corrective actions with document-level grants, retention and audit.
- **Grants** — Time-limited explicit grants (HR reviewer, supervisor for specific docs). Not implied by Owner / Org Admin roles.
- **Audit** — Every open / download / change is logged and visible to the employee (except legal hold, policy-defined).
- **Corrective actions (owner decision)** — Reason + evidence required, employee response, appeal, outcome; confidential; bounded disclosure needs explicit review. No automatic pay deduction.
- **Notch** — Add document (granted HR); others with read grant: Download file pack (logged).
- **Not on phones** — Read-only on mobile; uploads and corrective actions on desktop.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Open file | grant | grant | grant | grant | grant | grant |
| Request access | ✓ | ✓ | ✓ | — | — | — |
| Grant access | HR grant | HR grant | — | — | — | — |
| Open corrective action | HR grant | HR grant | supervisor | supervisor | — | — |
| See own file + access log | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Employee file, documents, grants | P4-02 sensitive employee case file | Not built | employeeFileRepo.get / docs / grant / request |
| Corrective actions | P4-02 + P3-04 machinery | Not built | caseRepo.open / respond / appeal / close |
| Access log | audit | Not built | auditRepo.forSubject(fileId) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| EmployeeFile.sealed | Sealed | مهروموم |
| EmployeeFile.request | Request access | درخواست دسترسی |
| EmployeeFile.log | Access log | گزارش دسترسی |
| Corrective.title | Corrective actions | اقدام‌های اصلاحی |
| Corrective.respond | Respond | پاسخ |
| Corrective.appeal | Appeal | اعتراض |



## CO-13 · Reports & audit  
Batch C · `boards/CO13Reports.dc.html` · `screenshots/CO13Reports.jpg` · dark: `CO13ReportsDark`

#### Audit log

| When | Who | Action | Subject |
| --- | --- | --- | --- |
| 21 Mehr 10:02 | Mehran R. | opened sealed file (grant HR reviewer) | Katy F. · employee file |
| 20 Mehr 16:40 | Omid R. | approved step 1 | Conference travel ×3 |
| 20 Mehr 09:12 | Sara P. | overrode default policy (reason: Thu shift) | Operations · work week |
| 19 Mehr 11:00 | Mehran R. | exported CSV | Budget variance Q4 |


#### States · 3

- **Export rules** — Export · Exports are generated server-side from what the requester may see, watermarked with requester and time, and logged in the audit. Download link expires in 24 h.
- **Member view** — Members see Reports for their own department only (portfolio, goals). No expenses, budgets or headcount.
- **Empty** — Not enough data yet · Reports appear after the first approved items in this quarter.

#### Rules

- **Reports** — Fixed report set (portfolio, capacity, expenses, budget variance, goals, headcount) with source captions; plain SVG charts with table toggle.
- **No people ranking** — Headcount and capacity are department aggregates; no individual performance reports.
- **Audit log** — Owner / Org Admin / Security reviewer grant: every sensitive action (file opens, approvals, policy overrides, exports, ownership changes). Read-only, filterable, exportable.
- **Scope** — Department selector narrows; never widens.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Department reports | ✓ | ✓ | ✓ | ✓ | — | — |
| Company reports | ✓ | ✓ | — | — | — | — |
| Exports | ✓ | ✓ | ✓ | — | — | — |
| Audit log | ✓ | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Reports | P4-05 company reports | Not built | companyReportRepo.* |
| Exports | P4-05 authorized export | Not built | exportRepo.request / status |
| Audit | P4-05 audit | Not built | auditRepo.list(filter) |



## CO-14 · Company settings  
Batch C · `boards/CO14CompanySettings.dc.html` · `screenshots/CO14CompanySettings.jpg` · dark: `CO14CompanySettingsDark`

#### Page tabs (in the board)

- **General** — name, legal name, currency (Toman, locked after first approved expense), fiscal year start.
- **Policies** — each policy with Mandatory / Default / Optional segmented control.
- **Approval chains** — subject types (Expenses v3, Resources v1, Headcount v2, Budget change v1); published vs draft; sequential steps with amount conditions and escalation; publish affects new requests only.
- **Roles & access** — roles + special grants (Finance reviewer, HR reviewer, Security reviewer).
- **Lifecycle** — transfer administrative ownership (accept + reauth, ≥1 eligible owner), archive, delete with retention holds.

#### Rules

- **Tabs** — General · Policies · Approval chains · Roles & access · Lifecycle (?tab=…).
- **Policies** — Each policy Mandatory (locked for everyone below) · Default (departments may override with reason, audited) · Optional (team/person choice). Mandatory security can never be disabled by a department.
- **Approval chains** — Sequential steps (owner decision) per subject type, amount conditions, escalation; versioned draft → publish; publishing affects new requests only.
- **Special grants** — Finance reviewer, HR reviewer, Security reviewer — explicit grants, not roles; time-limited where sensitive.
- **Lifecycle** — Transfer administrative ownership via acceptance + reauth (keeps ≥1 eligible custodian); archive/restore; delete with retention holds. Downgrade never deletes data.


#### Permissions

| Action | Owner | Org Admin | Dept Mgr | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Open settings | ✓ | ✓ | — | — | — | — |
| Policies | ✓ | ✓ | — | — | — | — |
| Approval chains | ✓ | ✓ | — | — | — | — |
| Grants | ✓ | ✓ | — | — | — | — |
| Transfer / delete | ✓ | — | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Company settings, policies | P4-01 policies | Not built | policyRepo.list / set |
| Approval chains (versioned) | P4-04 | Not built | approvalChainRepo.draft / publish |
| Lifecycle | P4-06 handover/archive/retention | Not built | companyRepo.requestTransfer / archive / delete |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| CompanySettings.policies | Policies | سیاست‌ها |
| CompanySettings.chains | Approval chains | زنجیره‌های تأیید |
| CompanySettings.publish | Publish v{n} | انتشار نسخه‌ی {n} |
| CompanySettings.transfer | Transfer ownership | انتقال مالکیت |



## CO · Mobile 390  
Batch all · `boards/COM01CompanyMobile.dc.html` · `screenshots/COM01CompanyMobile.jpg` · dark: `COM01CompanyMobileDark`

#### Mobile rules · 5

- **Bottom nav** — Overview · Work · (+) · Approvals · More (Departments, People, Goals, Resources, Expenses, Budgets, Knowledge, Reports, Settings).
- **Approvals** — Full-screen detail; notch Approve; reject/changes need a comment.
- **Expenses** — Bottom sheet with receipt photo first; amount keypad numeric.
- **Read-only on phones** — Employee file, approval chain editor, policies, budget setting, org tree editing.
- **Department scope** — Chip in the header opens the department sheet.



## CO · فارسی RTL  
Batch all · `boards/COM02CompanyFa.dc.html` · `screenshots/COM02CompanyFa.jpg` · dark: `COM02CompanyFaDark`

#### RTL rules · 5

- **Mirroring** — Rail right, notch top-left, bars fill right → left, approval chain icons on the right.
- **Money** — Toman with Persian digits and Persian thousands separator (٬); short form میلیارد / میلیون in tiles; exact in tables.
- **Roles** — مالک · ادمین سازمان · مدیر دپارتمان · سرپرست تیم · عضو · بیننده.
- **Policies** — اجباری · پیش‌فرض · اختیاری.
- **Dates** — Jalali; fiscal year from Farvardin.


