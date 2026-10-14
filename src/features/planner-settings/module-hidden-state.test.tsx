import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerRefresh } from "@/test/setup";
import { ModuleGate, ModuleHiddenState } from "./module-hidden-state";
import { parsePlannerSettings } from "./planner-settings";

const financeHidden = parsePlannerSettings({ modules: { finance: false } });

describe("ModuleHiddenState", () => {
  it("names the module, keeps the data promise and offers to turn it on (P17 · States)", () => {
    renderWithProviders(<ModuleHiddenState module="finance" />, { plannerSettings: financeHidden });
    const status = screen.getByRole("status");
    expect(status).toContainElement(screen.getByRole("heading", { level: 2, name: "Finance is hidden" }));
    expect(screen.getByText("You hid Finance in Settings. Your data is still here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn Finance on" })).toBeInTheDocument();
  });

  it("speaks Persian", () => {
    renderWithProviders(<ModuleHiddenState module="braindump" />, {
      plannerSettings: parsePlannerSettings({ modules: { braindump: false } }),
      preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" },
    });
    expect(screen.getByRole("heading", { name: "ذهن‌ریزی پنهان است" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "روشن کردن ذهن‌ریزی" })).toBeInTheDocument();
  });
});

describe("ModuleGate", () => {
  it("shows the hidden state for a hidden module, then the page once turned on", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ModuleGate module="finance">
        <p>Finance page</p>
      </ModuleGate>,
      { plannerSettings: financeHidden },
    );
    expect(screen.queryByText("Finance page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Turn Finance on" }));

    expect(screen.getByText("Finance page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finance is hidden" })).not.toBeInTheDocument();
    expect(document.cookie).toContain("mp-planner=");
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders visible and core modules as they are", () => {
    renderWithProviders(
      <>
        <ModuleGate module="goals">
          <p>Goals page</p>
        </ModuleGate>
        <ModuleGate module="tasks">
          <p>Tasks page</p>
        </ModuleGate>
      </>,
      { plannerSettings: financeHidden },
    );
    expect(screen.getByText("Goals page")).toBeInTheDocument();
    expect(screen.getByText("Tasks page")).toBeInTheDocument();
  });
});
