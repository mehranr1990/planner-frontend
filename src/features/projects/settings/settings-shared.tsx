"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { RepositoryError } from "@/data/repositories";
import { cn } from "@/lib/cn";

/*
 * Shared bits of PJ-14 Settings: the dirty-state registry (General and
 * Fields report unsaved changes; switching tabs or leaving the page asks
 * first), the sticky "Unsaved changes · Discard · Save" bar, setting rows.
 */

export interface DirtyRegistry {
  setDirty(dirty: boolean): void;
}

export const DirtyContext = createContext<DirtyRegistry>({ setDirty: () => {} });

/** Report this tab's unsaved state; the browser asks before unloading while dirty. */
export function useReportDirty(dirty: boolean) {
  const { setDirty } = useContext(DirtyContext);
  useEffect(() => {
    setDirty(dirty);
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      setDirty(false);
    };
  }, [dirty, setDirty]);
}

export function DirtyBar({
  onDiscard,
  onSave,
  saving,
  saveDisabled,
}: {
  onDiscard: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
}) {
  const t = useTranslations("ProjectSettings.dirty");
  return (
    <div
      role="region"
      aria-label={t("label")}
      className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-pill bg-elevated px-5 py-2.5 shadow-island"
    >
      <span className="text-sm font-bold text-fg">{t("label")}</span>
      <span className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onDiscard}>
          {t("discard")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || saveDisabled}>
          {t("save")}
        </Button>
      </span>
    </div>
  );
}

export function SettingRow({
  title,
  hint,
  children,
  danger,
}: {
  title: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-subtle px-4 py-3.5",
        danger && "bg-surface inset-ring-[1.5px] inset-ring-danger-soft",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cn("text-sm font-bold", danger ? "text-danger-text" : "text-fg")}>{title}</span>
        {hint ? <span className="text-xs font-medium text-fg-secondary">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function useSettingsError() {
  const t = useTranslations("ProjectSettings");
  const tConflict = useTranslations("Access.states.conflict");
  return (error: unknown) =>
    toast({
      tone: "danger",
      title: error instanceof RepositoryError && error.code === "conflict" ? tConflict("title") : t("error"),
    });
}

/** Saves a text file the browser downloads (error report, mock exports). */
export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob(["﻿", text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
