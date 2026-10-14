"use client";

import { AssistantLauncher } from "./assistant-panel";
import { useShellScope } from "./use-shell-ui";

/*
 * The floating Assistant is removed from every Personal screen (CLAUDE.md
 * §2.9, AI is out of scope this phase). It stays mounted for the other
 * contexts until their own phase decides; the files are retired later.
 */
export function NonPersonalAssistant() {
  return useShellScope() === "personal" ? null : <AssistantLauncher />;
}
