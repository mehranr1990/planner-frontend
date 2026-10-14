import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Avatar, AvatarGroup, getInitials } from "./avatar";

describe("getInitials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(getInitials("Mehran Raeeszade")).toBe("MR");
    expect(getInitials("  katy  ")).toBe("K");
    expect(getInitials("Katy Jane Park")).toBe("KP");
    expect(getInitials("مهران رئیس‌زاده")).toBe("مر");
    expect(getInitials("")).toBe("");
  });
});

describe("Avatar", () => {
  it("labels the avatar with the name and shows initials as fallback", () => {
    renderWithProviders(<Avatar name="Pari Tehrani" tone="project" size={48} />);
    const avatar = screen.getByRole("img", { name: "Pari Tehrani" });
    expect(avatar).toHaveTextContent("PT");
    expect(avatar).toHaveClass("size-12", "bg-project-soft", "text-project-deep");
  });

  it("supports custom initials, neutral tone and decorative use", () => {
    renderWithProviders(<Avatar name="Jack Kim" initials="JK" size={32} decorative />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const fallback = screen.getByText("JK");
    expect(fallback.parentElement).toHaveClass("size-8", "bg-raised");
    expect(fallback.parentElement).toHaveAttribute("aria-hidden", "true");
  });
});

describe("AvatarGroup", () => {
  const people = [
    { name: "Kian Farahani", tone: "team" as const },
    { name: "Jack Kim" },
    { name: "Sara Pakzad" },
    { name: "Nima Rad" },
    { name: "Lili Amini" },
  ];

  it("shows max avatars plus an overflow bubble with accessible labels", () => {
    renderWithProviders(<AvatarGroup people={people} max={3} />);
    const group = screen.getByRole("group", { name: "5 people" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByRole("img", { name: "2 more" })).toHaveTextContent("+2");
    expect(screen.getByRole("img", { name: "Kian Farahani" })).toHaveTextContent("KF");
  });

  it("uses singular wording and no bubble when everyone fits", () => {
    renderWithProviders(<AvatarGroup people={people.slice(0, 1)} />);
    expect(screen.getByRole("group", { name: "1 person" })).toBeInTheDocument();
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it("accepts a custom label", () => {
    renderWithProviders(<AvatarGroup people={people} label="Assignees" />);
    expect(screen.getByRole("group", { name: "Assignees" })).toBeInTheDocument();
  });

  it("formats counts with Persian digits and keeps the plus sign LTR", () => {
    renderWithProviders(<AvatarGroup people={people} max={3} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("group", { name: "۵ نفر" })).toBeInTheDocument();
    const more = screen.getByRole("img", { name: "۲ نفر دیگر" });
    expect(more).toHaveTextContent("+۲");
    expect(more.querySelector("[dir=ltr]")).not.toBeNull();
  });
});
