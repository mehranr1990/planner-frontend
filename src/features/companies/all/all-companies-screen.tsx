"use client";

import { Building2, Ellipsis, LayoutDashboard, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { toast } from "@/components/ui/toast";
import type { CompanyInvitation, CompanySummary } from "@/data/company-domain";
import {
  useAcceptCompanyInvitation,
  useCompanyDirectory,
  useCompanyInvitations,
  useDeclineCompanyInvitation,
} from "@/data/company-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { companyHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { ProjectTile } from "@/features/projects/project-visuals";
import { cn } from "@/lib/cn";
import { useCompanyLabels } from "../labels";
import { useOpenCompanySheet } from "../sheets/company-sheet-params";

/*
 * CO-00 · All companies (/companies): pick the company. Pills All · Admin ·
 * Member · Invitations · Archived; invitation strip (public-safe preview,
 * Accept creates a work profile only); product cards with initials, role
 * (+ department), people, departments and approvals waiting for me. No
 * quota or upsell. Archived = read-only (Owner can restore inside); left
 * companies are not listed. Empty: create one or accept an invitation.
 */

type Filter = "all" | "admin" | "member" | "invitations" | "archived";

const ADMINISH = new Set(["owner", "admin"]);

export function AllCompaniesScreen() {
  const t = useTranslations("Company");
  const tAll = useTranslations("Company.all");
  const directory = useCompanyDirectory();
  const invitations = useCompanyInvitations();
  const openSheet = useOpenCompanySheet();
  const [filter, setFilter] = useState<Filter>("all");

  const header = (
    <PageHeader
      breadcrumb={<Breadcrumbs scope="company" items={[{ label: t("breadcrumb") }]} />}
      title={t("title")}
      size="display"
      actions={
        <Button className="gap-2" onClick={() => openSheet("company-new")}>
          <Icon icon={Plus} size={16} />
          {t("new")}
        </Button>
      }
    />
  );

  if (directory.isError) {
    return (
      <div data-scope="company" className="flex flex-col gap-4">
        {header}
        <ErrorState onRetry={() => void directory.refetch()} />
      </div>
    );
  }
  if (!directory.data) {
    return (
      <div data-scope="company" className="flex flex-col gap-4">
        {header}
        <AccessLoading />
      </div>
    );
  }

  const companies = directory.data.companies;
  const live = companies.filter((company) => company.lifecycle === "active");
  const archived = companies.filter((company) => company.lifecycle === "archived");
  const invites = invitations.data ?? [];
  const counts: Record<Filter, number> = {
    all: live.length,
    admin: live.filter((company) => ADMINISH.has(company.role)).length,
    member: live.filter((company) => !ADMINISH.has(company.role)).length,
    invitations: invites.length,
    archived: archived.length,
  };
  const shown =
    filter === "archived"
      ? archived
      : filter === "admin"
        ? live.filter((company) => ADMINISH.has(company.role))
        : filter === "member"
          ? live.filter((company) => !ADMINISH.has(company.role))
          : filter === "invitations"
            ? []
            : live;
  const nothing = companies.length === 0 && invites.length === 0;

  return (
    <div data-scope="company" className="flex flex-col gap-4">
      {header}
      {nothing ? (
        <EmptyState
          icon={LayoutDashboard}
          title={tAll("empty.title")}
          description={tAll("empty.body")}
          primaryAction={<Button onClick={() => openSheet("company-new")}>{t("new")}</Button>}
        />
      ) : (
        <>
          <PillGroup<Filter>
            label={tAll("filter")}
            value={filter}
            onValueChange={setFilter}
            options={(["all", "admin", "member", "invitations", "archived"] as const).map((value) => ({
              value,
              label: tAll(`pills.${value}`),
              count: counts[value] > 0 ? counts[value] : undefined,
            }))}
          />
          {filter === "all" || filter === "invitations"
            ? invites.map((invitation) => <InvitationStrip key={invitation.id} invitation={invitation} />)
            : null}
          {filter === "archived" ? <p className="px-1 text-sm text-fg-secondary">{tAll("archivedNote")}</p> : null}
          {shown.length > 0 ? (
            <ul aria-label={t("title")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </ul>
          ) : filter !== "invitations" ? (
            <EmptyState icon={Building2} title={tAll("noneHere")} description={tAll("leftNote")} />
          ) : invites.length === 0 ? (
            <EmptyState icon={Building2} title={tAll("noInvitations")} />
          ) : null}
        </>
      )}
    </div>
  );
}

function CompanyCard({ company }: { company: CompanySummary }) {
  const t = useTranslations("Company");
  const tAll = useTranslations("Company.all");
  const labels = useCompanyLabels();
  const format = useProjectFormat();
  const href = companyHref(company.id);
  const archived = company.lifecycle === "archived";
  const titleId = `company-${company.id}`;
  return (
    <li>
      <ProductCard as="article" aria-labelledby={titleId} className={cn("relative h-full gap-4", archived && "opacity-80")}>
        <div className="flex items-start gap-3">
          <ProjectTile initials={company.initials} tint={company.tint} size="md" muted={archived} />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={titleId} className="type-title text-fg">
              {/* The whole card opens the company; the menu stays its own control. */}
              <Link href={href} className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none">
                <bdi>{company.name}</bdi>
              </Link>
            </h2>
            <p className="text-xs font-semibold text-fg-secondary">
              {labels.role(company.role)}
              {company.departmentName ? <> · <bdi>{company.departmentName}</bdi></> : null}
            </p>
          </div>
          <CardMenu company={company} />
        </div>
        <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <li className="rounded-pill bg-subtle px-3 py-1.5 text-fg-secondary">{t("peopleCount", { n: format.number(company.people) })}</li>
          <li className="rounded-pill bg-subtle px-3 py-1.5 text-fg-secondary">
            {tAll("departments", { n: format.number(company.departments) })}
          </li>
          {company.approvalsForMe > 0 ? (
            <li className="rounded-pill bg-scope-soft px-3 py-1.5 text-scope-deep">
              {tAll("approvals", { n: format.number(company.approvalsForMe) })}
            </li>
          ) : null}
          {archived ? <li className="rounded-pill bg-raised px-3 py-1.5 text-fg-secondary">{t("switcher.readOnly")}</li> : null}
        </ul>
        <p className="text-xs text-fg-muted">{tAll("updated", { when: format.relative(company.updatedAt) })}</p>
      </ProductCard>
    </li>
  );
}

function CardMenu({ company }: { company: CompanySummary }) {
  const tAll = useTranslations("Company.all");
  const router = useRouter();
  const href = companyHref(company.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Ellipsis} size="sm" variant="ghost" label={tAll("menu", { company: company.name })} className="relative z-10" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => router.push(href)}>{tAll("open")}</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard?.writeText(new URL(href, window.location.origin).toString());
            toast({ title: tAll("copied") });
          }}
        >
          <Icon icon={Link2} size={16} />
          {tAll("copyLink")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InvitationStrip({ invitation }: { invitation: CompanyInvitation }) {
  const tAll = useTranslations("Company.all");
  const tStates = useTranslations("Access.states.companyInvite");
  const labels = useCompanyLabels();
  const router = useRouter();
  const accept = useAcceptCompanyInvitation();
  const decline = useDeclineCompanyInvitation();
  const busy = accept.isPending || decline.isPending;
  const title = tAll("invite.title", {
    company: invitation.companyName,
    role: labels.role(invitation.role),
    department: invitation.departmentName ? ` · ${invitation.departmentName}` : "",
  });
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-card-sm bg-scope-soft px-4 py-3 text-scope-deep sm:flex-row sm:items-center"
    >
      <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface">
        <Icon icon={LayoutDashboard} size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-bold text-fg">{title}</p>
        <p className="text-xs font-semibold">{tAll("invite.body", { company: invitation.companyName })}</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          className="bg-surface"
          onClick={() => decline.mutate(invitation.id, { onSuccess: () => toast({ title: tAll("invite.declined") }) })}
        >
          {tStates("decline")}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            accept.mutate(invitation.id, {
              onSuccess: ({ companyId }) => router.push(companyHref(companyId)),
            })
          }
        >
          {tStates("accept")}
        </Button>
      </div>
    </section>
  );
}
