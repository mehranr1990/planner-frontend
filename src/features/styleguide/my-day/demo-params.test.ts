import { describe, expect, it } from "vitest";
import { MY_DAY_STATES } from "@/fixtures/personal/my-day-states";
import { myDayDemoHref, MY_DAY_DEMO_PATH, parseMyDayDemoParams } from "./demo-params";

const parse = (query: string) => parseMyDayDemoParams(new URLSearchParams(query));

describe("My Day demo URL", () => {
  it("reads every state, falling back to the normal day", () => {
    for (const state of MY_DAY_STATES) expect(parse(`state=${state}`).state).toBe(state);
    expect(parse("").state).toBe("normal");
    expect(parse("state=nope").state).toBe("normal");
  });

  it("reads the block to reschedule and the view", () => {
    expect(parse("state=overloaded&reschedule=blk-t-od-client-prep&view=3days")).toEqual({
      state: "overloaded",
      rescheduleBlockId: "blk-t-od-client-prep",
      view: "3days",
    });
    expect(parse("")).toEqual({ state: "normal", rescheduleBlockId: null, view: "day" });
    expect(parse("view=week").view).toBe("day");
  });

  it("builds the link of a state, leaving defaults out", () => {
    expect(myDayDemoHref("normal")).toBe(MY_DAY_DEMO_PATH);
    expect(myDayDemoHref("empty")).toBe("/styleguide/my-day?state=empty");
    expect(myDayDemoHref("overloaded", "blk-t-od-client-prep")).toBe(
      "/styleguide/my-day?state=overloaded&reschedule=blk-t-od-client-prep",
    );
    // What it builds, it reads back.
    expect(parse(myDayDemoHref("partial").split("?")[1] ?? "").state).toBe("partial");
  });
});
