import type { ApiClient, RequestBody, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { addDaysToDay, diffDays, parseDay } from "@/lib/dates/clock-time";
import type { Bill, BillInput, BillOccurrence, BillsRepository, BillVersion, FinanceReportsRepository } from "../personal-services";
import { repeatFromApi, repeatToApi } from "./api-reminders-repository";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Bills (/finance/bills) and reports / export (/finance/reports, /export).
 * - Money stays the server's exact decimal string; new bills are IRR on the
 *   oldest active IRR account (created as "Personal" on first write, the
 *   Finance adapter's rule). Other currencies are listed as they are.
 * - Bills are versioned: an edit or archive is a new version from
 *   `effectiveFrom`; history lists the versions.
 * - "Record payment" posts the occurrence to the ledger (bill revision
 *   If-Match); it never moves money anywhere.
 * - Report / export days are inclusive in the UI; the API window ends
 *   before `to`, so one day is added. Currencies are never summed together.
 */

type ApiBill = ResponseData<"/api/v1/finance/bills/{id}", "get">;

const CURRENCY = "IRR";
const PAGE = "100";
const MAX_RANGE_DAYS = 366;
const AMOUNT = /^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,4})?$/;

const toBill = (dto: ApiBill): Bill => ({
  id: dto.id,
  revision: dto.revision,
  name: dto.name,
  kind: dto.type === "INCOME" ? "income" : "expense",
  amount: dto.amount,
  currency: dto.currency,
  dueDay: dto.dueDate,
  repeat: repeatFromApi(dto.schedule),
  archived: dto.archived,
  effectiveFrom: dto.effectiveFrom,
});

function checkRange(from: string, to: string) {
  if (parseDay(from) === null || parseDay(to) === null) invalid("Bad day");
  const days = diffDays(from, to) + 1;
  if (days < 1 || days > MAX_RANGE_DAYS) invalid("A range is 1–366 days");
}

function checkInput(input: Partial<BillInput>) {
  if (input.name !== undefined && (!input.name.trim() || input.name.length > 300)) invalid("A bill needs a name (≤ 300)");
  if (input.amountRial !== undefined && (!AMOUNT.test(input.amountRial) || !/[1-9]/.test(input.amountRial))) invalid("Amount must be positive");
  if (input.dueDay !== undefined && parseDay(input.dueDay) === null) invalid("Bad due day");
}

export function createApiBillsRepository(client: ApiClient): BillsRepository {
  async function accountId(): Promise<string> {
    const accounts = (await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/accounts", { query: { limit: PAGE, cursor, currency: CURRENCY, archived: "false" } })).data))
      .filter((account) => account.currency === CURRENCY && !account.archived)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (accounts[0]) return accounts[0].id;
    return (await client.request("post", "/api/v1/finance/accounts", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { name: "Personal", currency: CURRENCY } })).data.id;
  }

  async function write(bill: Bill, send: (ifMatch: string) => Promise<ApiBill>): Promise<Bill> {
    let revision = bill.revision;
    return toBill(
      await retryOnConflict(
        () => send(revisionTag(revision)),
        async () => {
          revision = (await client.request("get", "/api/v1/finance/bills/{id}", { path: { id: bill.id } })).data.revision;
        },
      ),
    );
  }

  const patch = (bill: Bill, body: RequestBody<"/api/v1/finance/bills/{id}", "patch">) =>
    write(bill, async (ifMatch) => (await client.request("patch", "/api/v1/finance/bills/{id}", { path: { id: bill.id }, header: { "If-Match": ifMatch }, body })).data);

  return {
    list: (archived) =>
      mapErrors(async () =>
        (await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/bills", { query: { limit: PAGE, cursor, archived: archived ? "true" : "false" } })).data))
          .filter((dto) => dto.current && dto.archived === archived)
          .map(toBill)
          .sort((a, b) => a.dueDay.localeCompare(b.dueDay)),
      ),

    create: (input) =>
      mapErrors(async () => {
        checkInput(input);
        const { data } = await client.request("post", "/api/v1/finance/bills", {
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: {
            name: input.name.trim(),
            accountId: await accountId(),
            type: input.kind === "income" ? "INCOME" : "EXPENSE",
            amount: input.amountRial,
            dueDate: input.dueDay,
            schedule: input.repeat ? repeatToApi(input.repeat) : null,
          },
        });
        return toBill(data);
      }),

    update: (bill, changes, effectiveFrom) =>
      mapErrors(async () => {
        checkInput(changes);
        if (parseDay(effectiveFrom) === null) invalid("Bad day");
        if (changes.kind !== undefined && changes.kind !== bill.kind) invalid("A bill's type cannot change");
        const body: RequestBody<"/api/v1/finance/bills/{id}", "patch"> = { effectiveFrom };
        if (changes.name !== undefined) body.name = changes.name.trim();
        if (changes.amountRial !== undefined) body.amount = changes.amountRial;
        if (changes.dueDay !== undefined) body.dueDate = changes.dueDay;
        if (changes.repeat !== undefined) body.schedule = changes.repeat ? repeatToApi(changes.repeat) : null;
        return patch(bill, body);
      }),

    setArchived: (bill, archived, effectiveFrom) => mapErrors(() => patch(bill, { effectiveFrom, archived })),

    preview: (billId, from, to) =>
      mapErrors(async () => {
        checkRange(from, to);
        const items = await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/bills/{id}/preview", { path: { id: billId }, query: { limit: PAGE, cursor, from, to } })).data);
        return items.map(
          (item): BillOccurrence => ({
            key: item.occurrenceKey,
            dueDay: item.dueDate,
            amount: item.amount,
            currency: item.currency,
            state: item.state === "PAID" ? "paid" : item.state === "REVERSED" ? "reversed" : "unpaid",
          }),
        );
      }),

    history: (billId) =>
      mapErrors(async () =>
        (await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/bills/{id}/history", { path: { id: billId }, query: { limit: PAGE, cursor } })).data))
          .map(
            (dto): BillVersion => ({
              effectiveFrom: dto.effectiveFrom,
              current: dto.current,
              name: dto.name,
              amount: dto.amount,
              currency: dto.currency,
              dueDay: dto.dueDate,
              repeat: repeatFromApi(dto.schedule),
              archived: dto.archived,
            }),
          )
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
      ),

    recordPayment: (bill, occurrenceKey) =>
      mapErrors(async () => {
        if (parseDay(occurrenceKey) === null) invalid("Bad occurrence");
        let revision = bill.revision;
        await retryOnConflict(
          () =>
            client.request("post", "/api/v1/finance/bills/{id}/pay", {
              path: { id: bill.id },
              header: { "If-Match": revisionTag(revision), "Idempotency-Key": newIdempotencyKey() },
              body: { occurrenceKey },
            }),
          async () => {
            revision = (await client.request("get", "/api/v1/finance/bills/{id}", { path: { id: bill.id } })).data.revision;
          },
        );
      }),
  };
}

export function createApiFinanceReportsRepository(client: ApiClient): FinanceReportsRepository {
  return {
    report: (from, to) =>
      mapErrors(async () => {
        checkRange(from, to);
        const { data } = await client.request("get", "/api/v1/finance/reports", { query: { from, to: addDaysToDay(to, 1) } });
        return {
          from,
          to,
          postingCount: data.postingCount,
          currencies: data.currencies.map(({ currency, income, expense, fees, transferIn, transferOut, adjustments, net }) => ({
            currency,
            income,
            expense,
            fees,
            transferIn,
            transferOut,
            adjustments,
            net,
          })),
        };
      }),

    exportFile: (from, to, format) =>
      mapErrors(async () => {
        checkRange(from, to);
        const { data, headers } = await client.request("get", "/api/v1/finance/export", { query: { from, to: addDaysToDay(to, 1), format } });
        const blob =
          data instanceof Blob ? data : new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const named = /filename="([^"]+)"/.exec(headers.get("Content-Disposition") ?? "")?.[1];
        return { blob, filename: named ?? `personal-finance-${from}-${to}.${format}` };
      }),
  };
}
