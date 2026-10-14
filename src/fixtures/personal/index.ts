/*
 * SAMPLE DATA — the Personal fixture set the mock repositories serve
 * (src/data/mock). Every module here is sample content for the fixed sample
 * day; nothing in production code should import it except the mock adapter.
 */

import { sampleBlocks } from "./blocks";
import { sampleInboxItems } from "./inbox";
import { SAMPLE_DAY } from "./sample-day";
import { sampleTasks } from "./tasks";

export { sampleBlocks } from "./blocks";
export { sampleInboxItems } from "./inbox";
export { SAMPLE_DAY, SAMPLE_NOW, sampleDays, sampleInstant } from "./sample-day";
export { sampleTasks } from "./tasks";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

export const personalFixtures = {
  today: SAMPLE_DAY,
  tasks: sampleTasks,
  blocks: sampleBlocks,
  inbox: sampleInboxItems,
};
