# Companies — decision ledger

## APPROVED (owner documents + owner answers 2 Nov 2026)
- Multiple independent companies per account; one custody boundary per company; Departments/Units/Teams inside with per-resource grants.
- Roles Owner / Org Admin / Dept Manager / Team Lead / Member / Viewer; policies Mandatory / Default / Optional (override only for Default).
- Work profile separate from sensitive employee file; basic availability, resources/equipment, optional capacity checks; no HR/payroll.
- Expenses with receipt and payer metadata, versioned approvals, budgets/commitments/allocation, reimbursement with separate acknowledged settlement; no ledger/tax/invoicing.
- Attach existing Teams/Projects only with preview, consent and migration (P4-06).
- **Owner answer:** no composite health score → transparent KPIs with sources.
- **Owner answer:** sealed employee file + corrective actions designed now (grants, audit, response, appeal).
- **Owner answer:** one currency per company (exact amounts).
- **Owner answer:** simple sequential approval chains with amount conditions, versioned, with escalation.
- No AI, no messaging (Phase 5), no paywall, notch never empty.

## APPLIED DEFAULTS (design proposals — owner may override)
| # | Decision | Applied | Alternative |
|---|---|---|---|
| C1 | URLs | `/companies/[id]/…` | active company in state |
| C2 | Rail | 4 groups + Settings (organisation · work · money · knowledge) | flat list from contexts.ts |
| C3 | Department scope | Header chip; narrows only | separate department pages only |
| C4 | Reimbursements | Inside Expenses (tab + own route) | separate rail item |
| C5 | Currency lock | Locked after first approved expense | always editable |
| C6 | Default thresholds | Dept manager always; Finance > 50,000,000 T; Owner > 500,000,000 T; escalate after 3 days | — |
| C7 | Requester = approver | Step routes to deputy / next eligible | skip step |
| C8 | “Not received” window | 14 days after settlement | none |
| C9 | Employee file grants | Time-limited HR reviewer grant; Owner/Org Admin do NOT see files by role | admins see all |
| C10 | Retention example | 7 years after leaving (policy value, editable) | backend policy |
| C11 | Mobile nav | Overview · Work · (+) · Approvals · More | Overview · Projects · Approvals (code) |
| C12 | Knowledge acknowledgement | Per page version, remind once | none |

## OPEN (Claude Code must NOT invent)
- Real thresholds and escalation days per company (C6 are examples).
- Retention periods for employee files and expenses (legal; backend retention policy pending).
- Whether Dept Managers may see salaries/contract values (design: no — not part of the file view).
- Fiscal quarters naming (Q1 = Farvardin–Khordad assumed).
- Whether headcount requests use the same chain engine (design: yes, subject type “Headcount”).

## DEVIATIONS FROM S6 BOARD
- Removed: health ring score, Executive insight + “Plan allocation”, Assistant FAB, ✓/✕ quick approve on overview (approve only from the detail). See CO-01 “S6 reconciliation” tab.

## OWNER UPDATE · 10 Nov 2026 — concept components restored
- Owner asked to bring back **People & workload** (S5 Team) and **Case Flow** (notched board). Spec: `PEOPLE_FLOW.md` (shared components, accent per context).
- People & workload: CO-03 (per department; bars only for Owner / Org Admin / that department’s manager).
- Case Flow: CO-09 approval flow of the selected item (read-only).
- Company workload = company work (CO-04) estimates ÷ work-profile hours.
