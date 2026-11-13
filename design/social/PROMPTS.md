# پرامپت‌های Claude Code — بخش اجتماعی

## راه‌اندازی
1. پوشه‌ی `design/social` را کنار بقیه در ریپو بگذار.
2. شرط شروع: پیام‌ها (فاز ۵) زده شده باشد، چون گفتگوی گروه و فعالیت از همان موتور است.
3. پرامپت‌ها را به ترتیب و یکی‌یکی بده.

> کامپوننت مشترک People & workload در `design/social/PEOPLE_FLOW.md` توضیح داده شده؛ اگر قبلاً ساخته شده فقط استفاده کن (حالت فقط وضعیت).

---

### S0 — بررسی فقط‌خواندنی
```
Read design/social/README.md, SCREENS.md, DECISIONS.md (SPEC.md only by section). Inspect contexts.ts/types.ts, the context switcher, Messages engine (conversations), calendar projections,
task engine/assignment, Files, Personal Finance (opt-in posting only). READ ONLY. Report reuse, conflicts with S1–S10, and a plan for prompts S1–S17 with files per step. Stop.
```

### S1 — پوسته (SO-01)
```
Implement SO-01 only: add the `social` context (5th, coral scope tokens incl. dark), Social home rail and group rail (with back item), switcher Social section (groups, pending requests),
mobile navs, social access states in AccessState. Routes render ComingSoon until built. Gates, commit, stop.
```

### S2 — ارتباط‌ها (SO-02)
```
Implement SO-02 only: requests (accept/ignore), connections list, private circles, connection signature card (notch Message → direct conversation), ?sheet=connect with non-revealing copy,
balance-between line (mock). Mock connectionRepo, circleRepo. Gates, commit, stop.
```

### S3 — گروه‌ها و پیوستن (SO-03)
```
Implement SO-03 only: My groups / Discover (preview only), Ask to join with note, pending state, admin approve/decline list. Private groups never listed. Mock socialGroupRepo. Gates, commit, stop.
```

### S4 — نمای کلی گروه (SO-04)
```
Implement SO-04 only: next-activity signature card (notch Open activity), balance card (approved only), FolderTabs Upcoming·Activity·Lending, people card (avatars with the optional group status dot). Chat rail item opens the group conversation. Gates, commit, stop.
```

### S5 — برگه‌ها (SO-90)
```
Implement ?sheet=group-new, activity-new (templates), connect. Currency set once. Gates, commit, stop.
```

### S6 — مرور دسته‌ی الف
```
QA Batch A against screenshots (light, Dark, SOM01, SOM02). Fix differences only. Full gate once. Commit, stop.
```

### S7 — فعالیت (SO-05)
```
Implement SO-05 only: itinerary (multi-day), RSVP signature card with capacity + waitlist (12 h offer), checklist (items → tasks), people, files, guest view, cancelled state,
calendar projection for Going/Maybe. Mock activityRepo. Gates, commit, stop.
```

### S8 — نظرسنجی و آزاد/مشغول (SO-06)
```
Implement SO-06 only: date/time poll (yes / if needed, deadline, notch Pick final date), single/multiple polls, consent-based free/busy grid (no titles, “not shared” hatched), consent prompt. Gates, commit, stop.
```

### S9 — مرور دسته‌ی ب
```
QA Batch B against screenshots. Fix differences only. Commit, stop.
```

### S10 — دنگ (SO-07)
```
Implement SO-07 only: expense list with statuses (Proposed not counted, Approved, Edit pending, Rejected), scope switch (group / each activity), balance signature card with simplified transfers (notch Settle up),
visibility rules. Exact integer math in the mock with unit tests. Gates, commit, stop.
```

### S11 — جزئیات و تقسیم (SO-08)
```
Implement SO-08 + ?sheet=expense-propose only: amount, payer, date, receipt, split editor (Equal/Fixed/Percent/Weighted/Selected) with live sum check and deterministic remainder,
approver card (notch Approve expense; Edit & approve; Reject with reason), revisions of approved items, opt-in “Record my share in Personal Finance” (idempotent). Unit tests for splits. Gates, commit, stop.
```

### S12 — تسویه (SO-09)
```
Implement SO-09 only: transfers list, record payment card (notch Record payment), confirm received, not received, settled state. No money movement. Gates, commit, stop.
```

### S13 — امانت و گم‌شده‌ها (SO-10)
```
Implement SO-10 only: things (personal/group, keeper), loan flow with two-sided handover/return confirmations, overdue/lost/damaged issues, lost & found posts and claims with mutual resolution,
loan signature card (notch Confirm handover/return). No fines, no addresses. Gates, commit, stop.
```

### S14 — آلبوم (SO-11)
```
Implement SO-11 only: albums, photo grid, upload with progress (reject > 20 MB), lightbox, remove own photos; display copies without location (mock). Gates, commit, stop.
```

### S15 — چالش‌ها (SO-12)
```
Implement SO-12 only: challenge signature card (shared total, my contribution, notch Log progress), join/leave, open challenges list; no auto data from Personal. Gates, commit, stop.
```

### S16 — تنظیمات و خروج (SO-14)
```
Implement SO-14 only: FolderTabs General·Members·Leave; leave/remove checklist (balances, things held, photos), owner must transfer first. Gates, commit, stop.
```

### S16b — صفحه‌های تکمیلی (SO-15…SO-19)
```
Implement SO-15 /social home, SO-16 activities list (top + group-filtered), SO-17 my balances (per currency, never summed across currencies), SO-18 my things & lending, SO-19 group members (top: shared PeopleWorkload card in status-only mode “Who’s around” — design/social/PEOPLE_FLOW.md §1; build it first if it does not exist yet; group-scoped opt-in status, no workload, no now-working-on).
One screen per commit inside this prompt is fine; stop after all five. Mobile + Persian per SOM03. Gates, commit, stop.
```

### S17 — مرور نهایی
```
QA Batch C + mobile + Persian against screenshots. Full gate once; report PASS/FAIL/NOT RUN per screen. Commit, stop.
```
