# Messages & Meetings (Phase 5) — design spec · COMPLETE

Status: **all screens designed, awaiting owner approval.** Read with `README.md`, `SCREENS.md`, `DECISIONS.md`, `../shared/SHARED.md`, and `13_MESSAGING_DELETE_POLICY_FINAL.md` from the backend pack (approved delete/edit policy).
Visuals: `screenshots/<Board>.jpg`, dark `<Board>Dark.jpg`, tab captures `<Board>__<Tab>.jpg`.

---

## MS-01 · Messages shell & access  
Batch A · `boards/MS01MessagesShell.dc.html` · `screenshots/MS01MessagesShell.jpg` · dark: `MS01MessagesShellDark`

- **Header Messages button** — left of notifications in every context; badge = unread, unmuted conversations; opens /messages (⌘/Ctrl+Shift+M). Active state = slate fill.
- **Workspace “Channels” rail item** — Project (group 3, first), Team (group 3, first), Company (group 4, first); shows that workspace’s channels; badge = unread mentions.
- **Access states** — Blocked (composer replaced by note; presence & direct mentions hidden; shared groups unaffected) · Removed from conversation (immediate: no list, history, files, stream) · Joined later (history from join; note at top) · Reconnecting (banner, cursor catch-up, no duplicates) · Deleted account (“Deleted user”, messages kept) · Policy from workspace (“Set by …” label).

#### Rules

- **Global surface** — /messages lives outside the four contexts (owner decision) — no context rail; the conversation list takes the rail’s place. Context switcher keeps the last context.
- **Routes** — /messages · /messages/[conversationId] · /messages/[conversationId]/thread/[messageId] · /messages/meetings · /messages/meetings/[meetingId]. Workspace channels also at /projects/[id]/channels/[cid] etc. (same conversation id).
- **Mobile** — Chat icon in the top bar of every context; /messages is a full-screen list; bottom nav of the current context is hidden inside a conversation.
- **Notifications** — Message notifications go to the bell only for mentions and direct messages (others: badge only). Mute per conversation.



## MS-02 · Direct conversation  
Batch A · `boards/MS02DirectConversation.dc.html` · `screenshots/MS02DirectConversation.jpg` · dark: `MS02DirectConversationDark`

#### States · 3

- **Empty conversation** — Say hello to Nazanin · Messages are private to the two of you. No one else, including any company admin, can search them.
- **Blocked** — You blocked Reza. You can’t message each other here. Shared groups still show his messages unless you collapse them. · Unblock
- **Sending states** — On my way · 10:50 · ◷ Sending · See you · 10:51 · ! Not sent · Retry · Each send has an idempotent client id; retry never duplicates.

#### Rules

- **Layout** — Global /messages: conversation list (All · Direct · Groups · Channels · Meetings) + open conversation. Header Messages button with unread count everywhere (owner decision).
- **Colour** — Source colour (owner decision): Direct & groups neutral slate; project channels blue; team indigo; company purple. My bubbles take the source colour.
- **Receipts (owner decision)** — Direct: ✓ sent · ✓✓ delivered · ✓✓ Seen; if either side turns read receipts off, neither sees “Seen”. Last seen same rule.
- **Message types** — Bounded rich text, images, files, voice ≤ 2 min and ≤ 10 MB, reply quote, reactions, edited label, deleted tombstone. Link previews off unless the conversation allows them.
- **Order** — Server order per conversation; unread line at first unread; day separators in the user’s calendar (Jalali/Gregorian).
- **Privacy** — Direct messages are never visible to any workspace admin; search only within what the user can see.
- **No calls** — No voice/video call buttons (owner rule). External meeting links are allowed in meetings.


#### Permissions

| Action | Author | Participant | Channel admin | Workspace admin | Removed / blocked |
| --- | --- | --- | --- | --- | --- |
| Read | ✓ | ✓ | ✓ | ✓ | — |
| Send | ✓ | ✓ | ✓ | ✓ | — |
| Edit (≤ 48h, own) | ✓ | — | — | — | — |
| Delete for everyone (≤ 48h, own) | ✓ | — | — | — | — |
| Delete for me (any time) | ✓ | ✓ | ✓ | ✓ | — |
| React / reply | ✓ | ✓ | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Conversations list, unread counts | P5-01 | Not built | conversationRepo.list({tab}) |
| History (cursor), send with clientOpId | P5-01 REST + P5-04 WS | Not built | messageRepo.page / send |
| Receipts, presence | P5-03 / P5-04 | Not built | receiptRepo / presenceRepo (privacy-filtered) |
| Attachments, voice | P5-03 | Not built | mock blob with size/duration checks |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Messages.title | Messages | پیام‌ها |
| Messages.seen | Seen | دیده شد |
| Messages.edited | edited | ویرایش‌شده |
| Messages.deletedEveryone | You deleted this message for everyone | این پیام را برای همه حذف کردید |
| Messages.deletedOther | This message was deleted | این پیام حذف شد |
| Messages.lastSeen | last seen {time} | آخرین بازدید {time} |
| Messages.newLine | {n} new | {n} پیام جدید |



## MS-03 · Work channel (in a project)  
Batch A · `boards/MS03WorkChannel.dc.html` · `screenshots/MS03WorkChannel.jpg` · dark: `MS03WorkChannelDark`

#### Rules

- **Where** — Each workspace (Project, Team, Company) gets a “Channels” rail item (group 3). The same channels also appear in /messages › Channels with a source chip.
- **Channel** — Name, members = workspace members with access (or a subset), posting rights, policy for author delete-for-everyone (≤ 48h, on/off), history visibility for newcomers (from join or full, per workspace policy).
- **Receipts (owner decision)** — Off in channels: no “Seen by”; only Delivered for your own messages.
- **Pinned** — Pinned bar with count; pin needs channel admin unless policy allows members.
- **Mentions** — @person, @channel (admins only); mention never reveals a hidden member.
- **Task links** — Paste a task link → task card (only if the reader can open it; otherwise “restricted item”).
- **Removal** — Removed member loses access immediately: list, history, files, live stream (server fence).


#### Permissions

| Action | Author | Participant | Channel admin | Workspace admin | Removed / blocked |
| --- | --- | --- | --- | --- | --- |
| Post | ✓ | ✓ | ✓ | ✓ | — |
| Pin | — | policy | ✓ | ✓ | — |
| Delete for everyone (own, ≤48h) | policy | — | — | — | — |
| Remove others’ messages (moderation, audited) | — | — | ✓ | ✓ | — |
| Create channel | — | — | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Workspace channels | P5-01 work channels | Not built | channelRepo.list({workspace}) |
| Channel policy (delete, history, pin) | P5-02 policy | Not built | channelRepo.policy |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Channels.title | Channels | کانال‌ها |
| Channels.joinedNote | You joined on {date} · earlier history follows the channel policy | از {date} عضو شدید · پیام‌های قبلی طبق سیاست کانال |
| Channels.pinned | Pinned | سنجاق‌شده |
| Channels.new | New channel | کانال جدید |



## MS-04 · Message actions  
Batch A · `boards/MS04MessageActions.dc.html` · `screenshots/MS04MessageActions.jpg` · dark: `MS04MessageActionsDark`

- **Hover toolbar** — 3 quick reactions, more reactions, reply, more (also via keyboard ↑/Tab, Shift+F10; long-press on touch).
- **Context menu** — Reply · Reply in thread · Forward… · Edit (shows “n h left”, author ≤ 48h) · Pin · Copy text · Delete…
- **Delete ≤ 48h (direct / private group)** — choose “Delete for everyone” (others see “deleted”) or “Delete for me”.
- **Delete > 48h** — only “Delete for me”; explanation that the other person still sees it.
- **Work channel with policy off** — only “Delete for me”; suggests asking a channel admin.
- **Forward** — only to conversations where you may post (others disabled with reason); attachments only if shareable there.
- **Edit** — banner “Editing message · n h left”, Esc cancels; result shows “edited”.
- **Report** — Spam / Harassment / Something else → workspace moderators or platform support; reporter private.

#### Rules

- **48 hours** — Measured from the server-committed time; the server decides on every command. UI shows “n h left” in the menu; at 0 the item changes, never a client-side guess.
- **Edit** — Author only, ≤ 48h, active member. Label “edited”; revisions not shown to others.
- **Delete for everyone** — Direct and private groups: author ≤ 48h. Work channels: author ≤ 48h only if the channel policy allows. Shows a tombstone to everyone, also in search, replies and notifications.
- **Delete for me** — Any time; hides only for you (also in search, pagination, reconnect). Others unchanged.
- **Moderation** — Workspace admins/moderators may remove messages in work channels (audited, labelled “removed by moderator”). Not available in direct messages.
- **Forward / pin** — Only to conversations where you may post; pin per policy.
- **Keyboard** — Hover toolbar is also reachable with ↑ / Tab; context menu via Shift+F10; long-press on touch.



## MS-05 · Composer states  
Batch A · `boards/MS05Composer.dc.html` · `screenshots/MS05Composer.jpg` · dark: `MS05ComposerDark`

- **Mention picker** — members of this conversation only.
- **Attachments uploading** — thumbnails with progress, remove before send.
- **Voice recording** — timer “0:42 / 2:00”, size “0.9 MB of 10 MB”, cancel, send.
- **Voice limit reached** — stops at 2:00 or 10 MB; send or discard.
- **Offline queue** — banner “Offline · n messages will send when you’re back online”.
- **Link preview** — off by default, “Allow once” or conversation setting.

#### Rules

- **Input** — Bounded rich text (bold, italic, code, lists, links); Enter sends, Shift+Enter new line (desktop); emoji picker; paste image = attachment.
- **Mentions** — Only members of this conversation; hidden members never suggested.
- **Attachments** — Images and files; size/type limits from server; virus scan like Files; remove before send.
- **Voice** — Hold or tap to record; hard stop at 2:00 or 10 MB (owner rule); preview before send; MIME verified server-side.
- **Offline** — Messages queue with client op id and send in order on reconnect; failed → Retry / Delete.
- **Link previews** — Off by default; conversation setting or “allow once”; previews fetched server-side only.



## MS-90 · Message sheets  
Batch A · `boards/MS90MessageSheets.dc.html` · `screenshots/MS90MessageSheets.jpg` · dark: `MS90MessageSheetsDark`

#### Rules

- **Ids** — conversation-new · channel-new (global sheet host).
- **Who can be found** — Mutual connections (Phase 6) and people sharing a workspace; lookup by email or verified phone is privacy-preserving and rate-limited.
- **Group** — 2+ people → private group with optional name; creator = admin.
- **Channel** — Only inside a workspace by its admins; policy toggles default from the workspace and can only be stricter.


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| ConvNew.title | New message | پیام جدید |
| ConvNew.start | Start conversation | شروع گفتگو |
| ChannelNew.title | New channel | کانال جدید |
| ChannelNew.deletePolicy | Authors may delete for everyone (≤ 48h) | نویسنده می‌تواند تا ۴۸ ساعت برای همه حذف کند |



## MS-06 · Thread  
Batch B · `boards/MS06Thread.dc.html` · `screenshots/MS06Thread.jpg` · dark: `MS06ThreadDark`

#### Rules

- **Thread** — Replies to one parent inside the same conversation (authorised); opens as a right panel on desktop, full screen on phones. Route /messages/[cid]/thread/[mid].
- **Also send** — Optional “also send to channel” posts a copy with a link to the thread.
- **Unread** — Threads you take part in get their own unread count in the conversation header (“Threads 2”).
- **Deleted parent** — Parent shows its tombstone; replies stay readable.
- **Permissions** — Same as the parent conversation; removed members lose thread access too.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Thread replies | P5-02 reply/thread | Not built | messageRepo.thread(parentId) / reply |



## MS-07 · Message search  
Batch B · `boards/MS07Search.dc.html` · `screenshots/MS07Search.jpg` · dark: `MS07SearchDark`

#### Rules

- **Scope** — Only conversations the user is a current member of, and only history visible to them (join date, delete-for-self, deletions for everyone).
- **No admin search** — No one — including company admins — can search other people’s direct messages (backend acceptance test).
- **Filters** — From · In · Has (file, image, voice, link) · Date. Results open the conversation scrolled to the message with highlight.
- **Privacy** — Search history is stored only on the device (can be cleared).


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Message search | P5-02 safe search | Not built | searchRepo.messages({q, filters}) — mock filters locally |



## MS-08 · Conversation info  
Batch B · `boards/MS08ConversationInfo.dc.html` · `screenshots/MS08ConversationInfo.jpg` · dark: `MS08ConversationInfoDark`

#### States · 3

- **Direct** — Direct conversation info · Mute · Block Reza B. · Report · Block: no direct messages, calls to action or presence; shared groups unaffected (you may collapse their messages locally).
- **Work channel** — Work channel info · Shows workspace source, policy rows (delete for everyone, history for newcomers, pinning) with “Set by Website Redesign” when inherited; channel admins can change within workspace limits. No Leave for mandatory channels.
- **Removed** — If you’re removed while this panel is open, it closes and the conversation shows the “no longer in this conversation” state.

#### Rules

- **Panel** — Right panel on desktop (full screen on phone) with header, quick actions, FolderTabs Members · Media & files · Pinned, settings and danger zone.
- **Group admins** — Creator is admin; admins add/remove people, rename, change newcomer history (private group default off).
- **Leave** — Leaving removes access immediately; your messages stay for others (normal group rule).
- **Report** — Report conversation/message → moderators (workspace) or support (direct/group).


#### Permissions

| Action | Member | Guest | Group admin | Workspace admin | Removed |
| --- | --- | --- | --- | --- | --- |
| Add / remove people | — | — | ✓ | ✓ | — |
| Rename / settings | — | — | ✓ | ✓ | — |
| Mute / report / leave | ✓ | ✓ | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Participants, roles, settings | P5-01 participants | Not built | conversationRepo.info / participants |
| Mute, block, report | P5-02 / P5-06 | Not built | muteRepo / blockRepo / reportRepo |



## MS-09 · Message privacy & notifications  
Batch B · `boards/MS09MessageSettings.dc.html` · `screenshots/MS09MessageSettings.jpg` · dark: `MS09MessageSettingsDark`

#### Rules

- **Defaults (owner decision)** — Read receipts on in direct messages, off in groups and channels; reciprocal: if you hide yours you don’t see others’.
- **Workspace overrides** — A workspace may force receipts off in its channels (never on).
- **Last seen / online** — Separate controls; “Nobody” hides both ways. Presence is ephemeral and never stored as history.
- **Who can DM me** — Connections (Phase 6) and people sharing a workspace; others can’t start a direct conversation.
- **Quiet hours** — Mentions-only notifications in the chosen hours; the badge still counts.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Message privacy settings | P5-03 / P5-04 privacy controls | Not built | messageSettingsRepo.get / set |
| Blocked list | P5-06 block | Not built | blockRepo.list / unblock |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| MsgSettings.receiptsDm | Read receipts in direct messages | رسید خواندن در پیام‌های خصوصی |
| MsgSettings.lastSeen | Last seen | آخرین بازدید |
| MsgSettings.whoCanDm | Who can message me directly | چه کسانی می‌توانند مستقیم پیام بدهند |
| MsgSettings.quiet | Quiet hours | ساعات سکوت |



## MT-01 · Meetings  
Batch C · `boards/MT01Meetings.dc.html` · `screenshots/MT01Meetings.jpg` · dark: `MT01MeetingsDark`

#### Rules

- **Where (owner decision)** — Meetings are created from any calendar (Personal, Project, Team, Company) and have their own page /messages/meetings/[id]; this tab lists all meetings you’re invited to.
- **Source colour** — Left bar and chip use the source colour; Personal meetings neutral slate.
- **RSVP** — Going · Maybe · Not going; “Respond” chip when you haven’t answered.
- **Needs minutes** — Past meetings where you’re the minute taker and minutes aren’t final.
- **No calls** — Meetings link to external URLs (Meet/Zoom/Teams links as plain URLs); no built-in audio/video.


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Meetings for me | P5-05 meetings | Not built | meetingRepo.list({range, status}) |



## MT-02 · Meeting page  
Batch C · `boards/MT02MeetingPage.dc.html` · `screenshots/MT02MeetingPage.jpg` · dark: `MT02MeetingPageDark`

#### States · 3

- **Create** — New meeting (?sheet=meeting-new) · Title · Workshop · onboarding · Where it belongs · Design Team ▾ (Personal · project · team · company) · When · Tue 21 Mehr · 9:30 – 11:30 · Invite · Design Team (8) + Kian F. · Link · meet.example.com/… (optional) · Belongs-to sets who can see it, its colour and which calendar shows it.
- **Personal meeting** — A Personal meeting (e.g. coffee with a friend) has invitees, agenda and link but no workspace; minutes are optional and private to attendees.
- **Not invited** — People who can see the source calendar but aren’t invited see “Busy · team meeting” only if the source allows; otherwise nothing.

#### Rules

- **Signature card** — Head card; notch = Open meeting link (if none: Edit meeting for organiser, Copy link for others).
- **Tabs** — Agenda (owners, timeboxes, check off) · Notes (live, become draft minutes) · Files (attach or link from source files).
- **Roles** — Organiser edits everything; minute taker owns minutes; attendees RSVP, add notes and agenda items (policy).
- **Source** — Belongs to Personal / project / team / company; visibility and colour follow the source.


#### Permissions

| Action | Minute taker | Attendee | Organiser | Workspace admin | Not invited |
| --- | --- | --- | --- | --- | --- |
| See meeting | ✓ | ✓ | ✓ | ✓ | — |
| RSVP | ✓ | ✓ | ✓ | ✓ | — |
| Edit agenda | ✓ | policy | ✓ | ✓ | — |
| Edit meeting | — | — | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Meeting, invitees, RSVP, agenda, files, link | P5-05 meetings | Not built | meetingRepo.get / rsvp / agenda / attach |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Meeting.openLink | Open meeting link | باز کردن لینک جلسه |
| Meeting.agenda | Agenda | دستور جلسه |
| Meeting.notes | Notes | یادداشت‌ها |
| Meeting.rsvp.going | Going | می‌آیم |



## MT-03 · Minutes & action items  
Batch C · `boards/MT03Minutes.dc.html` · `screenshots/MT03Minutes.jpg` · dark: `MT03MinutesDark`

#### Rules

- **Workflow** — Draft (minute taker) → In review (chosen reviewers) → Approved (all reviewers) → Final (organiser). Request changes returns to Draft with a comment. Versions kept.
- **Decisions** — Recorded as a list with who proposed; appear in the source workspace activity.
- **Action items** — “Make task” creates an authoritative task in the source workspace (or Personal for personal meetings) with assignee → normal Pending/Accepted assignment. The item links to the task; no copies.
- **Review card** — Signature card for the current reviewer; notch = Approve minutes.
- **Personal meetings** — Minutes optional, no review step.


#### Permissions

| Action | Minute taker | Attendee | Organiser | Workspace admin | Not invited |
| --- | --- | --- | --- | --- | --- |
| Write draft | ✓ | — | ✓ | — | — |
| Review / approve | — | if reviewer | — | — | — |
| Mark final | — | — | ✓ | ✓ | — |
| Make task | ✓ | — | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Minutes versions, reviews | P5-05 minutes draft/review/approval/final | Not built | minutesRepo.get / submit / review / finalize |
| Action item → task | P5-05 + task engines | Not built | minutesRepo.makeTask(itemId, target) |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Minutes.title | Minutes | صورت‌جلسه |
| Minutes.inReview | In review | در بازبینی |
| Minutes.final | Final | نهایی |
| Minutes.decisions | Decisions | تصمیم‌ها |
| Minutes.makeTask | Make task | تبدیل به کار |
| Minutes.approve | Approve minutes | تأیید صورت‌جلسه |



## MT-04 · Announcements  
Batch C · `boards/MT04Announcements.dc.html` · `screenshots/MT04Announcements.jpg` · dark: `MT04AnnouncementsDark`

#### Rules

- **Where** — Announcements belong to a workspace (Company, Team, Project) and appear at /…/announcements (inside the workspace Channels item as a pinned “Announcements” entry) and in /messages › Channels.
- **Audience** — Whole workspace or a subset (department, team, office). Only people in the audience can see it.
- **Publish** — Composer is a signature card; notch = Publish (or Schedule). Pin for n days; optional acknowledgement.
- **Acknowledgement** — “I’ve read it” per person; author/admins see counts and names; reminders once per day max.
- **Not chat** — No replies by default (optional comments per workspace policy).


#### Permissions

| Action | Member | Guest | Author / Org Admin | Workspace admin | Outside audience |
| --- | --- | --- | --- | --- | --- |
| Read | ✓ | ✓ | ✓ | ✓ | — |
| Publish | — | — | ✓ | ✓ | — |
| See who acknowledged | — | — | ✓ | ✓ | — |


#### Data & backend

| UI needs | Backend (V3 batch) | Status now | Mock in UI |
| --- | --- | --- | --- |
| Announcements, audience, pin, ack | P5-05 announcements | Not built | announcementRepo.list / publish / ack / remind |


#### Copy EN/FA

| Key | English | فارسی |
| --- | --- | --- |
| Announcements.title | Announcements | اطلاعیه‌ها |
| Announcements.ack | I’ve read it | خواندم |
| Announcements.requireAck | Require acknowledgement | تأیید خواندن لازم است |
| Announcements.publish | Publish | انتشار |



## MS · Mobile 390  
Batch all · `boards/MSM01MessagesMobile.dc.html` · `screenshots/MSM01MessagesMobile.jpg` · dark: `MSM01MessagesMobileDark`

#### Mobile rules · 5

- **Entry** — Chat icon in every context’s top bar; /messages is a full-screen list with its own top bar.
- **Conversation** — Full screen; context bottom nav hidden; composer sticks above the keyboard.
- **Actions** — Long-press → reactions row + action sheet; swipe right to reply.
- **Voice** — Hold mic to record, slide to cancel; stops at 2:00 / 10 MB.
- **Meetings** — Meetings tab in the list; meeting page with notch Open meeting link.



## MS · فارسی RTL  
Batch all · `boards/MSM02MessagesFa.dc.html` · `screenshots/MSM02MessagesFa.jpg` · dark: `MSM02MessagesFaDark`

#### RTL rules · 5

- **Bubbles** — In RTL my bubbles sit on the left, others on the right; tails mirror. Mixed Latin text inside <bdi>.
- **Times** — Persian digits; 24-hour; day separators in Jalali.
- **Voice waveform** — Progress fills right → left.
- **Labels** — دیده شد · ویرایش‌شده · این پیام حذف شد · حذف برای همه · حذف فقط برای من.
- **Composer** — Send button on the left; attach on the right.


