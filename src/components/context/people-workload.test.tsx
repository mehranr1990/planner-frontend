import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PeopleWorkload, topCenterNotchPath, type PeopleWorkloadPerson } from "./people-workload";

const person = (id: string, name: string, booked: number | null = 50): PeopleWorkloadPerson => ({
  id,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  role: "Designer",
  status: "available",
  workingOn: null,
  bookedPercent: booked,
});

function Harness({ people, statusOnly = false }: { people: PeopleWorkloadPerson[]; statusOnly?: boolean }) {
  const [selected, setSelected] = useState<string>();
  return (
    <PeopleWorkload
      title="People"
      scope="team"
      people={people}
      selectedId={selected}
      onSelect={setSelected}
      statusLabel={(status) => status ?? "none"}
      legend={["available", "busy"]}
      statusOnly={statusOnly}
      moreHref="/teams/x/people"
    />
  );
}

describe("PeopleWorkload (shared)", () => {
  it("builds a symmetric top-centre notch path", () => {
    const path = topCenterNotchPath(1000, 300, 488);
    expect(path).toContain("L 226 0");
    expect(path).toContain("A 30 30 0 0 1 256 30");
    expect(path).toContain("L 744 30 A 30 30 0 0 1 774 0");
    expect(path.endsWith("Z")).toBe(true);
  });

  it("sorts A–Z, caps the picker at 8 + “+N”, and moves selection with arrow keys", async () => {
    const user = userEvent.setup();
    const names = ["Zed", "Amy", "Bob", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy"];
    renderWithProviders(<Harness people={names.map((name, index) => person(`p${index}`, name))} />);
    const picker = screen.getByRole("radiogroup", { name: "People" });
    const radios = within(picker).getAllByRole("radio");
    expect(radios).toHaveLength(8);
    expect(radios[0]).toHaveAccessibleName("Amy, available");
    expect(screen.getByRole("link", { name: "2 more people" })).toHaveAttribute("href", "/teams/x/people");
    radios[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(picker).getByRole("radio", { name: "Bob, available" })).toHaveAttribute("aria-checked", "true");
    // The strip shows "Not shared" when the person does not share their work.
    expect(screen.getByText("Not shared")).toBeInTheDocument();
  });

  it("status-only mode replaces bars with status text", () => {
    renderWithProviders(<Harness people={[person("a", "Amy"), person("b", "Bob")]} statusOnly />);
    expect(screen.queryAllByRole("meter")).toHaveLength(0);
  });

  it("shows the red overflow segment over 100%", () => {
    renderWithProviders(<Harness people={[person("a", "Amy", 103)]} />);
    const meters = screen.getAllByRole("meter", { name: "Amy, booked this week" });
    expect(meters[0]!.querySelector("[data-overflow]")).not.toBeNull();
  });
});
