import type { MyDayView } from "@/features/my-day/my-day-context";
import { MY_DAY_STATES, type MyDayState } from "@/fixtures/personal/my-day-states";

/*
 * The URL of the My Day demo route (dev harness, not in any navigation):
 *
 *   /styleguide/my-day                                     the normal sample day
 *   /styleguide/my-day?state=empty                         no blocks, tasks waiting
 *   /styleguide/my-day?state=partial                       gaps with "N tasks fit"
 *   /styleguide/my-day?state=overloaded                    9h 40m of 8h, one overlap
 *   /styleguide/my-day?state=no-current                    14:35 falls between blocks
 *   /styleguide/my-day?state=after-hours                   19:30, every block is over
 *   /styleguide/my-day?state=overloaded&reschedule=blk-t-od-client-prep
 *                                                          Reschedule open on that block
 *   /styleguide/my-day?state=normal&reschedule=client-call Reschedule on an event block
 *   ...&view=3days                                         the three-day timeline
 *
 * Every state is a separate in-memory store, so nothing here touches the
 * production sample data or the URL of the real screen.
 */

export const MY_DAY_DEMO_PATH = "/styleguide/my-day";

export interface MyDayDemoParams {
  state: MyDayState;
  /** A block id to open Reschedule on, or null. */
  rescheduleBlockId: string | null;
  view: MyDayView;
}

interface ParamReader {
  get(name: string): string | null;
}

const isState = (value: string | null): value is MyDayState => (MY_DAY_STATES as readonly string[]).includes(value ?? "");

/** Reads the demo route's query; unknown values fall back to the normal day. */
export function parseMyDayDemoParams(params: ParamReader): MyDayDemoParams {
  const state = params.get("state");
  const reschedule = params.get("reschedule");
  return {
    state: isState(state) ? state : "normal",
    rescheduleBlockId: reschedule ? reschedule : null,
    view: params.get("view") === "3days" ? "3days" : "day",
  };
}

/** The demo route for a state (and optionally a block to reschedule). */
export function myDayDemoHref(state: MyDayState, rescheduleBlockId?: string): string {
  const params = new URLSearchParams();
  if (state !== "normal") params.set("state", state);
  if (rescheduleBlockId) params.set("reschedule", rescheduleBlockId);
  const query = params.toString();
  return query ? `${MY_DAY_DEMO_PATH}?${query}` : MY_DAY_DEMO_PATH;
}
