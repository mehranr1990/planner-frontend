"use client";

import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { useDepartments } from "@/data/company-queries";
import { cn } from "@/lib/cn";
import { useCompany } from "./company-gate";

/*
 * Department scope (CS-01 C3): header chip "All departments ▾". Desktop: a
 * popover list; phones: the department sheet. Options are only departments
 * the viewer may already see (Owner / Org Admin: every department; others:
 * their own) — the scope narrows, it never widens access.
 */
export function useScopeOptions() {
  const { company, capabilities, myDepartmentIds } = useCompany();
  const departments = useDepartments(company.id);
  return (departments.data ?? []).filter(
    (dept) => capabilities.allDepartments || myDepartmentIds.includes(dept.id) || capabilities.managedDepartmentIds.includes(dept.id),
  );
}

export function DepartmentScopeChip({ className }: { className?: string }) {
  const t = useTranslations("Company.scope");
  const { departmentId, setDepartmentId } = useCompany();
  const options = useScopeOptions();
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const current = options.find((dept) => dept.id === departmentId);
  const label = current?.name ?? t("all");

  const list = (
    <ul role="listbox" aria-label={t("label")} className="flex flex-col gap-1.5">
      {[null, ...options.map((dept) => dept.id)].map((id) => {
        const dept = options.find((item) => item.id === id);
        const selected = (id ?? null) === departmentId;
        return (
          <li key={id ?? "all"} role="option" aria-selected={selected}>
            <button
              type="button"
              onClick={() => {
                setDepartmentId(id);
                setOpen(false);
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-row px-3 text-start text-sm font-semibold transition-colors",
                selected ? "bg-scope-soft text-scope-deep inset-ring-[1.5px] inset-ring-scope-deep" : "bg-subtle text-fg hover:bg-raised",
                dept?.parentId ? "ps-6" : null,
              )}
            >
              <bdi className="min-w-0 flex-1 truncate">{dept?.name ?? t("all")}</bdi>
              {selected ? <Icon icon={Check} size={16} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const trigger = (
    <button
      type="button"
      aria-haspopup={desktop ? "listbox" : "dialog"}
      aria-expanded={open}
      aria-label={`${t("label")}: ${label}`}
      onClick={desktop ? undefined : () => setOpen(true)}
      className={cn(
        "inline-flex h-10 max-w-60 items-center gap-1.5 rounded-pill bg-scope-soft px-4 text-sm font-bold text-scope-deep transition-colors hover:brightness-95",
        className,
      )}
    >
      <bdi className="truncate">{label}</bdi>
      <Icon icon={ChevronDown} size={16} className="shrink-0" />
    </button>
  );

  if (!desktop) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" title={t("title")} description={t("hint")} data-scope="company">
            {list}
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72" data-scope="company">
        <p className="px-1 pb-2 text-xs text-fg-secondary">{t("hint")}</p>
        {list}
      </PopoverContent>
    </Popover>
  );
}
