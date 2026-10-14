"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { NoResultsState } from "@/components/feedback/state-views";
import { ComingSoonBadge } from "@/components/navigation/coming-soon-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";
import { appContexts } from "@/features/navigation/contexts";
import type { ContextId, NavItem } from "@/features/navigation/types";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/locale/digits";
import { useShellScope } from "./use-shell-ui";

/*
 * Command palette (Shell board, "Search and commands"). Step 2 lists
 * destinations only: each context's overview (navigable) and its planned
 * pages (listed, disabled, "Coming soon"). ARIA combobox pattern: focus stays
 * in the search field, arrows move aria-activedescendant through the
 * listbox, Enter opens, Escape clears the text first and then closes.
 *
 * Announcements: one polite live region owned by the palette reads the
 * result count once typing pauses. The no-results view is not live itself
 * (live={false}), so it is not re-announced on every keystroke.
 */

/** Typing pause before the result count is announced. */
const ANNOUNCE_DELAY_MS = 500;

interface PaletteEntry {
  key: string;
  context: ContextId;
  item: NavItem;
  label: string;
  available: boolean;
}

interface PaletteGroup {
  context: ContextId;
  label: string;
  entries: PaletteEntry[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Return focus to whatever opened the palette (see useReturnFocus). */
  onCloseAutoFocus?: (event: Event) => void;
}

export function CommandPalette({ open, onOpenChange, onCloseAutoFocus }: CommandPaletteProps) {
  const t = useTranslations("Shell.palette");
  const scope = useShellScope();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("title")}
        hideTitle
        hideClose
        size="lg"
        data-scope={scope}
        data-command-palette=""
        onCloseAutoFocus={onCloseAutoFocus}
        // Opens near the top like the board, so results grow downwards.
        className="sm:mt-24"
      >
        {/* Mounted only while open, so the query resets on every opening. */}
        <PaletteBody onNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function matches(entry: PaletteEntry, contextLabel: string, query: string) {
  return entry.label.toLocaleLowerCase().includes(query) || contextLabel.toLocaleLowerCase().includes(query);
}

function PaletteBody({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("Shell.palette");
  const tNav = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const { digits } = usePreferences();
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const allGroups = useMemo<PaletteGroup[]>(
    () =>
      appContexts.map((context) => ({
        context: context.id,
        label: tNav(context.labelKey),
        entries: context.nav.map((item) => ({
          key: `${context.id}-${item.id}`,
          context: context.id,
          item,
          label: tNav(item.labelKey),
          available: item.status === "available",
        })),
      })),
    [tNav],
  );

  const normalized = query.trim().toLocaleLowerCase();
  const groups = useMemo(
    () =>
      allGroups
        .map((group) => ({
          ...group,
          entries: normalized ? group.entries.filter((entry) => matches(entry, group.label, normalized)) : group.entries,
        }))
        .filter((group) => group.entries.length > 0),
    [allGroups, normalized],
  );
  const flat = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const active =
    flat.find((entry) => entry.key === activeKey) ?? flat.find((entry) => entry.available) ?? flat[0];
  const optionId = (entry: PaletteEntry) => `${baseId}-${entry.key}`;
  const resultCount = flat.length;
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Nothing to say until something is typed; clearing the field goes quiet again.
    const text = normalized
      ? t("resultCount", { count: resultCount, formatted: formatNumber(resultCount, digits) })
      : "";
    const timer = window.setTimeout(() => setAnnouncement(text), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [normalized, resultCount, digits, t]);

  useEffect(() => {
    if (!active) return;
    // jsdom has no scrollIntoView; real browsers keep the active row visible.
    document.getElementById(`${baseId}-${active.key}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, baseId]);

  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry?.available) return;
    router.push(entry.item.href);
    onNavigate();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query !== "") {
      // Already kept from closing the dialog (see onEscapeKeyDown); clear here,
      // because SearchField skips its own clear for a prevented event.
      event.preventDefault();
      setQuery("");
      setActiveKey(null);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (flat.length === 0) return;
    const index = active ? flat.indexOf(active) : -1;
    const next = event.key === "ArrowDown" ? (index + 1) % flat.length : (index - 1 + flat.length) % flat.length;
    setActiveKey(flat[next]!.key);
  };

  const hasResults = flat.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SearchField
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          setActiveKey(null);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label={t("inputLabel")}
        aria-autocomplete="list"
        aria-expanded={hasResults}
        aria-controls={hasResults ? listboxId : undefined}
        aria-activedescendant={hasResults && active ? optionId(active) : undefined}
        placeholder={t("placeholder")}
        autoComplete="off"
        spellCheck={false}
        className="min-h-14"
      />

      {hasResults ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("results")}
          className="-mx-1 flex max-h-[min(26rem,55dvh)] flex-col gap-3 overflow-y-auto overscroll-contain px-1"
        >
          {groups.map((group) => (
            <div key={group.context} role="group" aria-labelledby={`${baseId}-${group.context}-label`} data-scope={group.context}>
              <div
                id={`${baseId}-${group.context}-label`}
                role="presentation"
                className="flex items-center gap-2 px-3 pt-1 pb-1.5 type-label text-fg-muted"
              >
                <span aria-hidden="true" className="size-2 rounded-full bg-scope-dot" />
                {group.label}
              </div>
              {group.entries.map((entry) => {
                const isActive = entry.key === active?.key;
                return (
                  <div
                    key={entry.key}
                    id={optionId(entry)}
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={entry.available ? undefined : true}
                    data-active={isActive ? "" : undefined}
                    // Keep focus in the search field while clicking.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActiveKey(entry.key)}
                    onClick={() => choose(entry)}
                    className={cn(
                      "flex min-h-touch items-center gap-3 rounded-row px-3 text-sm transition-colors",
                      entry.available ? "cursor-pointer font-semibold text-fg" : "cursor-not-allowed font-medium text-fg-muted",
                      isActive && (entry.available ? "bg-scope-soft text-scope-deep" : "bg-subtle"),
                    )}
                  >
                    <Icon
                      icon={entry.item.icon}
                      size={18}
                      className={cn("shrink-0", entry.available ? "text-scope-deep" : "text-icon-muted")}
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {entry.available ? (
                      <span className="shrink-0 text-xs font-medium text-fg-secondary">{group.label}</span>
                    ) : (
                      <ComingSoonBadge>{tCommon("comingSoon")}</ComingSoonBadge>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <NoResultsState query={query.trim()} variant="bare" live={false} />
      )}

      <p role="status" aria-live="polite" aria-atomic="true" data-slot="result-count" className="sr-only">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-1 pt-3">
        <p aria-hidden="true" className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-fg-muted">
          <span>{t("hintNavigate")}</span>
          <span>{t("hintOpen")}</span>
          <span>{t("hintClose")}</span>
        </p>
        <DialogClose asChild>
          <Button variant="ghost" size="sm">
            {tCommon("close")}
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}
