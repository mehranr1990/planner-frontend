# Social (Phase 6) — design spec · COMPLETE

Status: **all Social screens designed, awaiting owner approval.** Read with `README.md`, `SCREENS.md`, `DECISIONS.md`, `../shared/SHARED.md`, and the Messages package (group/activity chat uses that engine).
Visuals: `screenshots/<Board>.jpg`, dark `<Board>Dark.jpg`, tab captures `<Board>__<Tab>.jpg`.

---

## SO-01 · Social shell & access  
Batch A · `boards/SO01SocialShell.dc.html` · `screenshots/SO01SocialShell.jpg` · dark: `SO01SocialShellDark`

- **5th context (owner decision)** — “Social” after Companies in the switcher. Right column: Social home · Your groups (role) · Pending join requests · Find groups · New group.
- **Rails** — Social home: Home · Connections | Groups · Activities | My balances · Lending | New (+). Inside a group (/social/groups/[id]): Back · Overview · Activities · Calendar · Chat | Expenses · Lending & found · Album · Challenges | Members | Settings.
- **Colour (owner decision)** — coral: deep #C2410C, soft #FFEBDD, dot #FF9A6B; dark deep #FFA77D, soft #4A2A1C.
- **Mobile** — Home · Groups · (+) · Activities · More; inside a group: Overview · Activities · (+) · Chat · More.
- **Access states (add to SH-02)** — Join requested (public preview only) · Private group (not discoverable, not counted) · Activity guest (only that activity, its chat and own expenses) · Left the group (access revoked; own balances visible until settled) · Not counted yet (proposed / pending edits) · Blocked person (no connect/DM; group rules apply).
- **Isolation** — social and work never mix; a friend who is also a colleague = two separate relationships.



## SO-02 · Connections & circles  
Batch A · `boards/SO02Connections.dc.html` · `screenshots/SO02Connections.jpg` · dark: `SO02ConnectionsDark`

#### States · 3

- **Connect lookup** — Connect (?sheet=connect) · Email or verified phone · “If this person has an account and allows requests, they’ll get your request.” — the same text whether or not an account exists. Rate-limited. · Send request
- **Social home** — Social home (/social) · Upcoming activities (RSVP), requests, groups with unread, my balances summary, items I lent/borrowed due. Product cards only; no feed of others’ posts.
- **Empty** — No connections yet · Connect by email or verified phone. Both sides must accept. · Connect

#### Rules

- **Connections** — Mutual acceptance; independent of groups and work. Remove = silent; Block = no requests, DMs, presence or mentions.
- **Circles** — Private labels only you see (not memberships). Used to filter, invite and share free/busy.
- **Profile card** — Signature card; notch = Message (opens direct conversation). Shows shared groups and the net balance between you (from approved shared expenses).
- **Free / busy** — Consent-based: you ask, they choose to share free/busy (no titles) for a range or always.
- **Privacy** — Who can send requests: everyone with my email/phone · people in my groups · nobody.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Connections, requests, circles | P6-01 | Not built | connectionRepo.list / request / accept / ignore / remove; circleRepo |
| Balance between two people | P6-03 | Not built | balanceRepo.between(userId) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Connections.title | Connections | ارتباط‌ها |
| Connections.connect | Connect | درخواست ارتباط |
| Connections.circles | Circles | حلقه‌ها |
| Connections.ignore | Ignore | نادیده گرفتن |
| Connections.lookupNote | If this person has an account and allows requests, they’ll get your request. | اگر این فرد حساب داشته باشد و اجازه دهد، درخواست شما را دریافت می‌کند. |



## SO-03 · Groups: discover & join  
Batch A · `boards/SO03Groups.dc.html` · `screenshots/SO03Groups.jpg` · dark: `SO03GroupsDark`

#### Rules

- **Private by default** — New groups are private (invite only). Owner may make a group discoverable: shows name, description, size, rules, topic — never member names or content.
- **Join** — Discoverable groups: “Ask to join” with optional note → admins approve/decline. Never auto-join. Requester sees nothing more until approved.
- **Invite** — Members invite connections or share an invite link that still needs admin approval (setting).
- **Discover** — Topic pills and text search over discoverable groups only. No recommendation engine.


#### Permissions

| Action | Owner | Admin | Member | Activity guest | Join requested |
| --- | --- | --- | --- | --- | --- |
| See preview | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ask to join | — | — | — | ✓ | — |
| Approve / decline | ✓ | ✓ | — | — | — |
| Make discoverable | ✓ | — | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Discoverable groups, requests | P6-01 groups/discovery/admission | Not built | socialGroupRepo.discover / requestJoin / decide |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Groups.discover | Discover | یافتن گروه |
| Groups.ask | Ask to join | درخواست پیوستن |
| Groups.requested | Requested | درخواست شد |
| Groups.approve | Approve | تأیید |



## SO-04 · Group overview  
Batch A · `boards/SO04GroupOverview.dc.html` · `screenshots/SO04GroupOverview.jpg` · dark: `SO04GroupOverviewDark`

**Main screen:** People card avatars now carry the optional group status dot.

#### Rules

- **Job** — What’s next with these people, what do I owe/am I owed, what’s lent. No feed, no likes, no ranking.
- **Signature card** — Next activity: dates, going/capacity/waitlist, my RSVP; notch = Open activity.
- **Balance** — Net of approved shares only; proposed and pending edits shown as text. Settle up opens SO-09.
- **Tabs** — Upcoming (activities) · Activity (group events) · Lending.
- **Group chat** — Rail item Chat = the group’s conversation in Messages (Phase 5 engine).


#### Permissions

| Action | Owner | Admin | Member | Activity guest | Join requested |
| --- | --- | --- | --- | --- | --- |
| View overview | ✓ | ✓ | ✓ | — | — |
| Create activity | ✓ | ✓ | ✓ | — | — |
| Invite | ✓ | ✓ | setting | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Group, members, next activity | P6-01 / P6-02 | Not built | socialGroupRepo.get; activityRepo.next |
| My balance | P6-03 | Not built | balanceRepo.mine(groupId) |
| Group activity log | P6-06 | Not built | socialActivityLogRepo.list |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Group.nextActivity | Next activity | فعالیت بعدی |
| Group.openActivity | Open activity | باز کردن فعالیت |
| Group.balance.owed | you are owed | طلبکارید |
| Group.balance.owe | you owe | بدهکارید |
| Group.settle | Settle up | تسویه |



## SO-90 · Social sheets  
Batch A · `boards/SO90SocialSheets.dc.html` · `screenshots/SO90SocialSheets.jpg` · dark: `SO90SocialSheetsDark`

#### Rules

- **Ids** — group-new · activity-new · connect (+ expense-propose in SO-08, item-lend in SO-10).
- **Templates** — Trip (multi-day itinerary + packing list), Sport (recurring, capacity), Gathering (poll for date), Family, Blank.
- **Independent activity** — An activity can exist without a group; invitees are activity guests; expenses work the same (owner rule).


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| GroupNew.title | New group | گروه جدید |
| ActivityNew.title | New activity | فعالیت جدید |
| Connect.title | Connect | درخواست ارتباط |



## SO-05 · Activity  
Batch B · `boards/SO05Activity.dc.html` · `screenshots/SO05Activity.jpg` · dark: `SO05ActivityDark`

#### States · 3

- **Full** — Full · waitlist · 10 of 10 going. Join the waitlist? You’ll be offered a spot for 12 h if one opens. · Join waitlist
- **Guest** — Activity guest view · Jamal (not in Mountain Friends) sees this activity, its chat and the expenses he takes part in. No group overview, members list beyond attendees, album or other activities.
- **Cancelled** — Cancelled by Mehran · reason: snow on the road. Proposed expenses stay for settlement.

#### Rules

- **Activity** — Independent or under a group; templates Trip / Sport / Gathering / Family / Blank. Multi-day itinerary with times, places, notes.
- **RSVP** — Going · Maybe · Can’t · (Pending = no answer); capacity + waitlist with 12 h offer (proposal). Signature card; notch = Change RSVP / Confirm.
- **Tabs** — Itinerary · Checklist (items can become tasks) · People · Files. Chat and Expenses are buttons (Messages engine, SO-07).
- **Calendar** — Going/Maybe activities appear in Personal calendar as projections (source chip “Mountain Friends”); private time block optional.
- **Recurring** — Sport template supports weekly recurrence; RSVP per occurrence.


#### Permissions

| Action | Owner | Admin | Member | Activity guest | Join requested |
| --- | --- | --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ | ✓ | — |
| RSVP | ✓ | ✓ | ✓ | ✓ | — |
| Edit itinerary | ✓ | ✓ | organisers | — | — |
| Cancel activity | ✓ | ✓ | organiser | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Activity, itinerary, RSVP, waitlist | P6-02 activities | Not built | activityRepo.get / rsvp / waitlist |
| Checklist & tasks | P6-02 + task engine | Not built | activityChecklistRepo |
| Calendar projection | calendar overlays | Not built | calendar projection (mock) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Activity.rsvp.going | Going | می‌آیم |
| Activity.rsvp.maybe | Maybe | شاید |
| Activity.rsvp.no | Can’t | نمی‌توانم |
| Activity.waitlist | Waitlist | فهرست انتظار |
| Activity.itinerary | Itinerary | برنامه‌ی سفر |
| Activity.checklist | Checklist | چک‌لیست |



## SO-06 · Poll & free/busy  
Batch B · `boards/SO06PollSchedule.dc.html` · `screenshots/SO06PollSchedule.jpg` · dark: `SO06PollScheduleDark`

#### States · 3

- **Poll types** — Other poll types · • Single choice (“Which trail?”) · • Multiple choice · • Date/time (this board) · Anonymous voting optional; results visible after voting or after close (setting).
- **Consent prompt** — Share free / busy · Nazanin asks to see your free/busy for 6–8 Aban. Shares only free/busy blocks from your calendars — never titles, places or who. · Not now · Share for this activity
- **Closed** — After close the organiser picks the final date (notch) → activity dates set, RSVPs asked.

#### Rules

- **Poll** — Date/time, single or multiple choice; yes / if needed; deadline; organiser picks final (signature card notch = Pick final date).
- **Free / busy** — Consent-based per request or per circle/always; only free/busy, no titles. “Not shared” is a hatched cell.
- **Privacy** — Free/busy derived from the person’s own calendars server-side; nothing else leaves Personal.
- **Polls elsewhere** — Polls can also be posted in group chat (same component).


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Polls, votes | P6-02 polls | Not built | pollRepo.get / vote / close / pickFinal |
| Free/busy with consent | P6-02 consent-based free/busy | Not built | freeBusyRepo.request / share / range |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Poll.pickAll | Pick all that work | همه‌ی زمان‌های مناسب را انتخاب کنید |
| Poll.ifNeeded | if needed | در صورت نیاز |
| Poll.pickFinal | Pick final date | انتخاب تاریخ نهایی |
| FreeBusy.ask | Ask to share | درخواست اشتراک |
| FreeBusy.notShared | not shared | به اشتراک گذاشته نشده |



## SO-07 · Shared expenses & balances  
Batch C · `boards/SO07SharedExpenses.dc.html` · `screenshots/SO07SharedExpenses.jpg` · dark: `SO07SharedExpensesDark`

#### Rules

- **Scope** — Expenses belong to a group or to an independent activity (owner rule: activity participants can propose without a permanent group). One currency per group/activity (owner decision).
- **Statuses** — Proposed (not counted) → Approved (counted) / Rejected. Editing an approved item creates “Edit pending” while the approved version keeps counting.
- **Who can propose / approve** — Any verified participant may propose; approvers = owner/admins or the activity organiser (setting). Approver can approve, edit-and-approve, or reject with a reason.
- **Balance card** — Signature card with my net, paid, share and simplified transfers; notch = Settle up (SO-09).
- **Visibility** — Each person sees own share/paid/owed; aggregate per-person table only for admins (narrow aggregate permission).
- **Exact** — Integer minor units; remainder of splits assigned deterministically (shown in detail).


#### Permissions

| Action | Owner | Admin | Member | Activity guest | Join requested |
| --- | --- | --- | --- | --- | --- |
| See list | ✓ | ✓ | ✓ | ✓ | — |
| Propose | ✓ | ✓ | ✓ | ✓ | — |
| Approve / reject | ✓ | ✓ | — | organiser | — |
| See everyone’s balance | ✓ | ✓ | setting | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Expense proposals, approvals, revisions | P6-03 shared expenses | Not built | sharedExpenseRepo.list / propose / approve / reject / revise |
| Balances, simplified transfers | P6-03 | Not built | balanceRepo.forScope(groupOrActivity) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Shared.propose | Propose expense | پیشنهاد هزینه |
| Shared.proposed | Proposed · not counted | پیشنهادی · حساب نمی‌شود |
| Shared.editPending | Edit pending · approved version counts | ویرایش در انتظار · نسخه‌ی تأییدشده حساب می‌شود |
| Shared.settle | Settle up | تسویه |
| Shared.balance.owed | you are owed | طلبکارید |



## SO-08 · Expense detail & split  
Batch C · `boards/SO08ExpenseSplit.dc.html` · `screenshots/SO08ExpenseSplit.jpg` · dark: `SO08ExpenseSplitDark`

#### States · 3

- **Edit pending** — Edit of an approved item (Groceries) · Arman proposed 3,450,000 → 3,150,000 T (returned item). Until approved, 3,450,000 T keeps counting. · Reject edit · Approve edit
- **Weighted** — Weighted split · You · × 1 · 690,000 T · Nazanin · × 1 · 690,000 T · Arman (2 people) · × 2 · 1,380,000 T · Parisa · × 1 · 690,000 T · Total 3,450,000 · remainder 0. If the split leaves a remainder, it goes to the payer first, then in member order (shown here).
- **Correction after settlement** — Settled items · An approved item that is already settled can still be corrected, but the correction creates a new pending revision and an adjustment line — it never silently changes a settled balance (backend acceptance).

#### Rules

- **Methods** — Equal · Fixed amounts · Percent · Weighted (shares) · Selected participants. Live “sum matches” check; save disabled until it matches.
- **Remainder** — Exact integer minor units; remainder assigned deterministically (payer first, then member order) and shown.
- **Approval card** — Signature card for approvers; notch = Approve expense. Edit & approve keeps a revision; reject requires a reason.
- **Receipt** — Optional photo/PDF (max 20 MB images per album rule; receipts follow Files limits).
- **Personal finance** — After approval, each participant may choose “Record my share in Personal Finance” once (idempotent; no auto reversal on later edits).


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Expense detail, split, revisions | P6-03 | Not built | sharedExpenseRepo.get / propose / approve / revise |
| Personal posting (opt-in) | P6-03 → Personal Finance | Not built | financeRepo.postShare(idempotencyKey) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Split.equal | Equal | مساوی |
| Split.fixed | Fixed | مبلغ ثابت |
| Split.percent | Percent | درصدی |
| Split.weighted | Weighted | وزنی |
| Split.selected | Selected | انتخابی |
| Split.sumMatches | sum matches | جمع درست است |
| Shared.approve | Approve expense | تأیید هزینه |



## SO-09 · Settle up  
Batch C · `boards/SO09SettleUp.dc.html` · `screenshots/SO09SettleUp.jpg` · dark: `SO09SettleUpDark`

#### Rules

- **Flow** — Payer records a payment (amount, note) → receiver confirms received → Settled. Receiver can mark “not received” with a note. Either side can record first; the other confirms.
- **Simplified transfers** — Minimum transfers computed from approved balances; users may also pay any amount (partial).
- **No money movement** — Settlement = acknowledgement record only (owner rule).
- **Personal finance** — On confirmation each side may choose to record it in Personal Finance (explicit, idempotent).
- **Card** — Record payment signature card; notch = Record payment.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Settlements | P6-03 settlement request/confirmation | Not built | settlementRepo.record / confirm / dispute |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Settle.record | Record payment | ثبت پرداخت |
| Settle.confirm | Confirm received | تأیید دریافت |
| Settle.notReceived | Not received | دریافت نشد |
| Settle.noMoney | The app doesn’t move money. | برنامه پولی جابه‌جا نمی‌کند. |



## SO-10 · Lending & lost/found  
Batch C · `boards/SO10Lending.dc.html` · `screenshots/SO10Lending.jpg` · dark: `SO10LendingDark`

#### Rules

- **Things** — Personal or group-owned items (photo, notes, condition). Group items have a keeper. Never show an owner’s home address; handover place is free text.
- **Loan flow** — Request (dates) → owner/keeper accepts → handover recorded by giver AND confirmed by borrower → return recorded by borrower AND confirmed by owner. Timestamps on each step.
- **Problems** — Overdue (automatic flag), lost, damaged, disputed — documented with photo/note; resolution needs both sides. No financial penalties.
- **Lost & found** — Works without a loan: post “missing” or “found”; another member claims “I have it” / “It’s mine”; resolved only after mutual confirmation.
- **Card** — Loan detail signature card; notch = Confirm handover / Confirm return (whichever is due for the viewer).


#### Permissions

| Action | Owner | Admin | Member | Activity guest | Join requested |
| --- | --- | --- | --- | --- | --- |
| See group things | ✓ | ✓ | ✓ | ✓ | — |
| Add group thing | ✓ | ✓ | ✓ | — | — |
| Request loan | ✓ | ✓ | ✓ | ✓ | — |
| Post lost/found | ✓ | ✓ | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Things, loans, handover/return confirmations | P6-04 lending | Not built | lendingRepo.items / request / handover / return / issue |
| Lost & found posts, claims | P6-04 lost/found | Not built | lostFoundRepo.post / claim / resolve |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Lending.title | Lending & found | امانت و گم‌شده‌ها |
| Lending.confirmReturn | Confirm return | تأیید بازگشت |
| Lending.overdue | Overdue | دیرکرد |
| LostFound.missing | Missing | گم شده |
| LostFound.found | Found | پیدا شده |
| LostFound.mine | It’s mine | مال من است |



## SO-11 · Album  
Batch C · `boards/SO11Album.dc.html` · `screenshots/SO11Album.jpg` · dark: `SO11AlbumDark`

#### Rules

- **Private** — Albums belong to a group or activity; visible only to members/participants. No public links.
- **Limits** — Original image ≤ 20 MB (owner rule); thumbnails and display copies generated server-side; total storage quota configured later in Admin (not enforced now).
- **Privacy** — EXIF location stripped from display copies by default; uploader can remove own photos anytime; admins can remove any (logged).
- **Leaving** — Your photos stay unless you remove them before leaving (prompted in the leave flow).
- **Viewer** — Lightbox with download (original only for uploader and admins, setting).


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Albums, photos, thumbnails | P6-05 private albums | Not built | albumRepo.list / upload / remove (mock resizes client-side for preview only) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Album.title | Album | آلبوم |
| Album.add | Add photos | افزودن عکس |
| Album.private | Private to members | فقط برای اعضا |
| Album.limit | Originals up to 20 MB each | هر عکس حداکثر ۲۰ مگابایت |



## SO-12 · Challenges  
Batch C · `boards/SO12Challenges.dc.html` · `screenshots/SO12Challenges.jpg` · dark: `SO12ChallengesDark`

#### Rules

- **Voluntary** — Opt-in per person; leave anytime; no auto-enrolment.
- **No private data** — Progress is entered manually in the challenge (or explicitly linked from a Personal habit by the person, one-way, revocable). Never auto-published from Personal (owner rule).
- **Group goal by default** — Shows the shared total; per-person ranking off by default (owner can turn on “show individual totals” — still no ranks).
- **Card** — Signature card; notch = Log progress.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Challenges, participants, entries | P6-05 social challenges | Not built | challengeRepo.list / join / leave / log |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Challenges.title | Challenges | چالش‌ها |
| Challenges.log | Log progress | ثبت پیشرفت |
| Challenges.join | Join | پیوستن |
| Challenges.privacy | Only numbers you enter here are shared. | فقط عددهایی که اینجا وارد می‌کنید به اشتراک گذاشته می‌شود. |



## SO-14 · Group settings & leave  
Batch C · `boards/SO14GroupSettings.dc.html` · `screenshots/SO14GroupSettings.jpg` · dark: `SO14GroupSettingsDark`

#### Rules

- **Settings** — Visibility, invites, expense approvers, balance visibility, currency (locked after first approved expense).
- **Leave / remove** — Checklist before leaving: open balances, things you hold, your photos. Access is revoked immediately; approved financial records and others’ rights remain (owner rule).
- **Owner leaving** — Must transfer ownership first (successor accepts).
- **Delete group** — Owner only, after balances are settled or acknowledged; albums deleted after notice.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Group settings, roles, leave | P6-01 / P6-06 exit & retention | Not built | socialGroupRepo.settings / leave / remove / transfer |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| GroupSettings.leave | Leave group | خروج از گروه |
| GroupSettings.approvers | Expense approvers | تأییدکنندگان هزینه |
| GroupSettings.balances | Members see everyone’s balances | اعضا مانده‌ی همه را ببینند |



## SO · Mobile 390  
Batch all · `boards/SOM01SocialMobile.dc.html` · `screenshots/SOM01SocialMobile.jpg` · dark: `SOM01SocialMobileDark`

#### Mobile rules · 5

- **Nav** — Social home: Home · Groups · (+) · Activities · More. Inside a group: Overview · Activities · (+) · Chat · More (Calendar, Expenses, Lending, Album, Challenges, Members, Settings).
- **Sheets** — Propose expense, connect, new group/activity as bottom sheets.
- **Album** — Grid with pinch zoom; upload from camera roll (≤ 20 MB originals).
- **Settle up** — Full screen; confirm received as primary.
- **Free / busy** — Simplified list per person on phones.



## SO · فارسی RTL  
Batch all · `boards/SOM02SocialFa.dc.html` · `screenshots/SOM02SocialFa.jpg` · dark: `SOM02SocialFaDark`

#### RTL rules · 5

- **Mirroring** — Rail right, notch top-left, progress fills right → left.
- **Money** — Toman with Persian digits and ٬; sign of balance after the number in RTL (۹٬۶۱۰٬۰۰۰ +).
- **Labels** — دنگ · پیشنهادی · تأییدشده · ویرایش در انتظار · تسویه · امانت · گم شده · پیدا شده.
- **RSVP** — می‌آیم · شاید · نمی‌توانم · فهرست انتظار.
- **Dates** — Jalali; week starts Saturday.



---

# Completion screens (Batch D)

Added so every rail item has its own board: Social home, Activities list, My balances, My things & lending, Group members, plus mobile & Persian for them.

## SO-15 · Social home  
Batch D (completion) · `boards/SO15SocialHome.dc.html` · `screenshots/SO15SocialHome.jpg` · dark: `SO15SocialHomeDark`

#### States · 3

- **First use** — Your social space · Connect with friends, start a group or plan an activity. Nothing here is visible to your workspaces. · ConnectNew activity
- **Nothing coming up** — “Nothing planned in the next 30 days” with New activity and Find groups.
- **Only guest activities** — Activities you were invited to without a group appear normally in Coming up with the organiser’s name.

#### Rules

- **Job** — What’s next with friends and what needs me — not a feed. No posts, likes or follower counts.
- **Signature card** — Next activity you’re going to; notch = Open activity. If none: “Plan something” card (notch New activity).
- **Needs you** — Connection requests, payments to confirm, overdue things, open polls, expenses to approve, join requests (admins). Each with one action.
- **Balances** — Net across groups and independent activities, approved records only; link to SO-17.
- **Groups** — Your groups with unread chat count.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Next activity, coming up | P6-02 | Not built | activityRepo.mine({range}) |
| Needs you | P6-01..04 | Not built | socialInboxRepo.list (composed in mock) |
| Balances summary | P6-03 | Not built | balanceRepo.mineAll |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| SocialHome.title | Social | اجتماعی |
| SocialHome.comingUp | Coming up | پیش رو |
| SocialHome.needsYou | Needs you | منتظر شما |
| SocialHome.planSomething | Plan something | برنامه‌ای بچینید |



## SO-16 · Activities  
Batch D (completion) · `boards/SO16Activities.dc.html` · `screenshots/SO16Activities.jpg` · dark: `SO16ActivitiesDark`

#### Rules

- **Two places** — /social/activities lists all activities you take part in (groups + independent). Inside a group, the Activities rail item shows the same list filtered to that group, with “New activity” prefilled.
- **Calendar view** — Segmented List/Calendar; Calendar = Personal calendar component with the social layer (coral) only.
- **Recurring** — Weekly sports show the next occurrence; RSVP per occurrence.
- **Past** — Past activities keep expenses, album link and checklist read-only.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Activities I take part in | P6-02 | Not built | activityRepo.mine({filter}) / byGroup(groupId) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Activities.title | Activities | فعالیت‌ها |
| Activities.needsAnswer | Needs answer | منتظر پاسخ |
| Activities.organisedByMe | Organised by me | سازمان‌دهی من |
| Activities.independent | independent | مستقل |



## SO-17 · My balances  
Batch D (completion) · `boards/SO17MyBalances.dc.html` · `screenshots/SO17MyBalances.jpg` · dark: `SO17MyBalancesDark`

#### Rules

- **Scope** — All groups and independent activities you take part in; one row per scope with its own currency. No conversion, no cross-currency totals.
- **Totals card** — Per-currency net; signature card notch = Settle up (opens the scope with the most open transfers).
- **Waiting for you** — Payments others recorded that you must confirm.
- **Personal finance** — Each settled item can be recorded once in Personal Finance by choice (idempotent).


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| My balances across scopes | P6-03 | Not built | balanceRepo.mineAll() grouped by currency |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| MyBalances.title | My balances | مانده‌های من |
| MyBalances.noConversion | Totals are never added across currencies. | مبلغ ارزهای مختلف با هم جمع نمی‌شود. |
| MyBalances.waiting | Waiting for you | منتظر شما |



## SO-18 · My things & lending  
Batch D (completion) · `boards/SO18MyThings.dc.html` · `screenshots/SO18MyThings.jpg` · dark: `SO18MyThingsDark`

#### Rules

- **My things** — Private inventory (photo, category, notes). Lend directly to a connection, or share with a group so members can request it.
- **Same flow** — Loans use the SO-10 flow and loan card (two-sided handover/return, issues, no fines).
- **Borrowed** — Things you hold from others, with due dates and Return action.
- **Lost & found** — Your posts and claims across groups.
- **Privacy** — No addresses; handover place is free text.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| My things, loans | P6-04 personal lending | Not built | lendingRepo.mine / share(groupId) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| MyThings.title | My things & lending | وسایل من و امانت |
| MyThings.available | Available | در دسترس |
| MyThings.lentOut | Lent out | امانت داده‌شده |
| MyThings.borrowed | Borrowed | امانت گرفته‌شده |



## SO-19 · Group members  
Batch D (completion) · `boards/SO19GroupMembers.dc.html` · `screenshots/SO19GroupMembers.jpg` · dark: `SO19GroupMembersDark`

**Main screen:** “Who’s around” PeopleWorkload card in status-only mode (see `PEOPLE_FLOW.md` §1), then members list + member card.

#### Rules

- **Roles** — Owner (one) · Admin · Member. Admins approve joins, manage invites, remove members, approve expenses (setting). Owner transfers ownership.
- **Tabs** — Members · Requests (same as SO-03 admin list) · Invited (pending invites, resend/cancel).
- **Who’s around** — Notched PeopleWorkload component in status-only mode (no bars, no “now working on”). Notch = member picker A–Z (8 + “+N”); selection drives the strip, the highlighted row and the member card. Status per group, opt-in, set by the person: Available · Busy · Away + note + clear after; never derived from calendar, location or activity.
- **Member card** — Signature card; notch = Message (direct). Admin actions below.
- **Privacy** — No member’s connections, circles, balances or other groups are shown.
- **Activity guests** — Not listed as members; shown only in their activity.


#### Permissions

| Action | Owner | Admin | Member | Activity guest | Join requested |
| --- | --- | --- | --- | --- | --- |
| See members | ✓ | ✓ | ✓ | — | — |
| Invite | ✓ | ✓ | setting | — | — |
| Change roles | ✓ | — | — | — | — |
| Remove member | ✓ | ✓ | — | — | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Members, roles, invites, requests | P6-01 | Not built | socialGroupRepo.members / setRole / remove / invites |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| GroupMembers.title | Members | اعضا |
| GroupMembers.makeAdmin | Make admin | ادمین کردن |
| GroupMembers.remove | Remove… | حذف… |
| GroupMembers.invited | Invited | دعوت‌شده |



## SO · Mobile & فارسی (2)  
Batch D (completion) · `boards/SOM03SocialMobile2.dc.html` · `screenshots/SOM03SocialMobile2.jpg` · dark: `SOM03SocialMobile2Dark`

Phones: SO-15 home · SO-16 activities · SO-17 my balances · SO-18 my things · SO-19 members · Persian SO-15 and SO-17 (sign after the number in RTL; lira as لیر).

#### Rules · 2

- **Same rules** — As SOM01 / SOM02: Social nav Home · Groups · (+) · Activities · More; My balances and My things are under More.
- **RTL** — Sign after the number in RTL (۹٬۶۱۰٬۰۰۰ +); lira shown as لیر.


