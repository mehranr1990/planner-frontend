# Company frontend completion — P4 gap closure

**Status:** final live verification (pass 3) and New Company creation (pass 4), 2026-11-17. Branch `integration/backend-864-ops`; nothing is committed.

**Contract:**
- `planner-backend/docs/api/openapi.json` (sha256 prefix `c5442c60a77ebe6a`)
- `planner-backend/docs/frontend-handoff/COMPANY_GAP_CLOSURE.md`
- Running backend at `e217686` (separate Shared rate budgets)

## 1. Existing Company functionality reused (unchanged)

The live adapters `src/data/api/api-company-repository.ts`, `-operations.ts`, `-completion.ts` and `-finance.ts` cover these areas:

- **Company and structure:** company list, access, archive / restore / delete; departments, units and unit moves.
- **People:** staff directory and work profiles; department transfers; invitations (both sides).
- **Work:** associations and attach; goals and key results; resource requests; rooms and utilization; knowledge base.
- **Money:** expenses and receipts; finance and resource approvals; budgets and change requests; reimbursements and payment runs.
- **HR records:** employee files and corrective actions.
- **Admin:** reports, exports, audit, notifications, settings and employee grants.

## 2. Live APIs connected (pass 1, unchanged in pass 2)

| Workflow | Operation(s) |
|---|---|
| CO-03 pending invitations | `GET ctx/sent-invitations`. The list shows recipient email (null stays null) and hides expired offers. |
| CO-06 resources | `POST ctx/resources`, then `PUT ctx/resources/{r}/type`, then `POST ctx/resources/{r}/asset-tag`. Each write uses If-Match with the revision the previous call returned. The list reads `GET …/asset-tag` and the type title. |
| CO-14 ownership transfer | `GET companies/{id}/ownership-handovers` gives the pending handover; it was session-only before. |
| Finance approval decisions | `POST ctx/finance/approvals/{a}/decision-receipts` (If-Match + Idempotency-Key). |

## 3. Confirmed defects fixed (passes 2–3)

| Defect | Fix |
|---|---|
| The add-resource dialog offered a fixed type list (laptop, monitor…) that the backend does not have. Live mode accepted only "Other". | Resolved from the backend type catalog (section 4). |
| Reimbursements "Mine": the **Not received** and **Record in my finance** buttons showed in live mode and always failed (CB-6). | New capabilities `reportNotReceived` and `recordReimbursementInPersonal`: true in mock, false in live. Live mode no longer offers these actions; mock behaviour is unchanged. |
| **Pass 3, found live:** with a duplicate asset tag, the backend answered 409 but the resource created just before stayed ACTIVE and untagged. That left an orphan item in the inventory. | `addResource` now retires the resource it just created when the tag is refused. It uses the supported `…/retire` operation with the type call's revision, then reports `conflict` ("Asset tag already used in this company"). Covered by a unit test and re-verified live. |

## 4. Resource type resolution

- **Seam:** a new `resourceTypes(companyId, departmentId | null)` method returns `ResourceTypeOption { id, key, title }`. `addResource` now takes `typeId` instead of the fixed `type`. `CompanyResource` gained an optional `typeTitle`.
- **Live:** `GET ctx/resource-types` for the target context (root, or the chosen department, because types are stored per context).
  - Only a type from that catalog is accepted. Anything else is refused as `invalid` before any write, with no substitution.
  - An empty catalog stays empty. Nothing is seeded, and the test creates no types.
  - The list shows the configured type title.
- **Mock:** the six fixed keys, labelled by i18n as before.
- **Dialog (same design):**
  - The options come from the catalog for the selected department.
  - With an empty catalog the select is disabled, a "No resource types are set up for this department yet" field message shows, and **Add** is disabled.
  - A load error shows its own message.
  - New i18n keys in en and fa: `noTypes`, `typesFailed`.
- **Tests:**
  - Adapter: catalog per context, the create → type → tag revision chain, and refusal of off-catalog types / empty catalog / empty tag with no writes.
  - UI: empty catalog blocks Add; the chosen configured type id is sent.

## 4b. New Company creation (pass 4)

The existing sheet (`?sheet=company-new`) is unchanged in design, fields, labels, RTL and validation. Only the live adapter and the error message changed.

**Request flow** (`createCompany` in `api-company-repository.ts`):

1. `GET /retention-policies?context=COMPANY` through the shared `catalogVersion` helper. Exactly one approved COMPANY policy is required. The version is never hardcoded: with none or several, the request is refused as `unsupported` and nothing is written.
2. `POST /companies` with `{ id, title, retentionPolicyVersion }` and an `Idempotency-Key`. Expected response: 201. The backend creates the Owner membership.
3. The form's other fields go through existing operations:
   - `PUT /companies/{id}/settings/legal` sets the legal name and fiscal month (If-Match: settings revision).
   - `PUT …/settings/currency` sets the currency; Toman and Rial are both stored as `IRR`.
   - `POST /companies/{id}/departments` creates each first department. Names are trimmed and exact duplicates removed.
4. The created company is read back with `GET /companies/{id}`, and its summary is built from the backend's actual id, owner role and state. Nothing is fabricated, and there is no mock fallback.

**Idempotency and retry:**
- One pending record per form input keeps the company id, every department id and every Idempotency-Key.
- If step 3 fails, the adapter reports `partial`: "The company was created, but its setup didn't finish. Submit again to complete it."
- Submitting the same form again replays identical requests, so no duplicate company or department is created, and then finishes the remaining steps.
- A different form gets fresh ids.

**Double submit:** the submit button is disabled while the request is pending.

**Errors** (en and fa):

| Code | Message |
|---|---|
| `invalid` | Check the name / fiscal month |
| `forbidden` | Not allowed |
| `unsupported` | "Company creation isn't enabled on this server yet (no approved company retention policy). Ask the operator." |
| `conflict` (409) | Changed or already exists |
| `partial` | Created; submit again |
| anything else | The generic message |

**Cache and navigation:** on success, `useCreateCompany` invalidates every Company query (list, switcher, rail). A toast "{company} created" shows, the sheet closes, and the app navigates to `/companies/{id}`.

**Outside local development:** creation depends entirely on the server's catalog and gates. Without an approved COMPANY policy, the sheet shows the policy message. Nothing is bypassed.

**Tests:**
- Adapter, `api-company-gap-closure.test.ts`, 4 new tests:
  - payload and policy from the catalog;
  - settings and departments order and revisions;
  - a resubmit after `partial` replays the same id, key and department ids, while a new form gets a new id;
  - validation, and none / several policies, with no writes;
  - 403 → `forbidden`, 409 → `conflict`.
- Sheet, `company-sheets.test.tsx`, 2 new tests:
  - live adapter with an empty catalog: policy message, no writes, no navigation, no mock;
  - one request while pending; the `forbidden` and `partial` messages.
- The stale `create` refusal assertion was removed from `api-company-repository.test.ts`.
- Results: `api-company-gap-closure` 17/17, `api-company-repository` 5/5, `company-sheets` 6/6.
- `tsc` and eslint on touched files: clean. `npm run build`: PASS.

**Live** (`src/data/api/api-company-create.live.test.ts`, synthetic Owner `primary`): **all PASS**.

| Step | Result |
|---|---|
| Create through the adapter | **PASS**: HTTP 201, role owner |
| Appears once in the authorized list | **PASS** |
| Owner opens it: access ok; legal name, IRR, fiscal month 1 and department "Ops" read back | **PASS** |
| Same-key replay of `POST /companies` (separate synthetic company) | **PASS**: 201 twice, same id, listed once |
| Cleanup: both synthetic companies archived through `POST …/archive` | **PASS** |

No existing development company was modified.

## 5. Remaining backend contract gaps (unavailable in live mode, never faked)

| # | UI behaviour | Live state |
|---|---|---|
| CB-1 | The approval-chain editor uses role approvers per step. The backend workflow steps name one person (primary or alternate). Amount tiers exist as `approval-policies`, but a role cannot be mapped to a person safely. | `chains` / `saveChainDraft` / `publishChain` are refused, and the tab shows "Not available yet". |
| CB-2 | The policies screen shows named values, levels and overrides. The backend has capability rules plus two configurable read keys (`effective-read-permissions`). | `effectivePolicies` / `overridePolicy` / `setPolicyLevel` are refused and shown as unavailable. |
| CB-6 | A "Not received" note, and a "recorded in Personal" marker. | The buttons are hidden in live mode. The adapter still refuses, as a safety net. |
| CB-7 | Overview figures: health split, quarter history, plans sent, joiners / leave, goals on pace, capacity watch, pending budget-change totals. | Shown as "—". KPI observations are recorded measurements and are not used as these aggregates. |

## 6. BACKEND_ONLY (approved backend capability, no approved UI) — not COMPLETE

- **Organization and people:** organization chart, transfer history, department analytics.
- **Assets:** custody and maintenance.
- **Performance:** KPI observations, review cycles and performance reviews, one-on-ones.
- **Access:** custom roles and assignments, temporary grants, access inventory and reviews.
- **Approvals:** approval delegations, approval policies and `submit-by-policy`, approval timeline / action-state.
- **Finance and other:** budget alerts, resource usage, invitation resend, security audit.

## 7. Policy-gated and deferred (preserved)

- **Company create** is connected (section 4b). It is gated by the server catalog: it works only where exactly one approved COMPANY policy exists. Locally that is the development-only `mp-local-company-v1-20261117`, which is not referenced in the frontend source.
- **Emergency access recovery** and **retention activation**: not wired (`executable:false`, `activationAuthorized:false`).
- **Billing, seats and subscriptions:** there are no backend endpoints, and none were invented.
- **File content** (employee documents, receipts, KB bytes) is blocked by local Shared test mode. No bypass was added.

## 8. Verification

### Focused tests and build

- Company adapters, the mock, and all Company screens: **21 files / 96 tests pass** (pass 2). Pass 3: `api-company-gap-closure.test.ts` 13/13 pass, including the new duplicate-tag compensation test.
- `tsc --noEmit`: clean (whole project).
- eslint on the touched files: clean.
- `npm run build`: **PASS**.

### Live results — final (pass 3, backend `7a027da`)

**Setup:**
- Local backend at `127.0.0.1:3000`, with local COMPANY retention policy `mp-local-company-v1-20261117`.
- Synthetic Company `ccd4876a-…`.
- Accounts come from the backend's ignored `.tools/company-development-accounts.json`:
  - `primary` is the Owner;
  - `second` is a Member.
- The file is passed by path through `API_LIVE_COMPANY_ACCOUNTS`. Credentials are read only while the test runs and are never logged or committed.
- `liveSession(account?)` gained an optional account parameter. It is backward compatible.

**Rate limits:** the backend response headers confirm the revised limits per minute: reads `600;w=60`, writes `120;w=60`, IP `6000;w=60`. There were no 429s.

The last run had 16 PASS, 1 NOT VERIFIED and 0 FAIL, and cleanup passed.

| Step | Result |
|---|---|
| Unknown company → 404 → `not-available` (tenant boundary) | **PASS** |
| Retention catalog has exactly one COMPANY policy | **PASS** |
| Owner access: role owner, `manageResources` true, CB-6 actions off | **PASS** |
| Settings + `ownership-handovers` list (none pending; no Org Admin is eligible) | **PASS** |
| `sent-invitations` list (1 ACCEPTED offer, email null; no pending offers) | **PASS** for the list. Showing the email on a *pending* offer is **NOT VERIFIED**: there is no pending offer, and creating one needs a third verified account. |
| Resource types catalog | **PASS**. The catalog was empty; the test created one synthetic type, "Live check type". Types have no delete operation, so it stays in the synthetic company and later runs reuse it. |
| Add resource (configured type + unique tag) and list read-back (tag, type title) | **PASS** |
| Off-catalog type refused before any write | **PASS** |
| Duplicate asset tag → `conflict`; the adapter retires its untagged duplicate | **PASS**. The first run found the orphan defect described in section 3; it is fixed and re-verified. |
| Expenses, budgets, approvals, approval history reads | **PASS** (all empty) |
| Reimbursements + payment runs reads | **PASS** (empty) |
| Approval decision receipt | **NOT VERIFIED**. No financial reviewer role or approval workflow is configured. The runbook requires explicit configuration, and no seeding is documented as safe, so nothing was configured. |
| Member access: role member, no asset or settlement rights | **PASS** |
| Member adds a resource → `forbidden`, nothing created | **PASS** |
| Member renames the company → `forbidden`, name unchanged | **PASS** |
| Member sees no recipient emails | **PASS** |
| Cleanup: test resources retired via `…/retire` | **PASS** |

**Command:**

```
API_LIVE_COMPANY_ACCOUNTS=<backend>/.tools/company-development-accounts.json \
  npx vitest run src/data/api/api-company-completion.live.test.ts --silent=false
```

The command also needs the `.env.live.local` variables for origin and trusted origin.

## 9. Visual / browser verification

**NOT VERIFIED**: browser and E2E testing were excluded. The UI changes are limited to:

- the add-resource type select (options from the catalog, plus the empty and error messages);
- the type title shown on resource rows;
- the two hidden reimbursement buttons in live mode;
- pass 4: the New Company sheet's error message text (layout unchanged).

## 10. Git status

Nothing was committed, pushed, stashed or reset, and no backend files were modified.

Company files touched across both passes:
- the four adapters and their tests;
- `openapi-p6-companies.d.ts`;
- `company-domain.ts`, `company-repositories.ts`, `company-queries.ts`, `mock-companies.ts`;
- `resources-screen.tsx` and its test;
- `reimbursements-screen.tsx`;
- `messages/{en,fa}/company.json`;
- the new `api-company-completion.live.test.ts` and `api-company-create.live.test.ts`;
- pass 4: `api-company-repository.ts` (create), `api-company-completion.ts` (exports `CURRENCY_TO_API`), `company-sheets.tsx` (error messages) and its test, the two adapter test files;
- `live-support.ts`: optional `account` parameter on `liveSession`, backward compatible;
- this document.

The shared docs `SESSION_HANDOFF.md`, `API_COVERAGE_MATRIX.md` and `BACKEND_REQUIREMENTS.md` were updated in pass 1 only. They were not edited in pass 2 because another session (Messages) is active. Their CB-4 note ("only Other accepted") is superseded by section 4 here.

Uncommitted Projects, Teams and Messages changes were left as they were.
