import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { renderWithProviders } from "@/test/render";
import { TaskDetailView } from "./task-detail-view";

/* P06 Task category: an optional Personal-only property row (design / admin / writing / errands, or None). */

afterEach(() => resetToasts());

function renderDetail(id: string) {
  const repositories = createMockRepositories();
  renderWithProviders(
    <DataProvider repositories={repositories}>
      <TaskDetailView id={id} variant="page" closeControl={null} onDismiss={() => {}} />
    </DataProvider>,
  );
  return repositories;
}

describe("TaskDetailView · category", () => {
  it("sets, shows and clears the category of a Personal task", async () => {
    const user = userEvent.setup();
    const repositories = renderDetail("t-read-30-pages");
    const row = await screen.findByRole("button", { name: /Category\s*None/ });
    await user.click(row);
    await user.click(await screen.findByRole("menuitem", { name: "Writing" }));
    await waitFor(async () => expect((await repositories.tasks.get("t-read-30-pages"))?.category).toBe("writing"));
    expect(await screen.findByRole("button", { name: /Category\s*Writing/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Category\s*Writing/ }));
    await user.click(await screen.findByRole("menuitem", { name: "None" }));
    await waitFor(async () => expect((await repositories.tasks.get("t-read-30-pages"))?.category).toBeNull());
  });

  it("has no category control on a Project or Team task", async () => {
    renderDetail("t-reply-katy-brief");
    await screen.findByRole("region", { name: "Properties" });
    expect(screen.queryByRole("button", { name: /Category/ })).not.toBeInTheDocument();
  });
});
