"use client";

import { ArrowDownUp, Columns3, List, ListFilter, Plus, Rows3, Search, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type Ref } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { RemovableChip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { TaskSort } from "@/data/domain";
import { TASK_CREATE_HREF } from "@/features/personal/routes";
import { activeFilterCount, filterChips, removeFilter } from "../domain/filters";
import { LIST_GROUPS, TASKS_TABS, isListGroup, type ListGroupMode, type TasksLayout, type TasksTab } from "../domain/types";
import { TASK_SORTS } from "../domain/url-state";
import { useTasksState } from "../tasks-context";
import { useTodayProgress } from "../use-today-progress";
import { useFilterChipText } from "../ui/use-filter-chip-text";
import { useTasksFormat } from "../ui/use-tasks-format";
import { useList } from "../list/list-context";
import { FiltersPanel } from "./filters-panel";

/*
 * The top of the Tasks screen. Desktop (lg+): kicker, h1, progress pill,
 * List | Board, New task; then the toolbar capsule (view tabs with counts,
 * search with "/", Filters popover, Group and Sort menus) and the active
 * filter chips with the bulk hint. Phone (PM01): kicker "2 of 9 done", h1,
 * search and Board icon buttons, the view pills, a search row with the
 * Filters sheet button. Breakpoints are CSS so the server renders both.
 */

export function TasksHeader() {
  const t = useTranslations("Tasks.page");
  const tToolbar = useTranslations("Tasks.toolbar");
  const tPersonal = useTranslations("Personal");
  const format = useTasksFormat();
  const progress = useTodayProgress();
  const { today, layout, setLayout } = useTasksState();
  const [searchOpen, setSearchOpen] = useState(false);

  const counts = progress ? { done: format.number(progress.done), total: format.number(progress.total) } : null;

  return (
    <>
      <header className="flex min-w-0 flex-wrap items-end gap-2.5 lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[11px] font-semibold text-fg-muted lg:hidden">{counts ? t("progressShort", counts) : " "}</p>
          <p className="hidden text-xs font-bold text-fg-muted lg:block">
            {tPersonal("eyebrow", { date: format.dayMonth(today) })}
          </p>
          <h1 className="type-h1 text-fg lg:type-display">{t("title")}</h1>
        </div>
        <div className="hidden flex-wrap items-center gap-2 lg:flex">
          {progress && counts ? (
            <span className="inline-flex min-h-13 items-center rounded-pill bg-surface px-4 text-xs font-bold text-fg-secondary">
              {t("progress", { ...counts, left: format.durationShort(progress.minutesLeft) })}
            </span>
          ) : null}
          <Segmented<TasksLayout>
            label={t("layout")}
            value={layout}
            onValueChange={setLayout}
            size="sm"
            className="min-h-13 bg-surface"
            options={[
              { value: "list", label: <span className="inline-flex items-center gap-1.5"><List aria-hidden="true" size={15} />{t("list")}</span> },
              { value: "board", label: <span className="inline-flex items-center gap-1.5"><Columns3 aria-hidden="true" size={15} />{t("board")}</span> },
            ]}
          />
          <Button asChild size="lg" className="text-[15px] font-bold">
            <Link href={TASK_CREATE_HREF}>
              <Plus aria-hidden="true" size={16} strokeWidth={2.2} />
              {t("newTask")}
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <IconButton
            icon={searchOpen ? X : Search}
            label={searchOpen ? tToolbar("closeSearch") : tToolbar("openSearch")}
            aria-expanded={searchOpen}
            variant="secondary"
            className="bg-surface"
            onClick={() => setSearchOpen((open) => !open)}
          />
          <IconButton icon={Columns3} label={tToolbar("showBoard")} variant="secondary" className="bg-surface" onClick={() => setLayout("board")} />
        </div>
      </header>
      {searchOpen ? <MobileSearchRow /> : null}
    </>
  );
}

function useTabOptions(mobile: boolean) {
  const t = useTranslations("Tasks.toolbar");
  const format = useTasksFormat();
  const { tab } = useTasksState();
  const { data } = useList();
  return TASKS_TABS.map((value) => {
    const count = value === "completed" ? undefined : data.counts?.[value];
    const label = mobile && value === "completed" ? t("mobileDone") : t(`tabs.${value}`);
    // Phones show the count on the active pill only (PM01).
    const showCount = count !== undefined && (!mobile || value === tab);
    return { value, label, count: showCount ? format.number(count) : undefined };
  });
}

export function TasksToolbar({ searchRef }: { searchRef: Ref<HTMLInputElement> }) {
  const t = useTranslations("Tasks.toolbar");
  const tGroup = useTranslations("Tasks.group.options");
  const tSort = useTranslations("Tasks.sort.options");
  const tKeys = useTranslations("Tasks.keyboard");
  const { tab, setTab, q, setQ, sort, setSort, effectiveGroup, setGroup } = useTasksState();
  const desktopTabs = useTabOptions(false);
  const mobileTabs = useTabOptions(true);
  const group: ListGroupMode = isListGroup(effectiveGroup) ? effectiveGroup : "time";

  return (
    <>
      <div className="hidden min-w-0 flex-wrap items-center gap-2.5 rounded-pill bg-surface p-2.5 lg:flex">
        <Segmented<TasksTab>
          label={t("views")}
          value={tab}
          onValueChange={setTab}
          variant="neutral"
          size="sm"
          className="bg-canvas"
          options={desktopTabs.map((option) => ({
            value: option.value,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {option.label}
                {option.count !== undefined ? <b className="font-bold text-fg-muted tabular">{option.count}</b> : null}
              </span>
            ),
          }))}
        />
        <SearchField
          ref={searchRef}
          value={q}
          onValueChange={setQ}
          placeholder={t("search")}
          aria-label={t("search")}
          shortcut={tKeys("search")}
          className="min-w-[200px] flex-1"
        />
        <FiltersPopover />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-9 gap-1.5 px-3.5 text-[13px] font-bold">
              <Rows3 aria-hidden="true" size={15} />
              {t("group", { value: tGroup(group) })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label={t("groupLabel")}>
            <DropdownMenuRadioGroup value={group} onValueChange={(value) => setGroup(value as ListGroupMode)}>
              {LIST_GROUPS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {tGroup(value)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-9 gap-1.5 px-3.5 text-[13px] font-bold">
              <ArrowDownUp aria-hidden="true" size={15} />
              {t("sort", { value: tSort(sort) })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label={t("sortLabel")}>
            <DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as TaskSort)}>
              {TASK_SORTS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {tSort(value)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 lg:hidden">
        <PillGroup<TasksTab>
          label={t("views")}
          value={tab}
          onValueChange={setTab}
          className="flex-nowrap"
          options={mobileTabs}
        />
      </div>
      <ActiveFilters />
    </>
  );
}

function MobileSearchRow() {
  const t = useTranslations("Tasks.toolbar");
  const tFilters = useTranslations("Tasks.filters");
  const format = useTasksFormat();
  const { q, setQ, filters, clearFilters } = useTasksState();
  const { data } = useList();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  const shown = data.tasks.length;
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <SearchField value={q} onValueChange={setQ} placeholder={t("search")} aria-label={t("search")} autoFocus className="min-w-0 flex-1" />
      <Sheet open={open} onOpenChange={setOpen}>
        <Button variant="outline" size="sm" className="gap-1.5 bg-surface" onClick={() => setOpen(true)}>
          <ListFilter aria-hidden="true" size={15} />
          {t("filters")}
          {count ? <span className="rounded-pill bg-personal-soft px-[7px] text-xs text-personal-deep">{format.number(count)}</span> : null}
        </Button>
        <SheetContent
          side="bottom"
          title={tFilters("title")}
          footer={
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={clearFilters}>
                {tFilters("clear")}
              </Button>
              <Button className="flex-1" onClick={() => setOpen(false)}>
                {tFilters("show", { count: shown, n: format.number(shown) })}
              </Button>
            </div>
          }
        >
          <FiltersPanel withViewOptions />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The desktop Filters button and its popover (List and Board share it). */
export function FiltersPopover() {
  const t = useTranslations("Tasks.toolbar");
  const tFilters = useTranslations("Tasks.filters");
  const { filters } = useTasksState();
  const filterCount = activeFilterCount(filters);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-9 gap-1.5 px-3.5 text-[13px] font-bold" aria-label={filterCount ? t("filtersActive", { count: filterCount }) : t("filters")}>
          <ListFilter aria-hidden="true" size={15} />
          {t("filters")}
          {filterCount ? (
            <span className="inline-flex min-h-5 items-center rounded-pill bg-personal-soft px-[7px] text-xs text-personal-deep tabular">
              {filterCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-4" aria-label={tFilters("title")}>
        <FiltersPanel />
      </PopoverContent>
    </Popover>
  );
}

export function ActiveFilters() {
  const t = useTranslations("Tasks.toolbar");
  const text = useFilterChipText();
  const { filters, setFilters, clearFilters } = useTasksState();
  const chips = filterChips(filters);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 max-lg:empty:hidden">
      {chips.length ? (
        <>
          <span className="text-xs font-semibold text-fg-muted">{t("filteredBy")}</span>
          {chips.map((chip) => (
            <RemovableChip
              key={chip.kind}
              size="sm"
              label={text.chip(chip)}
              onRemove={() => setFilters((current) => removeFilter(current, chip.kind))}
              className="bg-personal-soft text-xs font-bold text-personal-deep"
            />
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="rounded text-xs font-semibold text-fg underline underline-offset-2 focus-visible:focus-ring"
          >
            {t("clearAll")}
          </button>
        </>
      ) : null}
      <span className="ms-auto hidden text-xs font-semibold text-fg-muted lg:block">{t("bulkHint")}</span>
    </div>
  );
}
