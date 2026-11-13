import { describe, expect, it } from "vitest";
import { createMockSocial } from "./mock-social";

const G = (id: string) => ({ kind: "group" as const, id });

describe("mock social · access & privacy", () => {
  it("never lists private groups and previews carry no member names", async () => {
    const repo = createMockSocial();
    const found = await repo.groups.discover("", "all");
    expect(found.map((g) => g.id)).not.toContain("supper");
    expect(found.map((g) => g.id)).not.toContain("mountain");
    expect(Object.keys(found[0]!)).not.toContain("members");
    expect(await repo.groups.discover("secret", "all")).toEqual([]);
  });

  it("answers access per state: member, requested, guest, left, private = not available", async () => {
    const repo = createMockSocial();
    expect((await repo.groups.access("mountain")).kind).toBe("member");
    expect((await repo.groups.access("darband")).kind).toBe("join-requested");
    expect((await repo.groups.access("runners")).kind).toBe("guest");
    expect(await repo.groups.access("cyclists")).toMatchObject({ kind: "left", openBalance: true });
    expect((await repo.groups.access("supper")).kind).toBe("not-available");
    expect((await repo.groups.access("nope")).kind).toBe("not-available");
    await expect(repo.groups.requestJoin("supper", "")).rejects.toMatchObject({ code: "not-found" });
  });

  it("connect lookup gives the same answer whether or not an account exists", async () => {
    const repo = createMockSocial();
    expect(await repo.connections.request("nazanin@example.com", "")).toEqual({ sent: true });
    expect(await repo.connections.request("nobody@example.com", "")).toEqual({ sent: true });
  });

  it("guests see only expenses they take part in; members see the whole list", async () => {
    const repo = createMockSocial();
    const all = await repo.expenses.list({ kind: "activity", id: "alborz" });
    expect(all.length).toBe(5);
    const left = await repo.expenses.list(G("cyclists"));
    expect(left.every((e) => e.current.split.participants.includes("me") || e.current.payerId === "me")).toBe(true);
  });

  it("members do not see everyone's balance unless the setting allows it", async () => {
    const repo = createMockSocial();
    expect((await repo.balances.forScope(G("mountain"))).everyone).not.toBeNull(); // owner
    expect((await repo.balances.forScope(G("bookclub"))).everyone).toBeNull(); // member
    const club = await repo.balances.forScope(G("bookclub"));
    expect(club.transfers.every((t) => t.fromId === "me" || t.toId === "me")).toBe(true);
  });

  it("owner must transfer ownership before leaving", async () => {
    const repo = createMockSocial();
    await expect(repo.groups.leave("mountain", false)).rejects.toMatchObject({ code: "conflict" });
    await repo.groups.transferOwnership("mountain", "nazanin");
    await repo.groups.leave("mountain", true);
    expect((await repo.groups.access("mountain")).kind).toBe("left");
  });
});

describe("mock social · money", () => {
  it("counts approved only: proposed and pending edits never change balances", async () => {
    const repo = createMockSocial();
    const before = await repo.balances.forScope({ kind: "activity", id: "alborz" });
    expect(before.mine).toMatchObject({ paid: 12_000_000, share: 2_390_000, net: 9_610_000 });
    expect(before.approvedTotal).toBe(19_450_000);
    expect(before.proposedCount).toBe(1);
    expect(before.pendingEditCount).toBe(1);
    await repo.expenses.decideEdit("x-groceries", true);
    const after = await repo.balances.forScope({ kind: "activity", id: "alborz" });
    expect(after.mine.share).toBe(2_390_000 - 60_000);
    expect(after.mine.net).toBe(after.mine.paid - after.mine.share + after.mine.settled);
  });

  it("rejects a split that does not match and requires a reject reason", async () => {
    const repo = createMockSocial();
    await expect(
      repo.expenses.propose({ scope: G("mountain"), activityId: null, title: "Bad", amount: 100, payerId: "me", day: "2026-10-13", split: { method: "fixed", participants: ["me", "arman"], values: { me: 10, arman: 10 } }, receipt: null, clientOpId: "op-1" }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.expenses.reject("x-fuel", " ")).rejects.toMatchObject({ code: "invalid" });
  });

  it("proposals are idempotent by client op id", async () => {
    const repo = createMockSocial();
    const input = { scope: G("mountain"), activityId: null, title: "Snacks", amount: 301, payerId: "me", day: "2026-10-13", split: { method: "equal" as const, participants: ["me", "arman", "babak"] }, receipt: null, clientOpId: "op-2" };
    const a = await repo.expenses.propose(input);
    const b = await repo.expenses.propose(input);
    expect(a).toBe(b);
    const e = await repo.expenses.get(a);
    expect(e.current.shares.map((s) => s.amount)).toEqual([101, 100, 100]);
    expect(e.status).toBe("proposed");
  });

  it("Personal Finance claims are idempotent", async () => {
    const repo = createMockSocial();
    expect(await repo.expenses.claimFinancePosting("share:x-cabin:me")).toBe(true);
    expect(await repo.expenses.claimFinancePosting("share:x-cabin:me")).toBe(false);
  });

  it("settlement needs the other side's confirmation before it counts", async () => {
    const repo = createMockSocial();
    const family = await repo.balances.forScope(G("family"));
    expect(family.mine.net).toBe(600_000);
    await expect(repo.settlements.record({ scope: G("family"), fromId: "mom", toId: "dad", amount: 1, note: "", clientOpId: "x" })).rejects.toMatchObject({ code: "forbidden" });
    const [waiting] = (await repo.settlements.list(G("family"))).filter((s) => s.awaitingMe);
    await repo.settlements.confirm(waiting!.id);
    expect((await repo.balances.forScope(G("family"))).mine.net).toBe(300_000);
    const id = await repo.settlements.record({ scope: G("family"), fromId: "me", toId: "mom", amount: 5, note: "", clientOpId: "y" });
    await expect(repo.settlements.confirm(id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("never sums currencies across scopes", async () => {
    const repo = createMockSocial();
    const all = await repo.balances.mineAll();
    expect(new Set(all.map((b) => b.currency))).toEqual(new Set(["toman", "try", "eur"]));
  });
});

describe("mock social · lending, album, challenges", () => {
  it("handover and return need both sides", async () => {
    const repo = createMockSocial();
    const bag = (await repo.lending.loans(null)).find((l) => l.id === "l-bag")!;
    expect(bag.myStep).toBe("confirm-handover");
    await repo.lending.step("l-bag");
    const out = (await repo.lending.loans(null)).find((l) => l.id === "l-bag")!;
    expect(out.status).toBe("out");
    expect(out.myStep).toBe("record-return");
    await repo.lending.step("l-bag");
    expect((await repo.lending.loans(null)).find((l) => l.id === "l-bag")!.myStep).toBeNull();
    const tent = (await repo.lending.loans(null)).find((l) => l.id === "l-tent")!;
    expect(tent.overdue).toBe(true);
  });

  it("rejects album originals over 20 MB", async () => {
    const repo = createMockSocial();
    await expect(repo.albums.upload("al-tochal", { name: "big.jpg", bytes: 20 * 1024 * 1024 + 1, url: null })).rejects.toMatchObject({ code: "too-large" });
    const photo = await repo.albums.upload("al-tochal", { name: "ok.jpg", bytes: 1000, url: null });
    expect(photo.locationStripped).toBe(true);
  });

  it("challenges are voluntary: logging needs joining; no ranks", async () => {
    const repo = createMockSocial();
    await expect(repo.challenges.log("ch-stairs", 5, "2026-10-13")).rejects.toMatchObject({ code: "forbidden" });
    await repo.challenges.join("ch-stairs");
    await repo.challenges.log("ch-stairs", 5, "2026-10-13");
    const stairs = (await repo.challenges.list("mountain")).find((c) => c.id === "ch-stairs")!;
    expect(stairs.myTotal).toBe(5);
    expect(stairs.individualTotals!.map((p) => p.person.name)).toEqual([...stairs.individualTotals!.map((p) => p.person.name)].sort((a, b) => a.localeCompare(b)));
  });

  it("full activity puts a Going RSVP on the waitlist", async () => {
    const repo = createMockSocial();
    expect(await repo.activities.rsvp("futsal", "going")).toEqual({ waitlisted: true });
    expect((await repo.activities.get("futsal")).myWaitlist).toBe(1);
  });
});

describe('mock social · polls & activity files (Stage 2)', () => {
  it('single choice takes exactly one yes; multiple takes many; neither takes if-needed', async () => {
    const repo = createMockSocial();
    await expect(repo.polls.vote('poll-trail', { 't-1': 'yes', 't-2': 'yes' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.polls.vote('poll-trail', { 't-1': 'if-needed' })).rejects.toMatchObject({ code: 'invalid' });
    expect((await repo.polls.get('poll-trail')).resultsVisible).toBe(false);
    await repo.polls.vote('poll-trail', { 't-2': 'yes' });
    const trail = await repo.polls.get('poll-trail');
    expect(trail.resultsVisible).toBe(true);
    expect(trail.options.find((o) => o.id === 't-2')!.yes).toBe(3);
    await repo.polls.vote('poll-bring', { 'b-1': 'yes', 'b-2': 'yes' });
    const bring = await repo.polls.get('poll-bring');
    expect(bring.options.every((o) => o.voters.length === 0)).toBe(true); // anonymous: counts only
    await expect(repo.polls.pickFinal('poll-trail', 't-2')).rejects.toBeTruthy();
    expect((await repo.activities.get('nighthike')).pollIds).toEqual(['poll-night', 'poll-trail', 'poll-bring']);
  });

  it('activity files use the PJ-10 shape: versions, blocked types, attendees only', async () => {
    const repo = createMockSocial();
    const up = await repo.files.upload('alborz', { name: 'packing.pdf', sizeBytes: 1000, folderId: null });
    expect(up).toMatchObject({ state: 'ready', media: 'pdf', version: 1 });
    expect((await repo.files.upload('alborz', { name: 'run.exe', sizeBytes: 10, folderId: null })).state).toBe('blocked');
    const v2 = await repo.files.upload('alborz', { name: 'packing.pdf', sizeBytes: 1200, folderId: null, asNewVersionOf: up.id });
    expect(v2.version).toBe(2);
    expect((await repo.files.list('alborz')).total).toBe(2);
    await expect(repo.files.upload('lar', { name: 'x.pdf', sizeBytes: 1, folderId: null })).rejects.toMatchObject({ code: 'forbidden' });
  });
});
