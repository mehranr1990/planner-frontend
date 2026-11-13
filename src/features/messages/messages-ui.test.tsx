import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MessagingDataProvider } from "@/data/messaging-provider";
import { createMessagingServer } from "@/data/mock/mock-messaging";
import { preferencesForLocale } from "@/features/preferences/preferences-store";
import { renderWithProviders, type ProvidersRenderOptions } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { AnnouncementsBody } from "./announcements/announcements-screen";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { MeetingsScreen } from "./meetings/meetings-screen";
import { MinutesScreen } from "./meetings/minutes-screen";
import { MessagesButton } from "./messages-button";
import { resetOutbox, setForcedOffline } from "./outbox";
import { SearchScreen } from "./search/search-screen";
import { MessageSettingsScreen } from "./settings/message-settings-screen";

/*
 * Messages & Meetings UI in Mock Mode: what the server decides is what the
 * screens show (48h window, policy, receipts, removed / blocked / joined
 * later states, visible-history search, minutes review, acknowledgements).
 */

function renderMessaging(ui: ReactElement, { path = "/messages", search = "", ...options }: ProvidersRenderOptions & { path?: string; search?: string } = {}) {
  setMockPathname(path);
  setMockSearch(search);
  const server = createMessagingServer({ simulate: false, uploadStepMs: 0 });
  const repository = server.as("me");
  return { server, repository, ...renderWithProviders(<MessagingDataProvider repository={repository}>{ui}</MessagingDataProvider>, options) };
}

afterEach(() => resetOutbox());

describe("MS-01 shell", () => {
  it("header button shows unread, unmuted conversations and opens /messages with ⌘/Ctrl+Shift+M", async () => {
    renderMessaging(<MessagesButton />, { path: "/personal" });
    const link = await screen.findByRole("link", { name: /^Messages, \d+ unread$/ });
    expect(link).toHaveAttribute("href", "/messages");
    await userEvent.keyboard("{Control>}{Shift>}m{/Shift}{/Control}");
    expect(routerPush).toHaveBeenCalledWith("/messages");
  });

  it("removed and unknown conversations show access states without any history", async () => {
    renderMessaging(<ConversationView conversationId="c-bookclub" />);
    expect(await screen.findByRole("heading", { name: "You’re no longer in this conversation" })).toBeInTheDocument();
    expect(screen.queryByText("Next book: The Blind Owl")).not.toBeInTheDocument();
  });
});

describe("MS-02 list and direct conversation", () => {
  it("lists conversations with source chips and filters by tab", async () => {
    renderMessaging(<ConversationList />);
    const list = await screen.findByRole("region", { name: "Messages" });
    expect(await within(list).findByText("Nazanin A.")).toBeInTheDocument();
    expect(within(list).getAllByText("Website Redesign").length).toBeGreaterThan(0);
    await userEvent.click(within(list).getByRole("radio", { name: "Groups" }));
    await waitFor(() => expect(within(list).queryByText("Nazanin A.")).not.toBeInTheDocument());
    expect(within(list).getByText("Family")).toBeInTheDocument();
    expect(within(list).queryByText("Book club")).not.toBeInTheDocument();
  });

  it("shows day separators, the unread line, receipts, edited label and tombstones", async () => {
    renderMessaging(<ConversationView conversationId="c-nazanin" />, { path: "/messages/c-nazanin" });
    const log = await screen.findByRole("log", { name: "Message history" });
    expect(await within(log).findByText("Sunday hike — are we still on?")).toBeInTheDocument();
    expect(within(log).getByRole("separator", { name: "2 new" })).toBeInTheDocument();
    expect(within(log).getByRole("separator", { name: "Today" })).toBeInTheDocument();
    expect(within(log).getByText("You deleted this message for everyone")).toBeInTheDocument();
    expect(within(log).getAllByText("edited").length).toBeGreaterThan(0);
    expect(within(log).getAllByText("Seen").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /call/i })).not.toBeInTheDocument();
  });

  it("delete within 48h offers for everyone or for me; after 48h only for me", async () => {
    const user = userEvent.setup();
    renderMessaging(<ConversationView conversationId="c-nazanin" />, { path: "/messages/c-nazanin" });
    const log = await screen.findByRole("log", { name: "Message history" });
    const recent = (await within(log).findAllByText("Yes! Darband at 7?"))[0]!.closest("[id^='msg-']") as HTMLElement;
    await user.click(within(recent).getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toHaveTextContent(/\d+h left/);
    await user.click(screen.getByRole("menuitem", { name: "Delete…" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete · within 48h" });
    expect(within(dialog).getByRole("radio", { name: /Delete for everyone/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(log).findAllByText("You deleted this message for everyone")).toHaveLength(2);

    const old = (await within(log).findByText("Sent you the trail map link from last year")).closest("[id^='msg-']") as HTMLElement;
    await user.click(within(old).getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: /Edit/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const after = await screen.findByRole("alertdialog", { name: "Delete · after 48h" });
    expect(within(after).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(after).getByText(/Nazanin A\. still sees it/)).toBeInTheDocument();
    await user.click(within(after).getByRole("button", { name: "Delete for me" }));
    await waitFor(() => expect(within(log).queryByText("Sent you the trail map link from last year")).not.toBeInTheDocument());
  });

  it("sends with a client op id; offline sends queue (mock) and go out on reconnect", async () => {
    const user = userEvent.setup();
    renderMessaging(<ConversationView conversationId="c-sara" />, { path: "/messages/c-sara" });
    const box = await screen.findByRole("textbox", { name: "Message Sara" });
    setForcedOffline(true);
    await user.type(box, "Queued hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/1 message will send when you’re back online/)).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    setForcedOffline(false);
    await waitFor(() => expect(screen.queryByText("Queued")).not.toBeInTheDocument());
    expect(await screen.findByText("Queued hello")).toBeInTheDocument();
  });

  it("blocked direct replaces the composer with a note and Unblock", async () => {
    renderMessaging(<ConversationView conversationId="c-reza" />, { path: "/messages/c-reza" });
    expect(await screen.findByText("You can’t message each other here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unblock" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Message/ })).not.toBeInTheDocument();
  });
});

describe("MS-03 / MS-04 work channel", () => {
  it("shows pinned bar, joined-later note, restricted task card and the policy-off delete dialog", async () => {
    const user = userEvent.setup();
    renderMessaging(<ConversationView conversationId="c-website" />, { path: "/projects/website-redesign/channels/c-website" });
    const log = await screen.findByRole("log", { name: "Message history" });
    expect(await within(log).findByText(/You joined on .* earlier history follows the channel policy/)).toBeInTheDocument();
    expect(within(log).queryByText(/Kick-off notes/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pinned/ })).toHaveTextContent("1 of 2");
    expect(within(log).getByText("Restricted item")).toBeInTheDocument();
    expect(within(log).getByText("Payment errors copy")).toBeInTheDocument();
    expect(within(log).getByText("Deleted user")).toBeInTheDocument();
    const mine = (await within(log).findByText("On it — will post in the task too.")).closest("[id^='msg-']") as HTMLElement;
    expect(within(mine).getAllByText("Delivered").length).toBeGreaterThan(0);
    expect(within(mine).queryByText("Seen")).not.toBeInTheDocument();
    await user.click(within(mine).getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete · work channel" });
    expect(within(dialog).getByText(/doesn’t allow deleting for everyone/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete for me" })).toBeInTheDocument();
  });
});

describe("MS-07 search", () => {
  it("finds only visible history and links to the message", async () => {
    const user = userEvent.setup();
    renderMessaging(<SearchScreen />, { path: "/messages/search" });
    const box = await screen.findByRole("searchbox", { name: "Search messages" });
    await user.type(box, "Kick-off{Enter}");
    expect(await screen.findByRole("heading", { name: /No results|Nothing matches/i })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "trail map{Enter}");
    const link = await screen.findByRole("link", { name: /Trail map from last time/ });
    expect(link.getAttribute("href")).toMatch(/^\/messages\/c-nazanin\?m=/);
  });
});

describe("MS-09 settings", () => {
  it("saves privacy settings and lists blocked people", async () => {
    const user = userEvent.setup();
    const { repository } = renderMessaging(<MessageSettingsScreen />, { path: "/messages/settings" });
    const receipts = await screen.findByRole("switch", { name: /Read receipts in direct messages/ });
    await user.click(receipts);
    await waitFor(async () => expect((await repository.settings.get()).receiptsDirect).toBe(false));
    expect(screen.getByText("Reza B.")).toBeInTheDocument();
  });
});

describe("MT-01 – MT-04", () => {
  it("lists upcoming meetings with RSVP and the Needs minutes count", async () => {
    renderMessaging(<MeetingsScreen />, { path: "/messages/meetings" });
    expect(await screen.findByText("Design critique")).toBeInTheDocument();
    expect(screen.getAllByText("Respond").length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: "Needs minutes 1" })).toBeInTheDocument();
  });

  it("the reviewer approves minutes from the signature card", async () => {
    const user = userEvent.setup();
    renderMessaging(<MinutesScreen id="mt-retro" />, { path: "/messages/meetings/mt-retro/minutes" });
    const approve = await screen.findByRole("button", { name: "Approve minutes" });
    await user.click(approve);
    await waitFor(() => expect(screen.getAllByText("Approved").length).toBeGreaterThan(0));
  });

  it("make task needs an explicit confirmation", async () => {
    const user = userEvent.setup();
    renderMessaging(<MinutesScreen id="mt-kickoff" />, { path: "/messages/meetings/mt-kickoff/minutes" });
    await user.click((await screen.findAllByRole("button", { name: "Make task" }))[0]!);
    expect(await screen.findByRole("alertdialog", { name: "Create a task?" })).toBeInTheDocument();
  });

  it("announcements: audience members acknowledge; authors see counts and remind", async () => {
    const user = userEvent.setup();
    renderMessaging(<AnnouncementsBody source={{ kind: "project", workspaceId: "website-redesign", name: "Website Redesign" }} />, { path: "/projects/website-redesign/announcements" });
    expect(await screen.findByText("Beta freeze starts Sunday")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /5 of \d+ read/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send reminder" }));
    expect(await screen.findByText(/reminded/)).toBeInTheDocument();
  });
});

describe("MS · Persian RTL", () => {
  it("uses Persian labels and digits; my bubbles sit at the inline end (left in RTL)", async () => {
    renderMessaging(<ConversationView conversationId="c-nazanin" />, { path: "/messages/c-nazanin", preferences: { ...preferencesForLocale("fa"), currency: "toman" } });
    const log = await screen.findByRole("log", { name: "تاریخچه‌ی پیام‌ها" });
    expect(await within(log).findByText("۱۰:۴۲")).toBeInTheDocument();
    expect(within(log).getAllByText("دیده شد").length).toBeGreaterThan(0);
    expect(within(log).getAllByText("ویرایش‌شده").length).toBeGreaterThan(0);
    const mine = (await within(log).findAllByText("Yes! Darband at 7?"))[0]!.closest("[id^='msg-']") as HTMLElement;
    // Logical layout: row-reverse puts my bubble at inline-end, which is the left edge under dir="rtl".
    expect(mine.className).toContain("flex-row-reverse");
  });
});
