"use client";

import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { ToggleChip } from "@/components/ui/chip";
import { useAreas, useTasks } from "@/data/queries";
import type { TaskSort } from "@/data/domain";
import {
  ENERGIES,
  filterValues,
  PRIORITIES,
  SCOPES,
  setFilterFlag,
  toggleFilterValue,
  type ListFilterKind,
} from "../domain/filters";
import { LIST_GROUPS, type ListGroupMode } from "../domain/types";
import { TASK_SORTS } from "../domain/url-state";
import { useTasksState } from "../tasks-context";
import { useFilterChipText } from "../ui/use-filter-chip-text";

/*
 * The Filters panel (desktop popover, phone sheet): Area, Context, Priority,
 * Energy, Labels as toggle chips; Has date and Recurring as flags. The phone
 * sheet also carries Sort and Group (no toolbar buttons there).
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-bold text-fg-muted">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

export function FiltersPanel({ withViewOptions = false }: { withViewOptions?: boolean }) {
  const t = useTranslations("Tasks.filters");
  const tGroup = useTranslations("Tasks.group.options");
  const tSort = useTranslations("Tasks.sort.options");
  const text = useFilterChipText();
  const { filters, setFilters, today, sort, setSort, effectiveGroup, setGroup } = useTasksState();
  const { data: areas } = useAreas();
  const { data: all } = useTasks({ view: "all", day: today });
  const labels = useMemo(() => [...new Set((all ?? []).flatMap((task) => task.labels ?? []))].sort(), [all]);

  const chips = (kind: ListFilterKind, values: readonly string[]) => {
    const active = filterValues(filters, kind);
    return values.map((value) => (
      <ToggleChip
        key={value}
        size="sm"
        selected={active.includes(value)}
        onSelectedChange={() => setFilters((current) => toggleFilterValue(current, kind, value))}
      >
        <bdi dir="auto">{text.value(kind, value)}</bdi>
      </ToggleChip>
    ));
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title={text.kind("area")}>{chips("area", (areas ?? []).map((area) => area.id))}</Section>
      <Section title={text.kind("context")}>{chips("context", SCOPES)}</Section>
      <Section title={text.kind("priority")}>{chips("priority", PRIORITIES)}</Section>
      <Section title={text.kind("energy")}>{chips("energy", ENERGIES)}</Section>
      <Section title={text.kind("labels")}>
        {labels.length ? chips("labels", labels) : <span className="text-xs text-fg-muted">{t("noLabels")}</span>}
      </Section>
      <Section title={text.kind("hasDate")}>
        {(["yes", "no"] as const).map((value) => (
          <ToggleChip
            key={value}
            size="sm"
            selected={filters.hasDate === (value === "yes")}
            onSelectedChange={(on) => setFilters((current) => setFilterFlag(current, "hasDate", on ? value === "yes" : undefined))}
          >
            {text.value("hasDate", value)}
          </ToggleChip>
        ))}
      </Section>
      <Section title={text.kind("recurring")}>
        <ToggleChip
          size="sm"
          selected={Boolean(filters.recurring)}
          onSelectedChange={(on) => setFilters((current) => setFilterFlag(current, "recurring", on ? true : undefined))}
        >
          {text.value("recurring", "yes")}
        </ToggleChip>
      </Section>
      {withViewOptions ? (
        <>
          <Section title={t("sort")}>
            {TASK_SORTS.map((value: TaskSort) => (
              <ToggleChip key={value} size="sm" selected={sort === value} onSelectedChange={() => setSort(value)}>
                {tSort(value)}
              </ToggleChip>
            ))}
          </Section>
          <Section title={t("group")}>
            {LIST_GROUPS.map((value: ListGroupMode) => (
              <ToggleChip key={value} size="sm" selected={effectiveGroup === value} onSelectedChange={() => setGroup(value)}>
                {tGroup(value)}
              </ToggleChip>
            ))}
          </Section>
        </>
      ) : null}
    </div>
  );
}
