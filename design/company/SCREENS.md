# Companies — screen registry

All designed ✅ (awaiting owner approval). Backend Phase 4 not built → mock adapters.

| ID | Route | Screen | Batch | Board | New components (rest = reuse) | Backend (V3) |
|---|---|---|---|---|---|---|
| CS-01 | (shell) | Switcher Companies row, rails, department scope, mobile nav, access states | A | `CS01CompanyShell` | CompanyRail, DepartmentScope chip/sheet | P4-01 |
| CO-00 | `/companies` | All companies | A | `CO00AllCompanies` | CompanyCard | P4-01 |
| CO-01 | `/companies/[id]` | Overview | A | `CO01CompanyOverview` | PortfolioCard, BudgetSummary | P4-01/03/04/05 |
| CO-02 | `/companies/[id]/departments` | Departments + policies | A | `CO02Departments` | OrgTree, PolicyList | P4-01 |
| CO-03 | `/companies/[id]/people` | People directory | A | `CO03CompanyPeople` | WorkProfileCard | P4-02, **PeopleWorkload (per department)** |
| CO-90 | `?sheet=company-new · company-invite · department-new` | Sheets | A | `CO90CompanySheets` | — | P4-01 |
| CO-04 | `/companies/[id]/work` | Projects & teams + attach | B | `CO04CompanyWork` | AttachPreview | P4-05/06 |
| CO-05 | `/companies/[id]/goals` | Goals cascade | B | `CO05CompanyGoals` | GoalTree | P4-05 |
| CO-06 | `/companies/[id]/resources?tab=equipment·rooms·capacity` | Resources & capacity | B | `CO06CompanyResources` | ResourceRow, RequestCard, CapacityHeat | P4-02 |
| CO-07 | `/companies/[id]/knowledge[/pageId]` | Knowledge base | B | `CO07Knowledge` | KbTree, PageView, Versions, Ack | P4-05 |
| CO-08 | `/companies/[id]/expenses` (+ `?sheet=expense-new`) | Expenses | C | `CO08Expenses` | ExpenseRow, ReceiptPreview | P4-03 |
| CO-09 | `/companies/[id]/approvals[/approvalId]` | Approvals inbox + detail | C | `CO09Approvals` | ApprovalChain, DecisionBar | P4-04, **CaseFlow (approval flow)** |
| CO-10 | `/companies/[id]/budgets` | Budgets & variance | C | `CO10Budgets` | BudgetBar (approved/committed/left) | P4-03 |
| CO-11 | `/companies/[id]/expenses/reimbursements` | Reimbursements & payment runs | C | `CO11Reimbursements` | PaymentRunCard | P4-04 |
| CO-12 | `/companies/[id]/people/[personId]/file` | Employee file (sealed) + corrective actions | C | `CO12EmployeeFile` | SealedState, AccessLog, CaseThread | P4-02 |
| CO-13 | `/companies/[id]/reports?tab=reports·exports·audit` | Reports, exports, audit | C | `CO13Reports` | ReportCard | P4-05 |
| CO-14 | `/companies/[id]/settings?tab=general·policies·chains·roles·lifecycle` | Settings | C | `CO14CompanySettings` | ChainEditor (sequential) | P4-01/04/06 |

## Mobile & locale
- Mobile `COM01CompanyMobile`: CO-00, 01, 09 list + detail, 08 new expense sheet, 03, 10, 06, 12 (read-only).
- Read-only on phones: employee file, chain editor, policies, budget setting, org tree editing.
- Persian `COM02CompanyFa`: CO-01, 09, 08, 10 (Toman with Persian digits and ٬ separator).
- Dark: every board `…Dark`.
