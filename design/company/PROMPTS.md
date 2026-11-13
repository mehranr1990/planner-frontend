# پرامپت‌های Claude Code — شرکت‌ها

## راه‌اندازی
1. پوشه‌ی `design/company` را کنار `design/team` در ریپو بگذار.
2. شرط شروع: Project و Team کامل زده شده باشند.
3. پرامپت‌ها را به ترتیب و هر بار فقط یکی بده.

> کامپوننت‌های مشترک People & workload و Case Flow در `design/company/PEOPLE_FLOW.md` توضیح داده شده‌اند؛ اگر قبلاً در بخش تیم یا پروژه ساخته شده‌اند، فقط استفاده کن.

---

### C0 — بررسی فقط‌خواندنی
```
Read design/company/README.md, SCREENS.md, DECISIONS.md (SPEC.md only by section). Inspect the implemented shell, Project/Team repos, assignment machinery, drawers,
Files, Goals, Calendar, sheet host and Personal Finance (only to confirm nothing writes to it automatically). READ ONLY.
Report reuse, conflicts with C1–C12, and a step plan for prompts C1–C20 with files per step. Stop.
```

### C1 — پوسته‌ی شرکت (CS-01)
```
Implement CS-01 only: Companies row in the switcher (mock companyRepo), CompanyCollectionRail, CompanyRail (C2), department scope chip + mobile sheet (narrows only),
mobile nav Overview·Work·(+)·Approvals·More, company access states added to AccessState (sealed file, mandatory policy, outside department, attach pending, left, not counted yet).
Routes /companies/[id]/… show ComingSoon until built. Purple scope. Gates, commit, stop.
```

### C2 — همه‌ی شرکت‌ها (CO-00)
```
Implement CO-00 /companies only (cards, invitation strip, pills, states). Gates, commit, stop.
```

### C3 — نمای کلی (CO-01)
```
Implement CO-01 only. Read the S6 reconciliation tab. Portfolio signature card (projects on track + quarter history, notch Open portfolio), KPI tiles with sources, watch banner with source,
FolderTabs Departments·Portfolio·Goals·Capacity, budget card (approved/committed/left; pending only as text), approvals-for-me rows with Review. No score, no AI. Gates, commit, stop.
```

### C4 — دپارتمان‌ها (CO-02)
```
Implement CO-02 only: org tree (expand, re-parent with preview), department signature card, inherited policies list (Mandatory/Default/Optional + override state). Gates, commit, stop.
```

### C5 — افراد (CO-03)
```
Implement CO-03 only: department pills + shared PeopleWorkload card for the selected department (design/company/PEOPLE_FLOW.md §1; build the component first if it does not exist yet; workload bars only for Owner / Org Admin / that department’s manager, status-only for others), directory table, work profile signature card, sealed file row with Request access (no file content here). Gates, commit, stop.
```

### C6 — برگه‌ها (CO-90)
```
Implement ?sheet=company-new, company-invite, department-new. Currency lock note; verified-only invite copy. Gates, commit, stop.
```

### C7 — مرور دسته‌ی الف
```
QA Batch A against screenshots (light, Dark, COM01, COM02). Fix differences only. Full gate once. Commit, stop.
```

### C8 — پروژه‌ها و تیم‌ها (CO-04)
```
Implement CO-04 only: portfolio table (projects / teams tabs), pending attach card, attach request flow with the owner-side custody & privacy preview (accept + reauth), separate consent per project. Mock attachRepo. Gates, commit, stop.
```

### C9 — اهداف (CO-05)
```
Implement CO-05 by reusing the Goals components: company → department → linked team goals/projects tree, KR sources, notch Update progress. Gates, commit, stop.
```

### C10 — منابع (CO-06)
```
Implement CO-06 only: equipment list with statuses, request flow (dates, reason, conflict suggestion) through the “Resources” chain, request signature card (notch Approve request),
Rooms tab, Capacity heat table. Gates, commit, stop.
```

### C11 — پایگاه دانش (CO-07)
```
Implement CO-07 only: folder tree (restricted folders hidden without grant), page view with versions, acknowledgement per version, search limited to readable items. Reuse the notes editor. Gates, commit, stop.
```

### C12 — هزینه‌ها (CO-08)
```
Implement CO-08 only: list with exact amounts (tabular numerals), statuses, receipt, ?sheet=expense-new (receipt first, I paid / company card), detail signature card with approval chain,
changes-requested resubmit. Never write to Personal Finance. Mock expenseRepo. Gates, commit, stop.
```

### C13 — تأییدها (CO-09)
```
Implement CO-09 only: inbox For me / I requested / History, detail with sequential chain, Approval flow below = shared CaseFlow component (design/company/PEOPLE_FLOW.md §2; build it first if it does not exist yet; read-only, columns = chain steps of the item’s chain version, outcome tiles = after approval), Approve (notch) / Reject (reason) / Request changes (comment), escalation display,
requester-is-approver routing, grant check at decision time. Mock approvalRepo + chain v3. Gates, commit, stop.
```

### C14 — بودجه (CO-10)
```
Implement CO-10 only: departments / projects table with approved, committed, left, variance; pending shown separately; detail signature card (notch Request budget change → Budget change chain). Gates, commit, stop.
```

### C15 — بازپرداخت (CO-11)
```
Implement CO-11 only: To settle list, payment run signature card (reference, notch Confirm payment), Settled state, “not received” within 14 days, optional “Record in my finance” (explicit, idempotent). No money movement. Gates, commit, stop.
```

### C16 — پرونده‌ی کارمند (CO-12)
```
Implement CO-12 only: sealed state without grant (Request access), file view with grant banner, documents with per-doc grants, access log visible to the employee,
corrective actions (reason + evidence, employee response, appeal, close with outcome), audit on every open. Owner/Org Admin get NO access by role. Read-only on mobile. Gates, commit, stop.
```

### C17 — گزارش‌ها (CO-13)
```
Implement CO-13 only: report cards, expenses report (approved only, View as table), exports (server-side mock, watermarked, logged), audit log tab (admins). Gates, commit, stop.
```

### C18 — تنظیمات (CO-14)
```
Implement CO-14 only: FolderTabs General·Policies·Approval chains·Roles & access·Lifecycle. Chain editor = sequential steps with amount conditions, draft → publish (new requests only).
Lifecycle: transfer (accept + reauth, ≥1 eligible owner), archive, delete with retention holds. Gates, commit, stop.
```

### C19 — موبایل و فارسی
```
QA all company screens at 390 against COM01 and Persian against COM02 (Toman with Persian digits and ٬). Fix differences only. Commit, stop.
```

### C20 — مرور نهایی
```
QA Batches B and C against screenshots (light, dark, tab captures). Full gate once; report PASS/FAIL/NOT RUN per screen. Commit, stop.
```

## نکته‌ها
- اگر Claude Code به چیزی رسید که در بوردها نیست، باید بپرسد.
- عددهای C6 (سقف مبلغ‌ها و روزهای ارجاع) فقط نمونه‌اند؛ مقدار واقعی را خودت در تنظیمات شرکت تعیین می‌کنی.
