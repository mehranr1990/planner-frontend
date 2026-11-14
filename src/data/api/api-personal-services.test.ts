import { describe, expect, it } from "vitest";
import { RepositoryError } from "../repositories";
import { createApiBillsRepository, createApiFinanceReportsRepository } from "./api-bills-repository";
import { createApiNotificationsRepository } from "./api-notifications-repository";
import { createApiRemindersRepository } from "./api-reminders-repository";
import { createApiRoutinesRepository } from "./api-routines-repository";
import { createApiTaskFilesRepository } from "./api-task-files-repository";
import { err, fakeApi, json } from "./test-support";

/* Personal services adapters against in-memory contract fakes (no network). */

const T0 = "2026-11-14T08:00:00.000Z";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const notification = (n: number, patch: Record<string, unknown> = {}) => ({
  id: ID(n),
  revision: 1,
  reminderId: ID(100 + n),
  scheduledAt: `2026-11-1${n}T08:00:00.000Z`,
  title: `N${n}`,
  body: null,
  readAt: null,
  ...patch,
});

describe("notifications adapter", () => {
  it("lists the inbox with the reminder's task as deep link, newest first", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[0] === "reminders") return json({ items: [{ id: ID(101), taskId: ID(9) }, { id: ID(102), taskId: null }], nextCursor: null });
      expect(call.query.state).toBe("UNREAD");
      return json({ items: [notification(1), notification(2)], nextCursor: null });
    });
    const items = await createApiNotificationsRepository(api.client).list("unread");
    expect(items.map((item) => [item.id, item.taskId, item.read])).toEqual([
      [ID(2), null, false],
      [ID(1), ID(9), false],
    ]);
  });

  it("marks read with If-Match + Idempotency-Key and re-reads once on 409", async () => {
    const revision = 2;
    let first = true;
    const api = fakeApi((call) => {
      if (call.method === "GET") return json(notification(1, { revision }));
      if (first) {
        first = false;
        return err(409);
      }
      expect(call.ifMatch).toBe(`"${revision}"`);
      expect(call.key).toBeTruthy();
      expect(call.body).toEqual({ read: true });
      return json(notification(1, { revision: 3, readAt: T0 }));
    });
    const repo = createApiNotificationsRepository(api.client);
    const next = await repo.setRead({ id: ID(1), revision: 1, title: "N1", body: null, scheduledAt: T0, read: false, reminderId: ID(101), taskId: null }, true);
    expect(next).toMatchObject({ read: true, revision: 3 });
    expect(api.writes()).toEqual([`PATCH /notifications/${ID(1)}/read`, `PATCH /notifications/${ID(1)}/read`]);
  });

  it("counts unread up to one page (99+ beyond)", async () => {
    const api = fakeApi(() => json({ items: [notification(1)], nextCursor: "more" }));
    expect(await createApiNotificationsRepository(api.client).unreadCount()).toBe(100);
  });

  it("refuses a snooze in the past without calling the API", async () => {
    const api = fakeApi(() => json({}));
    await expect(createApiNotificationsRepository(api.client).snooze({ id: ID(1), revision: 1, title: "", body: null, scheduledAt: T0, read: false, reminderId: ID(2), taskId: null }, "2020-01-01T00:00:00.000Z")).rejects.toMatchObject({ code: "invalid" });
    expect(api.writes()).toEqual([]);
  });

  it("patches only the changed preferences with the preference ETag", async () => {
    const prefs = { id: ID(1), revision: 4, inApp: true, email: false, webPush: false, reactivateOnReopen: true, quietStart: null, quietEnd: null, availableChannels: ["IN_APP", "EMAIL"], webPushPublicKey: null };
    const api = fakeApi((call) => {
      if (call.method === "GET") return json(prefs, 200, `"4"`);
      expect(call.ifMatch).toBe(`"4"`);
      expect(call.body).toEqual({ email: true, quietStart: "22:00", quietEnd: "07:00" });
      return json({ ...prefs, email: true, quietStart: "22:00", quietEnd: "07:00" });
    });
    const next = await createApiNotificationsRepository(api.client).updatePreferences({ channels: { email: true }, quietStart: "22:00", quietEnd: "07:00" });
    expect(next).toMatchObject({ channels: { inApp: true, email: true, webPush: false }, available: ["inApp", "email"], quietStart: "22:00" });
  });
});

const reminderDto = (patch: Record<string, unknown> = {}) => ({
  id: ID(1),
  revision: 1,
  title: "Pay rent",
  body: null,
  taskId: null,
  rule: { version: 1, kind: "LOCAL", startDate: "2026-11-15", time: "09:00", recurrence: null },
  channels: ["IN_APP"],
  urgent: false,
  state: "ACTIVE",
  nextAt: "2026-11-15T05:30:00.000Z",
  exhausted: false,
  ...patch,
});

describe("reminders adapter", () => {
  it("creates a repeating local reminder in the account zone", async () => {
    const api = fakeApi((call) => {
      expect(call.body).toEqual({
        title: "Water plants",
        taskId: null,
        body: null,
        rule: { version: 1, kind: "LOCAL", startDate: "2026-11-15", time: "08:30", recurrence: { version: 1, frequency: "SELECTED_WEEKDAYS", interval: 1, weekdays: [0, 6], until: null, count: null, exclusions: [] } },
        channels: ["IN_APP", "EMAIL"],
        urgent: false,
        timezoneMode: "ACCOUNT",
      });
      return json(reminderDto({ rule: call.body.rule, channels: ["IN_APP", "EMAIL"] }), 201);
    });
    const created = await createApiRemindersRepository(api.client).create({
      title: " Water plants ",
      body: "",
      taskId: null,
      schedule: { kind: "local", day: "2026-11-15", time: "08:30", repeat: { frequency: "weekdays", interval: 1, weekdays: [6, 0], until: null, count: null } },
      channels: ["inApp", "email"],
      urgent: false,
    });
    expect(created.schedule).toEqual({ kind: "local", day: "2026-11-15", time: "08:30", repeat: { frequency: "weekdays", interval: 1, weekdays: [0, 6], until: null, count: null } });
  });

  it("links a task with its current revision and a TASK rule", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[0] === "tasks") return json({ id: ID(9), revision: 7 });
      expect(call.body).toMatchObject({ taskId: ID(9), taskRevision: 7, rule: { version: 1, kind: "TASK", field: "DUE_AT", offsetMinutes: -15 } });
      return json(reminderDto({ taskId: ID(9), rule: call.body.rule }), 201);
    });
    const created = await createApiRemindersRepository(api.client).create({
      title: "Due soon",
      body: null,
      taskId: ID(9),
      schedule: { kind: "task", field: "due", offsetMinutes: -15, time: null },
      channels: ["inApp"],
      urgent: true,
    });
    expect(created.schedule).toEqual({ kind: "task", field: "due", offsetMinutes: -15, time: null });
  });

  it("refuses a task reminder that repeats before any call", async () => {
    const api = fakeApi(() => json({}));
    await expect(
      createApiRemindersRepository(api.client).create({
        title: "x",
        body: null,
        taskId: ID(9),
        schedule: { kind: "local", day: "2026-11-15", time: "09:00", repeat: { frequency: "daily", interval: 1, weekdays: [], until: null, count: null } },
        channels: ["inApp"],
        urgent: false,
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
    expect(api.calls).toEqual([]);
  });

  it("hides cancelled reminders, pauses and deletes with If-Match", async () => {
    const api = fakeApi((call, parts) => {
      if (call.method === "GET") return json({ items: [reminderDto(), reminderDto({ id: ID(2), state: "CANCELED" })], nextCursor: null });
      expect(call.ifMatch).toBe(`"1"`);
      expect(call.key).toBeTruthy();
      return json(reminderDto({ revision: 2, state: parts[2] === "pause" ? "PAUSED" : "CANCELED" }));
    });
    const repo = createApiRemindersRepository(api.client);
    const [only, ...rest] = await repo.list();
    expect(rest).toEqual([]);
    expect((await repo.setPaused(only!, true)).state).toBe("paused");
    await repo.remove(only!);
    expect(api.writes()).toEqual([`POST /reminders/${ID(1)}/pause`, `DELETE /reminders/${ID(1)}`]);
  });

  it("maps delivery history newest first without inventing sends", async () => {
    const api = fakeApi(() =>
      json({
        items: [
          { id: ID(5), channel: "EMAIL", state: "FAILED", scheduledAt: "2026-11-13T08:00:00.000Z", sentAt: null, attempts: 5, reason: "PROVIDER_DOWN" },
          { id: ID(6), channel: "IN_APP", state: "DELIVERED", scheduledAt: "2026-11-14T08:00:00.000Z", sentAt: "2026-11-14T08:00:02.000Z", attempts: 1, reason: null },
        ],
        nextCursor: null,
      }),
    );
    const items = await createApiRemindersRepository(api.client).deliveries(ID(1));
    expect(items.map((item) => [item.channel, item.state, item.reason])).toEqual([
      ["inApp", "delivered", null],
      ["email", "failed", "PROVIDER_DOWN"],
    ]);
  });
});

describe("routines adapter", () => {
  const routine = (patch: Record<string, unknown> = {}) => ({
    id: ID(1),
    revision: 1,
    title: "Morning",
    status: "ACTIVE",
    habits: [
      { habitId: ID(12), position: 1, title: "Stretch", status: "ACTIVE" },
      { habitId: ID(11), position: 0, title: "Water", status: "ARCHIVED" },
    ],
    ...patch,
  });

  it("lists active routines with habits in order and archives with If-Match", async () => {
    const api = fakeApi((call) => {
      if (call.method === "GET") return json({ items: [routine(), routine({ id: ID(2), status: "ARCHIVED" })], nextCursor: null });
      expect(call.ifMatch).toBe(`"1"`);
      return json(routine({ status: "ARCHIVED", revision: 2 }));
    });
    const repo = createApiRoutinesRepository(api.client);
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.habits).toEqual([
      { id: ID(11), title: "Water", archived: true },
      { id: ID(12), title: "Stretch", archived: false },
    ]);
    await repo.remove(list[0]!);
    expect(api.writes()).toEqual([`DELETE /routines/${ID(1)}`]);
  });

  it("creates with distinct ordered habits only", async () => {
    const api = fakeApi((call) => json(routine({ title: call.body.title }), 201));
    const repo = createApiRoutinesRepository(api.client);
    await expect(repo.create({ title: "x", habitIds: [ID(1), ID(1)] })).rejects.toMatchObject({ code: "invalid" });
    await repo.create({ title: " Evening ", habitIds: [ID(12), ID(11)] });
    expect(api.calls.at(-1)!.body).toEqual({ title: "Evening", habitIds: [ID(12), ID(11)] });
  });
});

describe("task files adapter", () => {
  it("uploads the bytes, then attaches the READY file with the task revision", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const api = fakeApi((call, parts) => {
      if (parts[0] === "files" && parts[1] === "uploads") {
        expect(call.body).toEqual({ filename: "notes.txt", mimeType: "text/plain", expectedSize: 5 });
        return json({ id: ID(3), status: "INITIATED", filename: "notes.txt", mimeType: "text/plain", expectedSize: 5, actualSize: null, createdAt: T0, completedAt: null }, 201);
      }
      if (parts[2] === "complete") return json({ id: ID(3), status: "READY", filename: "notes.txt", mimeType: "text/plain", expectedSize: 5, actualSize: 5, createdAt: T0, completedAt: T0 });
      if (call.method === "GET") return json({ id: ID(9), revision: 4 });
      expect(call.ifMatch).toBe(`"4"`);
      return json({ id: ID(9), revision: 5 });
    });
    const attached = await createApiTaskFilesRepository(api.client).upload(ID(9), file);
    expect(attached).toMatchObject({ fileId: ID(3), name: "notes.txt", sizeBytes: 5, status: "ready" });
    expect(api.writes()).toEqual(["POST /files/uploads", `POST /files/${ID(3)}/complete`, `PUT /tasks/${ID(9)}/attachments/${ID(3)}`]);
  });

  it("refuses unsupported types before any call", async () => {
    const api = fakeApi(() => json({}));
    await expect(createApiTaskFilesRepository(api.client).upload(ID(9), new File(["x"], "a.zip", { type: "application/zip" }))).rejects.toMatchObject({ code: "invalid" });
    expect(api.calls).toEqual([]);
  });

  it("downloads through the renewed signed link and removes = detach + delete bytes", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "complete") return json({ id: ID(3), status: "READY", download: { url: `/api/v1/files/${ID(3)}/download?expires=1900000000&signature=${"a".repeat(64)}`, expiresAt: T0 } });
      if (parts[2] === "download") {
        expect(call.query).toEqual({ expires: "1900000000", signature: "a".repeat(64) });
        return new Response("bytes", { headers: { "Content-Type": "application/octet-stream" } });
      }
      if (call.method === "GET") return json({ id: ID(9), revision: 4 });
      if (parts[0] === "files" && call.method === "DELETE") return new Response(null, { status: 204 });
      return json({ id: ID(9), revision: 5 });
    });
    const repo = createApiTaskFilesRepository(api.client);
    expect(await (await repo.download(ID(3))).text()).toBe("bytes");
    await repo.remove(ID(9), ID(3));
    expect(api.writes()).toEqual([`POST /files/${ID(3)}/complete`, `DELETE /tasks/${ID(9)}/attachments/${ID(3)}`, `DELETE /files/${ID(3)}`]);
  });
});

describe("bills and reports adapters", () => {
  const bill = (patch: Record<string, unknown> = {}) => ({
    id: ID(1),
    revision: 2,
    current: true,
    effectiveFrom: "2026-11-01",
    name: "Rent",
    accountId: ID(50),
    type: "EXPENSE",
    amount: "250000000.5",
    currency: "IRR",
    scale: 1,
    categoryId: null,
    dueDate: "2026-12-01",
    timezone: "Asia/Tehran",
    schedule: { version: 1, frequency: "MONTHLY", interval: 1, weekdays: [], until: null, count: null, exclusions: [] },
    archived: false,
    ...patch,
  });

  it("creates an IRR bill on the oldest IRR account with the exact amount string", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[1] === "accounts")
        return json({ items: [{ id: ID(51), currency: "IRR", archived: false, createdAt: "2026-02-01T00:00:00Z" }, { id: ID(50), currency: "IRR", archived: false, createdAt: "2026-01-01T00:00:00Z" }], nextCursor: null });
      expect(call.body).toMatchObject({ name: "Rent", accountId: ID(50), type: "EXPENSE", amount: "250000000.5", dueDate: "2026-12-01", schedule: { frequency: "MONTHLY" } });
      return json(bill(), 201);
    });
    const created = await createApiBillsRepository(api.client).create({
      name: "Rent",
      kind: "expense",
      amountRial: "250000000.5",
      dueDay: "2026-12-01",
      repeat: { frequency: "monthly", interval: 1, weekdays: [], until: null, count: null },
    });
    expect(created).toMatchObject({ amount: "250000000.5", currency: "IRR", repeat: { frequency: "monthly" } });
  });

  it("edits as a new version, previews payment states and records a payment (ledger only)", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[3] === "preview")
        return json({ items: [{ occurrenceKey: "2026-11-01", dueDate: "2026-11-01", amount: "250000000.5", currency: "IRR", state: "PAID", transactionId: ID(7) }, { occurrenceKey: "2026-12-01", dueDate: "2026-12-01", amount: "250000000.5", currency: "IRR", state: "UNPAID", transactionId: null }], nextCursor: null });
      if (call.method === "PATCH") {
        expect(call.ifMatch).toBe(`"2"`);
        expect(call.body).toEqual({ effectiveFrom: "2026-11-14", amount: "260000000" });
        return json(bill({ revision: 3, amount: "260000000", effectiveFrom: "2026-11-14" }));
      }
      expect(call.ifMatch).toBe(`"2"`);
      expect(call.key).toBeTruthy();
      expect(call.body).toEqual({ occurrenceKey: "2026-12-01" });
      return json({ id: ID(7) });
    });
    const repo = createApiBillsRepository(api.client);
    const current = { id: ID(1), revision: 2, name: "Rent", kind: "expense" as const, amount: "250000000.5", currency: "IRR", dueDay: "2026-12-01", repeat: null, archived: false, effectiveFrom: "2026-11-01" };
    expect((await repo.update(current, { amountRial: "260000000" }, "2026-11-14")).amount).toBe("260000000");
    expect((await repo.preview(ID(1), "2026-11-01", "2026-12-31")).map((item) => item.state)).toEqual(["paid", "unpaid"]);
    await repo.recordPayment(current, "2026-12-01");
    expect(api.writes()).toEqual([`PATCH /finance/bills/${ID(1)}`, `POST /finance/bills/${ID(1)}/pay`]);
  });

  it("asks reports for an inclusive range (to + 1 day) and keeps currencies apart", async () => {
    const api = fakeApi((call) => {
      expect(call.query).toEqual({ from: "2026-10-23", to: "2026-11-15" });
      return json({
        from: "2026-10-23",
        to: "2026-11-15",
        postingCount: 3,
        currencies: [
          { currency: "IRR", income: "10000000", expense: "2500000.5", fees: "0", transferIn: "0", transferOut: "0", adjustments: "0", net: "7499999.5" },
          { currency: "USD", income: "0", expense: "12.34", fees: "0.5", transferIn: "0", transferOut: "0", adjustments: "0", net: "-12.84" },
        ],
      });
    });
    const report = await createApiFinanceReportsRepository(api.client).report("2026-10-23", "2026-11-14");
    expect(report.currencies.map((item) => [item.currency, item.net])).toEqual([
      ["IRR", "7499999.5"],
      ["USD", "-12.84"],
    ]);
  });

  it("downloads the finance export as the server's file and refuses > 366 days", async () => {
    const api = fakeApi((call) => {
      expect(call.query.format).toBe("csv");
      return new Response("a,b\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="personal-finance.csv"' } });
    });
    const repo = createApiFinanceReportsRepository(api.client);
    const file = await repo.exportFile("2026-10-23", "2026-11-14", "csv");
    expect(file.filename).toBe("personal-finance.csv");
    expect(await file.blob.text()).toBe("a,b\n");
    await expect(repo.exportFile("2025-01-01", "2026-11-14", "json")).rejects.toMatchObject({ code: "invalid" });
  });
});
