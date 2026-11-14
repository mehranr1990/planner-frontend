import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsPopover } from "@/components/shell/notifications-popover";
import { resetToasts } from "@/components/ui/toast";
import { CompanyDataProvider } from "@/data/company-provider";
import { createMockRepositories } from "@/data/mock";
import { createMockCompanies } from "@/data/mock/mock-companies";
import type { PlannerNotification } from "@/data/personal-services";
import { DataProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { renderWithProviders } from "@/test/render";
import { setMockPathname } from "@/test/setup";
import { BillsPanel } from "./bills-panel";
import { RoutinesCard } from "./routines-card";
import { TaskFilesPanel } from "./task-files-panel";

/* Personal services UI over the mock adapters (and a fake inbox for the bell). */

afterEach(() => resetToasts());

function renderWith(ui: React.ReactElement, repositories: Repositories = createMockRepositories()) {
  renderWithProviders(<DataProvider repositories={repositories}>{ui}</DataProvider>);
  return repositories;
}

const note = (id: string, patch: Partial<PlannerNotification> = {}): PlannerNotification => ({
  id,
  revision: 1,
  title: `Reminder ${id}`,
  body: null,
  scheduledAt: "2026-11-14T08:00:00.000Z",
  read: false,
  reminderId: `r-${id}`,
  taskId: null,
  ...patch,
});

describe("NotificationsPopover", () => {
  it("keeps the empty state and no badge in mock mode", async () => {
    const user = userEvent.setup();
    renderWith(<NotificationsPopover />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("You’re all caught up")).toBeInTheDocument();
  });

  it("shows server notifications with the unread count, marks read, opens the task and dismisses", async () => {
    const user = userEvent.setup();
    const repositories = createMockRepositories();
    const items = [note("a", { taskId: "t-read-30-pages" }), note("b", { read: true })];
    const setRead = vi.fn(async (item: PlannerNotification, read: boolean) => ({ ...item, read }));
    const dismiss = vi.fn(async () => undefined);
    repositories.notifications = { ...repositories.notifications, list: async () => items, unreadCount: async () => 1, setRead, dismiss };
    renderWith(<NotificationsPopover />, repositories);

    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    const first = (await screen.findByRole("link", { name: "Reminder a" })).closest("li")!;
    expect(first).toHaveTextContent("unread");
    await user.click(within(first).getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(setRead).toHaveBeenCalledWith(items[0], true));

    const second = screen.getByText("Reminder b").closest("li")!;
    await user.click(within(second).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(items[1]));
    expect(screen.getByRole("link", { name: "Reminder a" })).toHaveAttribute("href", "/personal/tasks/t-read-30-pages");
  });
});

describe("NotificationsPopover · company", () => {
  it("inside a company lists its notifications, counts them in the badge, links to the entity and marks read", async () => {
    const user = userEvent.setup();
    setMockPathname("/companies/c1/people");
    const companies = createMockCompanies();
    const readNotification = vi.fn(async (_id: string, notificationId: string) => ({ id: notificationId, kind: "kb-ack-reminder" as const, subjectId: "doc-1", createdAt: "2026-11-14T08:00:00.000Z", read: true }));
    companies.notifications = async () => [
      { id: "n1", kind: "kb-ack-reminder", subjectId: "doc-1", createdAt: "2026-11-14T08:00:00.000Z", read: false },
      { id: "n2", kind: "file-request", subjectId: "acc-9", createdAt: "2026-11-13T08:00:00.000Z", read: true },
    ];
    companies.readNotification = readNotification;
    renderWithProviders(
      <DataProvider repositories={createMockRepositories()}>
        <CompanyDataProvider repository={companies}>
          <NotificationsPopover />
        </CompanyDataProvider>
      </DataProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    const section = await screen.findByRole("region", { name: "This company" });
    expect(within(section).getByRole("link", { name: "Please acknowledge a knowledge base page" })).toHaveAttribute("href", "/companies/c1/knowledge/doc-1");
    expect(within(section).getByRole("link", { name: "Someone asked to open an employee file" })).toHaveAttribute("href", "/companies/c1/people/acc-9/file");
    // Only the unread one offers "Mark as read"; there is no snooze / dismiss for company notifications.
    expect(within(section).getAllByRole("button", { name: "Mark as read" })).toHaveLength(1);
    expect(within(section).queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(readNotification).toHaveBeenCalledWith("c1", "n1"));
  });

  it("outside a company shows no company section", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal");
    const companies = createMockCompanies();
    const list = vi.fn(async () => []);
    companies.notifications = list;
    renderWithProviders(
      <DataProvider repositories={createMockRepositories()}>
        <CompanyDataProvider repository={companies}>
          <NotificationsPopover />
        </CompanyDataProvider>
      </DataProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await screen.findByText("You’re all caught up");
    expect(screen.queryByRole("region", { name: "This company" })).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});

describe("TaskFilesPanel", () => {
  it("uploads a supported file, refuses others, and deletes after confirming", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const repositories = renderWith(<TaskFilesPanel taskId="t-read-30-pages" />);
    expect(await screen.findByText("No files")).toBeInTheDocument();

    const input = screen.getByLabelText("Upload file", { selector: "input" });
    await user.upload(input, new File(["zip"], "a.zip", { type: "application/zip" }));
    expect(await screen.findByText("“a.zip” isn’t a text, PDF, PNG or JPEG file.")).toBeInTheDocument();

    await user.upload(input, new File(["hello"], "plan.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    expect(await repositories.taskFiles.list("t-read-30-pages")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Delete plan.pdf" }));
    await user.click(await screen.findByRole("button", { name: "Delete file" }));
    expect(await screen.findByText("No files")).toBeInTheDocument();
  });
});

describe("RoutinesCard", () => {
  it("creates an ordered routine from habits and deletes it", async () => {
    const user = userEvent.setup();
    const repositories = createMockRepositories();
    const habits = await repositories.habits.list();
    renderWith(<RoutinesCard habits={habits} />, repositories);
    expect(await screen.findByText("No routines yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New routine" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Morning");
    await user.click(within(dialog).getByRole("checkbox", { name: habits[1]!.title }));
    await user.click(within(dialog).getByRole("checkbox", { name: habits[0]!.title }));
    await user.click(within(dialog).getByRole("button", { name: "Add routine" }));

    const list = await screen.findByRole("list", { name: "Habits in Morning" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([habits[1]!.title, habits[0]!.title]);

    await user.click(screen.getByRole("button", { name: "Delete Morning" }));
    await user.click(await screen.findByRole("button", { name: "Delete routine" }));
    expect(await screen.findByText("No routines yet")).toBeInTheDocument();
  });
});

describe("BillsPanel", () => {
  it("adds a monthly bill and records an occurrence as paid (ledger only)", async () => {
    const user = userEvent.setup();
    renderWith(<BillsPanel today="2026-11-14" />);
    expect(await screen.findByText("No bills yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New bill" }));
    const form = await screen.findByRole("dialog");
    await user.type(within(form).getByLabelText("Name"), "Internet");
    await user.type(within(form).getByLabelText("Amount (Toman)"), "1,250,000");
    await user.click(within(form).getByRole("button", { name: "Add bill" }));

    const row = await screen.findByRole("button", { name: /Internet/ });
    expect(row).toHaveTextContent("1,250,000 Toman");
    await user.click(row);
    const details = await screen.findByRole("dialog", { name: "Internet" });
    const pay = await within(details).findAllByRole("button", { name: "Record payment" });
    await user.click(pay[0]!);
    expect(await screen.findByText(/doesn’t send money anywhere/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await within(details).findByText("Payment recorded")).toBeInTheDocument();
  });
});
