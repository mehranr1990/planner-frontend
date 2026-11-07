# Shared context shell & access states — spec (Phase 2+)

Used by Projects now and by Teams / Companies / later contexts. Additions only — the Personal shell (top islands, schedule island, Personal rail, mobile Today nav) is LOCKED and unchanged.
Boards: `boards/SH01ContextShell.dc.html`, `boards/SH02AccessStates.dc.html` (+ Dark). Screenshots in `screenshots/` (tab screenshots end with `__<Tab>.jpg`).

---

## SH01 · Context shell  
`boards/SH01ContextShell.dc.html` · `screenshots/SH01ContextShell.jpg` · dark: `SH01ContextShellDark`

#### Switcher & workspaces

Personal

Your private planner

Projects

Independent projects you own or joined

Teams

Phase 3 · not available yet

Soon

Companies

Phase 4 · not available yet

Soon

Find a project

**RECENT**

Website Redesign

Manager · On track

Planner App

Member · 3 tasks for you

**OWNED BY YOU · 2**

Mobile Onboarding

Owner · At risk

Brand Refresh

Owner · Paused

**INVITATIONS · 1**

Data Migration

Invited by Sara P. as Member

Review

**ARCHIVED**

Spring Campaign

Archived 12 Shahrivar

Read-only

All projects

- **Two levels** — Context (Personal / Projects / later Teams, Companies) on the left; the workspace list of the hovered context on the right. Personal has no workspace list (single space).
- **Sections** — Recent (max 3) · Owned by you · Member of · Invitations (preview only, no data until accepted) · Archived (read-only). Counts come from the server, never computed client-side.
- **Future contexts** — Teams and Companies stay visible but disabled with “Phase 3 / Phase 4 · not available yet” until their phase ships (no fake records).
- **Selection** — Choosing a project navigates to /projects/[id] (URL is the source of truth). Last-used project per context is remembered only as a hint and re-checked against access on load.
- **Revoked while open** — If access to the remembered project is gone, the switcher drops it silently and the page shows the generic “not available” state (SH02).
- **Mobile** — Same content as a full-height sheet: contexts as top segmented pills, workspace list below.


#### Rails · 3 modes

**PERSONAL (LOCKED)**

3 groups + Settings

**PROJECTS · COLLECTION**

/projects — All projects, recent projects, New project

**PROJECTS · INSIDE A PROJECT**

/projects/[id]/* — 3 groups + Settings

- **Group 1 · work** — Overview · Tasks (List / Board / Flow are view modes inside Tasks) · Timeline · Gantt · Calendar.
- **Group 2 · plan & control** — Milestones · Risks (badge = open high risks) · Workload.
- **Group 3 · people & docs** — Members · Files · Analytics. Settings at the bottom (only roles with settings capability see it enabled).
- **Changed from code** — contexts.ts reserved /projects/{tasks,board,timeline,gantt,case-flow,docs,analytics} without an id. Final routes are /projects/[id]/…, “case-flow” → “flow” (inside Tasks), “docs” → “files”; board stays a route but is reached through the Tasks view switch.
- **Capability-aware** — Items for screens the role cannot open are hidden, not disabled (no discovery). Viewer: no Settings, no Workload if not granted. Guest (task grant): Overview + Tasks only.
- **RTL** — Rail on the right; badge on the inline-start corner of the icon.


#### Mobile · 3

9:41

Projects

Project bottom nav

9:41

Projects

Website Redesign

Timeline

Gantt

Milestones

Risks

Workload

Members

Files

Analytics

Settings

Timeline and Gantt open as read-only lists on phones (editing on ≥1024px).

More sheet

9:41

Projects

Personal

Projects

Teams

Companies

Website Redesign

Manager

Planner App

Member

Mobile Onboarding

Owner

New project

Context & project switcher


#### Breadcrumb · Quick create

Create

Task

in Website Redesign

Milestone

Manager+

Risk / issue

Member+

File

Member+

Invite member

Your role can’t invite — ask an Admin

Personal task instead

Projects

Website Redesign

Tasks

Projects

Website Redesign

Tasks

Checkout flow

Projects

Website Redesign

Risks

API access delayed

Collection → project → module → resource. Back returns to the last authorized parent; a revoked parent collapses to “Projects”. Long names truncate in the middle on mobile (“Website Re…ign”).

- **Target is explicit** — Quick Create always names the workspace it writes to. It never silently creates in Personal while you are in a project (and vice versa).
- **Capability gating** — Options the role cannot use are shown disabled with a reason only when the user can see the project; never for hidden resources.
- **Search ⌘K** — Results are grouped by source (Personal · Website Redesign · Planner App), filtered server-side before counts and snippets.
- **Notifications** — Link to the canonical route; if access is gone the link opens the generic not-available state and the notification text is redacted.
- **Assistant** — The NonPersonalAssistant FAB is not shown on any Project screen (AI deferred).



---

## SH02 · Access states  
`boards/SH02AccessStates.dc.html` · `screenshots/SH02AccessStates.jpg` · dark: `SH02AccessStatesDark`

#### State templates · 16

initial

Loading

Skeleton that matches the final layout. No spinner over the page. After 8 s: “Still loading…” + Retry.

در حال بارگذاری

اسکلت صفحه نمایش داده می‌شود؛ بعد از ۸ ثانیه «هنوز در حال بارگذاری…» و «تلاش دوباره».

empty · first use

No projects yet

Projects keep shared work, people and files together. Create one or wait for an invitation.

هنوز پروژه‌ای ندارید

پروژه‌ها کار مشترک، افراد و فایل‌ها را کنار هم نگه می‌دارند. یکی بسازید یا منتظر دعوت بمانید.

New project

empty · filtered

Nothing matches

No results for these filters. Counts only include items you can see.

موردی پیدا نشد

با این فیلترها نتیجه‌ای نیست.

Clear filters

error

Couldn’t load this page

Something went wrong on our side. Your changes are safe. Ref: 7F3A-21

این صفحه بارگذاری نشد

مشکلی پیش آمد. تغییرات شما حفظ شده است.

Try again

offline (banner)

You’re offline

Showing the last loaded version. Edits are paused until you reconnect.

اتصال برقرار نیست

آخرین نسخه‌ی بارگذاری‌شده نمایش داده می‌شود؛ ویرایش تا اتصال دوباره متوقف است.

unauthenticated

Sign in to continue

Your session ended. Sign in again to open this project.

برای ادامه وارد شوید

نشست شما تمام شده است. دوباره وارد شوید.

Sign in

forbidden = not found

This project isn’t available

It may not exist, or you don’t have access. Ask the person who shared the link.

این پروژه در دسترس نیست

ممکن است وجود نداشته باشد یا به آن دسترسی نداشته باشید.

Go to my projects

invite pending

You’re invited to “Data Migration”

Sara P. invited you as Member. Accept to see tasks and files. You need a verified account.

به «Data Migration» دعوت شده‌اید

سارا پ. شما را به‌عنوان عضو دعوت کرده است. برای دیدن کارها و فایل‌ها، دعوت را بپذیرید.

Accept

Decline

verified guest (banner)

Limited access

You can see the 3 tasks shared with you. Other project content stays hidden.

دسترسی محدود

فقط ۳ کاری که با شما به اشتراک گذاشته شده دیده می‌شود.

revoked

Your access was removed

You’re no longer a member of this project. Cached content was cleared from this device.

دسترسی شما برداشته شد

دیگر عضو این پروژه نیستید. محتوای ذخیره‌شده از این دستگاه پاک شد.

Go to my projects

archived (banner)

Archived · read-only

This project was archived on 12 Shahrivar. You can view and export, not edit.

بایگانی‌شده · فقط خواندنی

این پروژه در ۱۲ شهریور بایگانی شد. مشاهده و خروجی ممکن است، ویرایش نه.

Restore

Export

read-only role (banner)

View only

Your role is Viewer. Ask an Admin if you need to edit.

فقط مشاهده

نقش شما «بیننده» است.

conflict

This changed while you were editing

Sara moved “Checkout flow” to In review. Compare and choose which to keep.

هم‌زمان تغییر کرد

سارا وضعیت را تغییر داد. مقایسه کنید و انتخاب کنید.

Compare

Reload

deleted

This task was deleted

It was removed by a project Admin. It can’t be opened anymore.

این کار حذف شده است

یکی از مدیران پروژه آن را حذف کرده است.

Back to tasks

pending (inline)

Pending approval

Your change is waiting for a Manager to approve it.

در انتظار تأیید

تغییر شما منتظر تأیید مدیر است.

quota (not used now)

Limit reached

Future only — no quota is enforced while all features are free.

سقف استفاده

فقط برای آینده؛ فعلاً هیچ سقفی اعمال نمی‌شود.


#### Banners · 5

Archived 12 Shahrivar · read-only

Restore

You’re a Viewer in this project · editing is off

Limited access · you see 3 shared tasks only

Offline · showing last loaded version

Retry

Updated by Sara P. a moment ago

Reload

Banners sit directly under the page header, full width, never dismissible while the condition holds. One banner at a time (priority: revoked › offline › archived › conflict › read-only › guest).


#### Rules

- **No discovery** — Forbidden and not-found render the SAME screen and copy. No project name, member count or file name is ever shown to someone without access.
- **Full page vs banner** — Full page: loading, empty, error, unauthenticated, not available, invite pending, revoked, deleted. Banner over normal content: offline, archived, read-only role, verified guest, conflict notice.
- **Revocation** — On revoke/logout/context switch: clear scoped query cache, file thumbnails, drafts and open sheets; close realtime listeners; then show “access removed”.
- **Pending invitation** — Shows only public-safe preview (project name, inviter, offered role). No tasks, members or files until accepted with a verified account.
- **Conflict** — Never overwrite silently: compare (mine vs theirs, field by field) → keep mine / keep theirs / merge text fields.
- **Actions disabled vs hidden** — Hidden when the user cannot see the resource; disabled with a one-line reason when they can see it but their role cannot act.
- **Mocking** — Every state is reachable in the UI mock through a demo-state switch (same pattern as /styleguide/my-day?state=…).
- **Copy** — EN/FA strings on the cards are final copy keys (namespace Access.*).


