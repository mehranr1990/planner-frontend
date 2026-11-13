"use client";

import { Check, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { CompanyDirectory, CompanyInvitation, CompanySummary } from "@/data/company-domain";
import { useProjectFormat } from "@/features/projects/format";
import { ProjectTile } from "@/features/projects/project-visuals";
import { cn } from "@/lib/cn";
import { useCompanyLabels } from "../labels";

/*
 * The Companies workspace list inside the context switcher (CS-01): Your
 * companies (role + department · people) · Invitations (public-safe
 * preview: company, role, department) · Archived · All companies · New
 * company. Each company is its own custody boundary: no cross-company
 * search or counts. Choosing one goes to /companies/[id].
 */
export interface CompanySwitcherListProps {
  directory: CompanyDirectory | undefined;
  invitations: readonly CompanyInvitation[];
  activeCompanyId?: string;
  onOpen: (companyId: string) => void;
  onAll: () => void;
  onNew: () => void;
}

export function CompanySwitcherList({ directory, invitations, activeCompanyId, onOpen, onAll, onNew }: CompanySwitcherListProps) {
  const t = useTranslations("Company");
  const labels = useCompanyLabels();
  const format = useProjectFormat();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const needle = query.trim().toLocaleLowerCase();
  const matches = (name: string) => needle === "" || name.toLocaleLowerCase().includes(needle);
  const companies = (directory?.companies ?? []).filter((company) => matches(company.name));
  const recentIds = directory?.recentIds ?? [];
  const live = companies.filter((company) => company.lifecycle === "active");
  const yours = [
    ...recentIds.map((id) => live.find((company) => company.id === id)).filter((company) => company !== undefined),
    ...live.filter((company) => !recentIds.includes(company.id)),
  ];
  const archived = companies.filter((company) => company.lifecycle === "archived");
  const invites = invitations.filter((invitation) => matches(invitation.companyName));

  const line = (company: CompanySummary) =>
    t("switcher.line", {
      role: labels.role(company.role),
      department: company.departmentName ? ` · ${company.departmentName}` : "",
      people: t("peopleCount", { n: format.number(company.people) }),
    });

  const row = (company: CompanySummary, tag?: string) => {
    const selected = company.id === activeCompanyId;
    return (
      <button
        key={company.id}
        type="button"
        data-switcher-row=""
        aria-current={selected ? "true" : undefined}
        onClick={() => onOpen(company.id)}
        className={cn(
          "flex min-h-touch items-center gap-2.5 rounded-row px-2 py-1.5 text-start transition-colors",
          selected ? "bg-scope-soft text-scope-deep" : "text-fg hover:bg-raised",
        )}
      >
        <ProjectTile initials={company.initials} tint={company.tint} size="sm" muted={company.lifecycle === "archived"} />
        <span className="flex min-w-0 flex-1 flex-col leading-snug">
          <bdi className={cn("truncate text-sm", selected ? "font-bold" : "font-semibold")}>{company.name}</bdi>
          <span className="truncate text-xs font-medium text-fg-secondary">{line(company)}</span>
        </span>
        {tag ? (
          <span className="shrink-0 rounded-pill bg-raised px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-secondary">{tag}</span>
        ) : null}
        {selected ? <Icon icon={Check} size={16} className="shrink-0" /> : null}
      </button>
    );
  };

  const section = (key: string, title: string, children: ReactNode[], count?: number) =>
    children.length > 0 ? (
      <div key={key} role="group" aria-label={title} className="flex flex-col gap-0.5 pt-2">
        <p aria-hidden="true" className="px-2 pb-0.5 text-[0.6875rem] font-bold tracking-wide text-fg-muted uppercase">
          {count === undefined ? title : `${title} · ${format.number(count)}`}
        </p>
        {children}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={searchId} className="sr-only">
        {t("switcher.find")}
      </label>
      <div className="flex h-10 items-center gap-2 rounded-pill bg-surface px-3 text-fg-secondary">
        <Icon icon={Search} size={16} className="shrink-0" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Home" || event.key === "End") event.stopPropagation();
          }}
          placeholder={t("switcher.find")}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {section("yours", t("switcher.yours"), yours.map((company) => row(company)), yours.length)}
      {section(
        "invitations",
        t("switcher.invitations"),
        invites.map((invitation) => (
          <button
            key={invitation.id}
            type="button"
            data-switcher-row=""
            onClick={() => onOpen(invitation.companyId)}
            className="flex min-h-touch items-center gap-2.5 rounded-row px-2 py-1.5 text-start text-fg transition-colors hover:bg-raised"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-tile bg-raised text-xs font-bold text-fg-secondary"
            >
              <bdi>{invitation.initials}</bdi>
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-snug">
              <bdi className="truncate text-sm font-semibold">{invitation.companyName}</bdi>
              <span className="truncate text-xs font-medium text-fg-secondary">
                {t("switcher.invitedAs", {
                  role: labels.role(invitation.role),
                  department: invitation.departmentName ? ` · ${invitation.departmentName}` : "",
                })}
              </span>
            </span>
            <span className="shrink-0 rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">{t("switcher.review")}</span>
          </button>
        )),
        invites.length,
      )}
      {section("archived", t("switcher.archived"), archived.map((company) => row(company, t("switcher.readOnly"))))}
      {yours.length + invites.length + archived.length === 0 ? (
        <p className="px-2 py-3 text-sm text-fg-muted">{t("switcher.noMatch")}</p>
      ) : null}
      <div className="mt-1 grid grid-cols-2 gap-2 border-t border-line pt-2">
        <button
          type="button"
          data-switcher-row=""
          onClick={onAll}
          className="flex min-h-10 items-center justify-center rounded-pill px-3 text-sm font-bold text-fg inset-ring-[1.5px] inset-ring-outline transition-colors hover:bg-raised"
        >
          {t("switcher.all")}
        </button>
        <button
          type="button"
          data-switcher-row=""
          aria-haspopup="dialog"
          onClick={onNew}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-pill bg-primary px-3 text-sm font-bold text-on-accent transition-colors hover:bg-primary-hover"
        >
          <Icon icon={Plus} size={16} className="shrink-0" />
          {t("new")}
        </button>
      </div>
    </div>
  );
}
