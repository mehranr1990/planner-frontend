"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { isLiveApi } from "@/api/runtime";
import { projectDemoStates, type ProjectDemoState } from "./demo-state";

/*
 * Mock-mode demo-state switch (SH-02 Rules "Mocking"): a quiet select at the
 * foot of every project page that sets `?state=` so reviewers can reach each
 * access/page state. Never rendered in live API mode. State ids are
 * developer-facing and stay untranslated.
 */
export function DemoStateSwitch({ value }: { value: ProjectDemoState | null }) {
  const t = useTranslations("Access.demo");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const id = useId();
  if (isLiveApi()) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pt-6 text-xs text-fg-muted">
      <label htmlFor={id} className="font-semibold">
        {t("label")}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => {
          const params = new URLSearchParams(search.toString());
          if (event.target.value) params.set("state", event.target.value);
          else params.delete("state");
          const query = params.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, {
            scroll: false,
          });
        }}
        className="h-8 rounded-pill border border-line bg-surface px-3 text-xs text-fg"
      >
        <option value="">{t("none")}</option>
        {projectDemoStates.map((state) => (
          <option key={state} value={state}>
            {state}
          </option>
        ))}
      </select>
      <span>{t("hint")}</span>
    </div>
  );
}
