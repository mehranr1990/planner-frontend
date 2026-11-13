# پرامپت‌های Claude Code — پیام‌ها و جلسات

## راه‌اندازی
1. پوشه‌ی `design/messages` را کنار بقیه در ریپو بگذار.
2. شرط شروع: Personal، Project، Team و Company زده شده باشند.
3. فایل `13_MESSAGING_DELETE_POLICY_FINAL.md` (قانون ۴۸ ساعت) داخل همین پوشه هست.
4. پرامپت‌ها را به ترتیب و یکی‌یکی بده.

---

### M0 — بررسی فقط‌خواندنی
```
Read design/messages/README.md, SCREENS.md, DECISIONS.md, 13_MESSAGING_DELETE_POLICY_FINAL.md (SPEC.md only by section). Inspect the header, rails of Project/Team/Company,
sheet host, calendar event creation, task engines/assignment, files component, notification bell. READ ONLY.
Report reuse, conflicts with M1–M10, and a plan for prompts M1–M18 with files per step. Stop.
```

### M1 — پوسته (MS-01)
```
Implement MS-01 only: header Messages button with unread badge in every context (⌘/Ctrl+Shift+M), /messages route without context rail, “Channels” rail item in Project/Team/Company (M2),
access states (blocked, removed, joined later, reconnecting, deleted user, policy label) in AccessState. Mock conversationRepo with a fake live event emitter. Gates, commit, stop.
```

### M2 — فهرست و گفتگوی خصوصی (MS-02)
```
Implement MS-02 only: conversation list (All·Direct·Groups·Channels·Meetings tabs, source chips, unread, mentions), direct conversation (bubbles, day separators, unread line, reply quote,
reactions, image, voice bubble, edited label, tombstone, receipts per owner decision), sending states with idempotent client op ids. Colour by source. Gates, commit, stop.
```

### M3 — کانال کاری (MS-03)
```
Implement MS-03 only: workspace Channels page (channel list + conversation) in Project, Team and Company with the same component; pinned bar, joined-later note, @mentions, task link cards
(only if readable), channel policy flags. Gates, commit, stop.
```

### M4 — کارهای روی پیام (MS-04)
```
Implement MS-04 only following 13_MESSAGING_DELETE_POLICY_FINAL.md exactly: hover toolbar, context menu, edit with “n h left”, delete dialogs (≤48h for everyone/for me; >48h for me; channel policy off),
forward to authorised targets, pin, report. Server (mock) decides the 48h window from createdAt. Tests for the 7 acceptance cases in the mock. Gates, commit, stop.
```

### M5 — نوار نوشتن (MS-05)
```
Implement MS-05 only: rich text composer, mention picker (members only), attachments with progress, voice recording via MediaRecorder (feature-checked) with hard stop at 2:00 or 10 MB,
offline queue, link previews off by default. No new dependencies. Gates, commit, stop.
```

### M6 — برگه‌ها (MS-90)
```
Implement ?sheet=conversation-new and ?sheet=channel-new only. Lookup never reveals account existence; channel policies can only be stricter than the workspace. Gates, commit, stop.
```

### M7 — مرور دسته‌ی الف
```
QA Batch A against screenshots (light, Dark, MSM01, MSM02). Fix differences only. Full gate once. Commit, stop.
```

### M8 — رشته‌ی پاسخ (MS-06)
```
Implement MS-06 only: thread panel (desktop right panel, mobile full screen), “also send to channel”, thread unread counts, deleted parent tombstone. Gates, commit, stop.
```

### M9 — جست‌وجو (MS-07)
```
Implement MS-07 only: search with From/In/Has/Date filters over visible history only (excludes delete-for-me, pre-join, deleted-for-everyone); open result scrolled + highlighted. Gates, commit, stop.
```

### M10 — اطلاعات گفتگو (MS-08)
```
Implement MS-08 only: info panel with Members/Media & files/Pinned FolderTabs, settings (notifications, link previews, newcomer history), mute, block (direct), report, leave; admin actions. Gates, commit, stop.
```

### M11 — تنظیمات پیام (MS-09)
```
Implement MS-09 only: privacy (receipts reciprocal, last seen, online, typing, who can DM), notifications (quiet hours), blocked list. Link from Personal › Settings. Gates, commit, stop.
```

### M12 — مرور دسته‌ی ب
```
QA Batch B against screenshots. Fix differences only. Commit, stop.
```

### M13 — فهرست جلسات (MT-01)
```
Implement MT-01 only: Meetings tab (Upcoming/Past/Needs minutes), rows with source colour, RSVP chip. Meetings also render in their source calendar (Personal/project/team/company). Mock meetingRepo. Gates, commit, stop.
```

### M14 — صفحه‌ی جلسه (MT-02)
```
Implement MT-02 only: ?sheet=meeting-new from any calendar (belongs-to, time, invitees, link), meeting page with signature head (notch Open meeting link / Edit / Copy link), RSVP,
FolderTabs Agenda·Notes·Files, link to source channel. No call features. Gates, commit, stop.
```

### M15 — صورت‌جلسه (MT-03)
```
Implement MT-03 only: minutes Draft → In review → Approved → Final with versions, decisions, action items → “Make task” in the source workspace (normal assignment), reviewer signature card (notch Approve minutes). Gates, commit, stop.
```

### M16 — اطلاعیه‌ها (MT-04)
```
Implement MT-04 only: workspace announcements feed, composer signature card (audience, acknowledgement, pin, schedule; notch Publish), acknowledgement status and reminders. Gates, commit, stop.
```

### M17 — موبایل و فارسی
```
QA all message/meeting screens at 390 against MSM01 and RTL against MSM02 (my bubbles left in RTL, Persian digits). Fix differences only. Commit, stop.
```

### M18 — مرور نهایی
```
Full gate once (tsc, eslint, build, vitest, e2e incl. axe). Report PASS/FAIL/NOT RUN per screen. Commit, stop.
```
