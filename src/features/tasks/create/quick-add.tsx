"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PillGroup } from "@/components/ui/pills";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import { useAreas, useCreateTask, useRemoveTasks } from "@/data/queries";
import { moduleForSheet, personalModuleHref } from "@/features/planner-settings/modules";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { consumeOpenedSheet, QUICK_ADD_TEXT_PARAM, sheetHref, type SheetId } from "@/features/sheets/sheet-params";
import { quickParse } from "../domain/quick-parse";
import { Kbd } from "../list/task-parts";
import { useTasksFormat } from "../ui/use-tasks-format";
import { taskCreateHref } from "./create-draft";
import { dayLabel, ParsedChips } from "./parsed-chips";

/*
 * Universal Quick Add (P18 · H, PM01 centre +): one line, parsed live, Enter
 * saves to the chosen type. Task (default) creates through the data seam;
 * without a date it lands on Today's Unscheduled list. Details (Ctrl+Enter)
 * escalates to the full Task Create page with the parsed values. Event and
 * Inbox continue in their screens, Note and Expense in their sheets (Expense
 * only while Finance is visible).
 */

type QuickAddType = "task" | "event" | "note" | "expense" | "inbox";

const TYPES: readonly { id: QuickAddType; sheet?: SheetId }[] = [
  { id: "task" },
  { id: "event" },
  { id: "note", sheet: "note" },
  { id: "expense", sheet: "expense" },
  { id: "inbox" },
];

export function QuickAdd({ onClose, initialText = "" }: { onClose(): void; /** Prefilled line (Voice capture → Create task). */ initialText?: string }) {
  const t = useTranslations("Tasks.quickAdd");
  const tUndo = useTranslations("Tasks.undo");
  const tCreate = useTranslations("Tasks.create");
  const router = useRouter();
  const pathname = usePathname();
  const settings = usePlannerSettings();
  const format = useTasksFormat();
  const { data: areas } = useAreas();
  const create = useCreateTask();
  const remove = useRemoveTasks();
  const today = getPlannerToday();
  const [value, setValue] = useState(initialText);
  const [type, setType] = useState<QuickAddType>("task");
  const [error, setError] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const parsed = useMemo(() => quickParse(value, today, { areas }), [value, today, areas]);
  const types = TYPES.filter(({ sheet }) => {
    const owner = sheet ? moduleForSheet(sheet) : null;
    return owner === null || isModuleVisible(settings, owner);
  });
  const current = types.find((option) => option.id === type) ?? types[0]!;

  /** Where creation started: the page under the sheet. */
  const origin = () => sheetHref(pathname, window.location.search, null);

  const details = () => {
    // Replace the sheet's history entry: Back from Task Create returns to the page, not the sheet.
    consumeOpenedSheet();
    router.replace(
      taskCreateHref(
        {
          title: parsed.title,
          date: parsed.date ?? (parsed.time ? today : null),
          time: parsed.time ?? null,
          durationMinutes: parsed.durationMinutes ?? null,
          priority: parsed.priority ?? null,
          areaId: parsed.area?.id ?? null,
        },
        origin(),
      ),
    );
  };

  const saveTask = () => {
    const title = parsed.title.trim();
    if (!title) {
      setError(true);
      return;
    }
    // No date → Today's Unscheduled (P18 · H).
    const date = parsed.date ?? today;
    create.mutate(
      {
        title,
        date,
        time: parsed.time ?? null,
        priority: parsed.priority ?? null,
        durationMinutes: parsed.durationMinutes ?? settings.planning.defaultDurationMinutes,
        energy: settings.planning.defaultEnergy,
        area: parsed.area ?? null,
      },
      {
        onSuccess: (task) => {
          const when = [dayLabel(format, date, today), parsed.time ? format.clock(parsed.time) : null].filter(Boolean).join(" · ");
          toast({
            tone: "success",
            title: t("created", { when }),
            description: <bdi>{task.title}</bdi>,
            action: {
              label: tUndo("action"),
              altText: t("undoAlt"),
              onClick: () =>
                remove.mutate({ ids: [task.id] }, { onSuccess: () => toast({ tone: "neutral", title: t("removed") }) }),
            },
          });
          onClose();
        },
        onError: () => toast({ tone: "danger", title: tCreate("failed") }),
      },
    );
  };

  const save = () => {
    if (current.id === "task") return saveTask();
    if (current.sheet) {
      // The line rides along (?text=): Add expense parses "250k lunch #food".
      const search = new URLSearchParams(window.location.search);
      if (current.sheet === "expense" && value.trim()) search.set(QUICK_ADD_TEXT_PARAM, value.trim());
      else search.delete(QUICK_ADD_TEXT_PARAM);
      router.replace(sheetHref(pathname, search.toString(), current.sheet), { scroll: false });
      return;
    }
    consumeOpenedSheet();
    router.replace(personalModuleHref(current.id === "event" ? "calendar" : "inbox"));
  };

  return (
    <div data-quick-add="" className="flex flex-col gap-4">
      <div className="flex min-h-14 items-center gap-3 rounded-field bg-subtle px-4 focus-within:focus-ring">
        <Plus aria-hidden="true" size={18} className="shrink-0 text-fg-muted" />
        <input
          id={inputId}
          // The sheet opens to type: focus lands here, not on the close button.
          autoFocus
          value={value}
          dir="auto"
          aria-label={t("inputLabel")}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error || undefined}
          placeholder={t("placeholder")}
          onChange={(event) => {
            setValue(event.target.value);
            setError(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) details();
            else save();
          }}
          className="min-w-0 flex-1 bg-transparent text-body font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-muted"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="-mt-2 text-sm text-danger-text">
          {t("titleRequired")}
        </p>
      )}

      {current.id === "task" && (
        <ParsedChips parsed={parsed} today={today} fallback={value.trim() ? t("todayUnscheduled") : undefined} />
      )}

      <PillGroup
        label={t("typeLabel")}
        value={current.id}
        onValueChange={setType}
        options={types.map(({ id }) => ({ value: id, label: t(`types.${id}`) }))}
      />
      {current.id !== "task" && <p className="text-sm text-fg-secondary">{t(`later.${current.id}`)}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <p id={hintId} className="me-auto flex items-center gap-1.5 text-xs text-fg-muted max-lg:hidden">
          <Kbd>↵</Kbd> {t("hint")}
        </p>
        {current.id === "task" && (
          <Button variant="outline" onClick={details}>
            {t("details")}
          </Button>
        )}
        <Button onClick={save} loading={create.isPending}>
          {current.id === "task" ? t("save") : t(`open.${current.id}`)}
        </Button>
      </div>
    </div>
  );
}
