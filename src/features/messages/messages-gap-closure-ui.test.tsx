import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsPopover } from "@/components/shell/notifications-popover";
import { resetToasts } from "@/components/ui/toast";
import type { ConversationInvitation, MessagingNotice } from "@/data/messaging-domain";
import { MessagingDataProvider } from "@/data/messaging-provider";
import { MessagingError, type MessagingRepository } from "@/data/messaging-repositories";
import { createMessagingServer } from "@/data/mock/mock-messaging";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname } from "@/test/setup";
import { ConversationList } from "./conversation-list";
import { MeetingPage } from "./meetings/meeting-page";
import { MinutesScreen } from "./meetings/minutes-screen";

/* Messages & Meetings gap closure UI: invitation inbox, bell section, meeting file download, minutes withdraw (mock repository + stubs). */

afterEach(() => resetToasts());

function render(ui: ReactElement, patch: (repo: MessagingRepository) => MessagingRepository = (repo) => repo, path = "/messages") {
  setMockPathname(path);
  const repository = patch(createMessagingServer({ simulate: false, uploadStepMs: 0 }).as("me"));
  renderWithProviders(<MessagingDataProvider repository={repository}>{ui}</MessagingDataProvider>);
  return repository;
}

const INVITE: ConversationInvitation = { id: "i1", revision: 3, conversationId: "c-new", kind: "group", inviterName: "Sara Karimi", expiresAt: new Date(Date.now() + 86_400_000).toISOString() };

describe("conversation invitation inbox", () => {
  it("shows served fields only; Accept joins and opens the conversation", async () => {
    const user = userEvent.setup();
    const respondInvitation = vi.fn(async () => "c-new");
    render(<ConversationList />, (repo) => ({ ...repo, conversations: { ...repo.conversations, invitations: async () => [INVITE, { ...INVITE, id: "i2", inviterName: null, kind: "channel" }], respondInvitation } }));
    const inbox = await screen.findByRole("region", { name: "Invitations" });
    expect(within(inbox).getByText("From Sara Karimi")).toBeInTheDocument();
    expect(within(inbox).getByText("Someone invited you")).toBeInTheDocument();
    await user.click(within(inbox).getAllByRole("button", { name: "Accept" })[0]!);
    await waitFor(() => expect(respondInvitation).toHaveBeenCalledWith(INVITE, true));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/messages/c-new"));
  });

  it("a revoked / expired invitation reports itself", async () => {
    const user = userEvent.setup();
    render(<ConversationList />, (repo) => ({
      ...repo,
      conversations: { ...repo.conversations, invitations: async () => [INVITE], respondInvitation: async () => Promise.reject(new MessagingError("invalid", "Changed elsewhere")) },
    }));
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    expect(await screen.findByText("This invitation is no longer available.")).toBeInTheDocument();
  });

  it("no invitations → no section", async () => {
    render(<ConversationList />);
    await screen.findByRole("region", { name: "Messages" });
    expect(screen.queryByRole("region", { name: "Invitations" })).not.toBeInTheDocument();
  });
});

describe("bell: messages section", () => {
  it("counts unread notices + reminders in the badge, links them and marks read", async () => {
    const user = userEvent.setup();
    const notice: MessagingNotice = { id: "n1", revision: 2, conversationId: "c-1", kind: "message", messageId: "m1", invitationId: null, read: false, at: new Date().toISOString() };
    const readNotice = vi.fn(async () => undefined);
    const readReminder = vi.fn(async () => undefined);
    render(<NotificationsPopover />, (repo) => ({
      ...repo,
      conversations: { ...repo.conversations, notices: async () => [notice, { ...notice, id: "n2", kind: "invitation", read: true }], readNotice },
      announcements: {
        ...repo.announcements,
        reminders: async () => [
          { id: "r1", announcementId: "a1", at: new Date().toISOString(), read: false, title: "Office move", source: { kind: "team", workspaceId: "t1", name: "Design" } },
          { id: "r2", announcementId: "a2", at: new Date().toISOString(), read: true, title: null, source: null },
        ],
        readReminder,
      },
    }), "/personal");
    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    const section = await screen.findByRole("region", { name: "Messages" });
    expect(within(section).getByRole("link", { name: "New message" })).toHaveAttribute("href", "/messages/c-1");
    expect(within(section).getByRole("link", { name: "Conversation invitation" })).toHaveAttribute("href", "/messages");
    expect(within(section).getByRole("link", { name: "Please read: Office move" })).toHaveAttribute("href", "/teams/t1/announcements");
    expect(within(section).queryByRole("link", { name: "Announcement to read" })).not.toBeInTheDocument();
    expect(within(section).getByText("Announcement to read")).toBeInTheDocument();
    const [first] = within(section).getAllByRole("button", { name: "Mark as read" });
    await user.click(first!);
    await waitFor(() => expect(readNotice.mock.calls.length + readReminder.mock.calls.length).toBe(1));
  });
});

describe("meeting file download", () => {
  it("downloads through the repository; a forbidden file explains itself", async () => {
    const user = userEvent.setup();
    const download = vi.fn(async () => Promise.reject(new MessagingError("forbidden")));
    const files = [
      { id: "f1", name: "brief.pdf", bytes: 9, linked: false },
      { id: "f2", name: "Spec", bytes: 1, linked: true },
    ];
    render(
      <MeetingPage id="mt-retro" />,
      (r) => ({ ...r, meetings: { ...r.meetings, get: async (id) => ({ ...(await r.meetings.get(id))!, files }), download } }),
      "/messages/meetings/mt-retro",
    );
    await user.click(await screen.findByRole("tab", { name: /Files/ }));
    expect(screen.queryByRole("button", { name: "Download Spec" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Download brief.pdf" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith("mt-retro", "f1"));
    expect(await screen.findByText("You don’t have access to that anymore.")).toBeInTheDocument();
  });
});

describe("minutes withdraw", () => {
  it("shown only when allowed; confirmation before the transition", async () => {
    const user = userEvent.setup();
    const withdraw = vi.fn(async () => undefined);
    render(
      <MinutesScreen id="mt-retro" />,
      (repo) => ({
        ...repo,
        minutes: {
          ...repo.minutes,
          get: async (id) => {
            const min = (await repo.minutes.get(id))!;
            return { ...min, status: "in-review", can: { ...min.can, review: false, withdraw: true } };
          },
          withdraw,
        },
      }),
      "/messages/meetings/mt-retro/minutes",
    );
    await user.click(await screen.findByRole("button", { name: "Withdraw to Draft" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Withdraw these minutes?" });
    expect(withdraw).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(withdraw).toHaveBeenCalledWith("mt-retro"));
    expect(await screen.findByText("Back to Draft")).toBeInTheDocument();
  });

  it("not offered when the server does not allow it", async () => {
    render(<MinutesScreen id="mt-retro" />, (repo) => repo, "/messages/meetings/mt-retro/minutes");
    await screen.findByRole("button", { name: "Approve minutes" });
    expect(screen.queryByRole("button", { name: "Withdraw to Draft" })).not.toBeInTheDocument();
  });
});
