# design/company — Companies (Phase 4) · complete package

**For Claude Code.** Read this file, then `SCREENS.md`, `DECISIONS.md`, and only the `SPEC.md` section of the screen you are building.
Prerequisites: Projects and Teams packages implemented (`design/shared`, `design/project`, `design/team`). Company reuses their shell, assignment, drawers, files, sheets, goals and calendar components.
This package only ADDS `design/company/`.

## What is designed
- **Batch A** — CS-01 company shell & access · CO-00 All companies · CO-01 Overview · CO-02 Departments · CO-03 People directory (work profile) · CO-90 sheets (company-new, company-invite, department-new).
- **Batch B** — CO-04 Projects & teams (portfolio + attach existing) · CO-05 Goals (cascade) · CO-06 Resources & capacity · CO-07 Knowledge base.
- **Batch C** — CO-08 Expenses · CO-09 Approvals · CO-10 Budgets · CO-11 Reimbursements · CO-12 Employee file (sealed) + corrective actions · CO-13 Reports & audit · CO-14 Settings.
- **Variants** — dark for every board; mobile 390 `COM01CompanyMobile`; Persian RTL `COM02CompanyFa`.

## Files
```
design/company/  README.md · PEOPLE_FLOW.md · SPEC.md · SCREENS.md · DECISIONS.md · PROMPTS.md
                 boards/CS01, CO00…CO14, CO90, COM01, COM02 (+Dark) + support.js · screenshots/ (47 jpg)
```

## Non-negotiable (in addition to Personal, Projects and Teams rules)
1. Companies scope colour = purple (`data-scope="company"`, deep `#7A2BC4`, soft `#F4E9FF`, dot `#C07BFF`; dark deep `#C49DEB`, soft `#3B2A55`). Project refs blue, team refs indigo, department chips purple. Volt only for now/today.
2. Signature cards (notch never empty): CO-01 portfolio (Open portfolio) · CO-02 department (Edit department / Copy link) · CO-03 work profile (Edit / Copy contact) · CO-05 goal (Update progress) · CO-06 resource request (Approve request) · CO-08 expense (Open approval / Edit / Withdraw) · CO-09 approval (Approve) · CO-10 budget (Request budget change) · CO-11 payment run (Confirm payment) · CO-12 employee file (Add document / Download pack).
3. **No composite health score** (owner decision): transparent KPIs with numerator, denominator and source. No AI, no executive insight, no prediction.
4. **Money:** one company currency (owner decision), exact integer amounts; short form only in tiles. Pending expenses never count in budgets; approval ≠ paid; “Settled” only after Finance confirms a payment made outside the app. No ledger, tax, invoicing or payroll. Nothing written to Personal Finance automatically.
5. **Approvals:** simple sequential chains (owner decision), versioned per subject type, amount conditions, escalation; requester never approves own item.
6. **Sealed employee file** (owner decision): separate from the work profile; explicit time-limited grants (not implied by Owner/Org Admin); every access audited and visible to the employee; corrective actions need reason + evidence, allow response and appeal; no monetary punishment.
7. **Isolation:** nothing crosses companies. Department scope narrows only. Attaching an existing team/project requires owner consent with a custody & privacy preview and never bulk-reveals past private items.
8. Mock adapters only (backend Phase 4 not built); repo names in each SPEC “Data & backend” tab.
9. Permissions tables → mock `capabilities` per company; special grants (Finance / HR / Security reviewer) are separate from roles.
10. One screen per task · stop · commit, don’t push · no new dependencies · tsc + eslint + targeted vitest.
11. If something is not in the boards/spec: stop and ask.


## Update 10 Nov 2026
Shared components **PeopleWorkload** and **CaseFlow** restored from the concept boards → read `PEOPLE_FLOW.md`. Affected boards: CO-03 (per department; bars only for Owner / Org Admin / that department’s manager) CO-09 approval flow of the selected item (read-only). Build each component once; the first prompt that needs it builds it.
