import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InvitationFeedKind, InvitationNotice } from "@/data/personal-services";
import { renderWithProviders } from "@/test/render";
import { routerPush } from "@/test/setup";
import { NotificationsPopover } from "./notifications-popover";

/* The bell reads the invitation notification feed; the mock seam serves an empty feed, so this test injects one. */
const feed = vi.hoisted(() => ({ list: vi.fn(), markRead: vi.fn() }));
vi.mock("@/data/mock/mock-personal-services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/mock/mock-personal-services")>();
  return { ...actual, createMockPersonalServices: (...args: Parameters<typeof actual.createMockPersonalServices>) => ({ ...actual.createMockPersonalServices(...args), invitationFeed: feed }) };
});

const notice = (patch: Partial<InvitationNotice> & Pick<InvitationNotice, "id" | "kind" | "targetName">): InvitationNotice => ({
  targetId: `${patch.id}-target`,
  inviterName: null,
  role: null,
  createdAt: "2026-11-20T08:00:00.000Z",
  readAt: null,
  revision: 3,
  expiresAt: "2099-01-01T00:00:00.000Z",
  ...patch,
});

const pages: Partial<Record<InvitationFeedKind, Record<string, { items: InvitationNotice[]; next: string | null }>>> = {
  team: {
    first: { items: [notice({ id: "inv-research", kind: "team", targetName: "Research Guild", inviterName: "Sara P.", role: "MEMBER" })], next: "c2" },
    c2: { items: [notice({ id: "inv-older", kind: "team", targetName: "Older Team", readAt: "2026-11-21T08:00:00.000Z", createdAt: "2026-11-10T08:00:00.000Z" })], next: null },
  },
  project: { first: { items: [notice({ id: "p-old", kind: "project", targetName: "Old Project", expiresAt: "2020-01-01T00:00:00.000Z" })], next: null } },
  meeting: { first: { items: [notice({ id: "m-1", kind: "meeting", targetId: "meet-9", targetName: "Weekly sync" })], next: null } },
};

feed.list.mockImplementation(async (kind: InvitationFeedKind, after?: string | null) => pages[kind]?.[after ?? "first"] ?? { items: [], next: null });
feed.markRead.mockResolvedValue({ readAt: "2026-11-26T08:00:00.000Z" });

describe("bell: invitation notification feed", () => {
  it("marks unread invitations on the bell without inventing a total from loaded pages", async () => {
    renderWithProviders(<NotificationsPopover />);
    const bell = await screen.findByRole("button", { name: /new invitations$/ });
    // The mock Personal inbox has nothing unread: the label carries no invitation number.
    expect(bell).toHaveAccessibleName("Notifications, new invitations");
  });

  it("shows kind, inviter, role, dates and read state; marks read without answering; pages with the cursor", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsPopover />);
    await user.click(await screen.findByRole("button", { name: /^Notifications.*new invitations$/ }));
    const section = await screen.findByRole("region", { name: "Invitations" });
    const team = (await within(section).findByText("Research Guild")).closest("li")!;
    expect(team).toHaveAttribute("data-unread", "true");
    expect(team).toHaveTextContent("Team · from Sara P. · as MEMBER");
    expect(team).toHaveTextContent(/Sent .* · valid until/);

    await user.click(within(team).getByRole("button", { name: "Mark as read" }));
    expect(feed.markRead).toHaveBeenCalledWith("team", "inv-research");
    expect(routerPush).not.toHaveBeenCalled();

    // Expired: no actions. Meetings open the meeting to RSVP.
    const expired = within(section).getByText("Old Project").closest("li")!;
    expect(expired).toHaveTextContent("Expired");
    expect(within(expired).queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    const meeting = within(section).getByText("Weekly sync").closest("li")!;
    expect(within(meeting).getByRole("link", { name: "Open meeting to reply" })).toHaveAttribute("href", "/messages/meetings/meet-9");

    await user.click(within(section).getByRole("button", { name: "Show more invitations" }));
    expect(await within(section).findByText("Older Team")).toBeInTheDocument();
    expect(feed.list).toHaveBeenCalledWith("team", "c2");
  });

  it("Persian / RTL: translated kind, inviter and dates in Persian digits; names stay isolated", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsPopover />, { preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } });
    await user.click(await screen.findByRole("button", { name: "اعلان‌ها، دعوت‌های تازه" }));
    const section = await screen.findByRole("region", { name: "دعوت‌ها" });
    const team = (await within(section).findByText("Research Guild")).closest("li")!;
    expect(team).toHaveTextContent("تیم · از طرف Sara P. · با نقش MEMBER");
    // 2026-11-20T08:00Z = 29 Aban, 11:30 Tehran (Jalali, Persian digits).
    expect(team).toHaveTextContent("ارسال: ۲۹ آبان · ۱۱:۳۰");
    expect(within(team).getByText("Research Guild").closest("bdi")).toHaveAttribute("dir", "auto");
    expect(within(team).getByRole("button", { name: "علامت خوانده‌شده" })).toBeInTheDocument();
  });

  it("accepts through the module's own workflow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsPopover />);
    await user.click(await screen.findByRole("button", { name: /^Notifications.*new invitations$/ }));
    const section = await screen.findByRole("region", { name: "Invitations" });
    const team = (await within(section).findByText("Research Guild")).closest("li")!;
    await user.click(within(team).getByRole("button", { name: "Accept" }));
    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/^\/teams\//)));
  });
});
