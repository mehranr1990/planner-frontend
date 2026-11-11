"use client";

import { AssistantLauncher } from "./assistant-panel";
import { useShellScope } from "./use-shell-ui";

/*
 * The floating Assistant is removed from every Personal screen (CLAUDE.md
 * §2.9, AI is out of scope this phase) and from every Project screen (SH01,
 * Projects README #10: AI deferred) and every Team screen (Teams README #9).
 * It stays mounted for Companies until that phase decides.
 */
export function NonPersonalAssistant() {
  const scope = useShellScope();
  return scope === "personal" || scope === "project" || scope === "team" ? null : <AssistantLauncher />;
}
