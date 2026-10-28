"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { appContexts } from "@/features/navigation/contexts";
import type { ContextId, Workspace } from "@/features/navigation/types";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { CommandPalette } from "./command-palette";
import { useReturnFocus } from "./use-shell-ui";

/*
 * Client state shared by the shell's islands: which workspace is chosen in
 * each context (local UI state only, no API) and the command palette, which
 * opens from the top bar and from ⌘K / Ctrl+K anywhere in the shell.
 */

export interface ShellProfile {
  name: string;
  /** Secondary line, e.g. "Euroly · Admin" (data, not translated). */
  detail: string;
}

export type ShellWorkspaces = Readonly<Record<ContextId, readonly Workspace[]>>;

interface ShellContextValue {
  workspaces: ShellWorkspaces;
  profile: ShellProfile;
  /** The workspaces and profile are sample data (shown as such). */
  sample: boolean;
  /** Selected workspace id per context (the first workspace until one is picked). */
  activeWorkspaceIds: Readonly<Record<ContextId, string | undefined>>;
  selectWorkspace: (context: ContextId, workspaceId: string) => void;
  paletteOpen: boolean;
  /** Opens the palette; focus returns to the element focused now when it closes. */
  openPalette: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = use(ShellContext);
  if (!value) throw new Error("useShell must be used inside <ShellProvider>");
  return value;
}

/** The signed-in profile, or null outside the shell (tests, demo harnesses). */
export function useShellProfile(): ShellProfile | null {
  return use(ShellContext)?.profile ?? null;
}

/** The chosen workspace of a context, if it has any. */
export function useActiveWorkspace(context: ContextId): Workspace | undefined {
  const { workspaces, activeWorkspaceIds } = useShell();
  const list = workspaces[context] ?? [];
  return list.find((workspace) => workspace.id === activeWorkspaceIds[context]) ?? list[0];
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** ⌘K on macOS, Ctrl+K elsewhere; `code` keeps it working on Persian layouts. */
function isPaletteShortcut(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  return event.code === "KeyK" || event.key.toLowerCase() === "k";
}

/** ⌘⇧N on macOS, Ctrl+Shift+N elsewhere: Quick note (P18 · F). `code` keeps it working on Persian layouts. */
function isQuickNoteShortcut(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || !event.shiftKey) return false;
  return event.code === "KeyN" || event.key.toLowerCase() === "n";
}

export interface ShellProviderProps {
  workspaces: ShellWorkspaces;
  profile: ShellProfile;
  /** Marks the workspaces and profile as sample data. */
  sample?: boolean;
  children: ReactNode;
}

export function ShellProvider({ workspaces, profile, sample = false, children }: ShellProviderProps) {
  const [selected, setSelected] = useState<Partial<Record<ContextId, string>>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { capture, onCloseAutoFocus } = useReturnFocus();

  const activeWorkspaceIds = useMemo(
    () =>
      Object.fromEntries(
        appContexts.map((context) => [context.id, selected[context.id] ?? workspaces[context.id]?.[0]?.id]),
      ) as Record<ContextId, string | undefined>,
    [selected, workspaces],
  );

  const selectWorkspace = useCallback((context: ContextId, workspaceId: string) => {
    setSelected((current) => ({ ...current, [context]: workspaceId }));
  }, []);

  const openPalette = useCallback(() => {
    capture();
    setPaletteOpen(true);
  }, [capture]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isPaletteShortcut(event)) return;
      const inPalette = event.target instanceof Element && event.target.closest("[data-command-palette]") !== null;
      // Typing elsewhere keeps the browser's/field's own Ctrl+K.
      if (isEditable(event.target) && !inPalette) return;
      event.preventDefault();
      if (paletteOpen) {
        setPaletteOpen(false);
      } else {
        capture();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, capture]);

  // Quick note opens over any Personal route, even from a text field (it is a capture shortcut).
  const pathname = usePathname();
  const openSheet = useOpenSheet();
  const personal = pathname === "/personal" || pathname.startsWith("/personal/");
  useEffect(() => {
    if (!personal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isQuickNoteShortcut(event)) return;
      if (new URLSearchParams(window.location.search).get("sheet") === "note") return;
      event.preventDefault();
      openSheet("note");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [personal, openSheet]);

  const value = useMemo<ShellContextValue>(
    () => ({ workspaces, profile, sample, activeWorkspaceIds, selectWorkspace, paletteOpen, openPalette }),
    [workspaces, profile, sample, activeWorkspaceIds, selectWorkspace, paletteOpen, openPalette],
  );

  return (
    <ShellContext value={value}>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onCloseAutoFocus={onCloseAutoFocus} />
    </ShellContext>
  );
}
