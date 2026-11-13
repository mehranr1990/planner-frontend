"use client";

import { Calendar, CookingPot, Dumbbell, Gamepad2, Hammer, BookOpen, Mountain, Package, PartyPopper, Plane, Receipt, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState, UnavailableState } from "@/components/feedback/state-views";
import { SocialError } from "@/data/social-repositories";
import { PresenceDot } from "@/components/context/presence-dot";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar, type AvatarSize } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import type { ActivityTemplate, ExpenseStatus, GroupStatus, Rsvp, SocialPerson, ThingCategory } from "@/data/social-domain";
import { cn } from "@/lib/cn";
import { socialHref } from "./paths";

/*
 * Small shared Social pieces: the page header (breadcrumb Social › group ›
 * page), person avatars in the coral scope with the optional group status
 * dot, RSVP / expense status tags (never colour alone — always text) and the
 * template / category glyphs used by rows.
 */

export function SocialPageHeader({
  group,
  trail = [],
  title,
  titleAddon,
  subtitle,
  actions,
}: {
  group?: { id: string; name: string } | null;
  trail?: BreadcrumbItem[];
  title: ReactNode;
  titleAddon?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useTranslations("Navigation");
  const items: BreadcrumbItem[] = [{ label: t("contexts.social.label"), href: socialHref.home }];
  if (group) items.push({ label: group.name, href: socialHref.group(group.id) });
  items.push(...trail);
  items[items.length - 1] = { label: items[items.length - 1]!.label };
  return (
    <PageHeader
      breadcrumb={items.length > 1 ? <Breadcrumbs scope="social" items={items} middleTruncate /> : undefined}
      title={title}
      titleAddon={titleAddon}
      subtitle={subtitle}
      actions={actions}
    />
  );
}

export function PersonAvatar({ person, size = 32, status, className }: { person: SocialPerson; size?: AvatarSize; status?: GroupStatus | null; className?: string }) {
  const tStatus = useTranslations("Social.status");
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar name={person.name} initials={person.initials} size={size} tone="social" decorative={status !== undefined} />
      {status !== undefined ? (
        <>
          <PresenceDot status={status?.status ?? null} className="absolute -end-0.5 -bottom-0.5 ring-2 ring-surface" />
          <span className="sr-only">{`${person.name}, ${tStatus(status?.status ?? "none")}`}</span>
        </>
      ) : null}
    </span>
  );
}

const RSVP_TONE: Record<Rsvp, string> = {
  going: "bg-scope-soft text-scope-deep",
  maybe: "bg-warning-soft text-warning-text",
  declined: "bg-subtle text-fg-secondary",
  pending: "inset-ring inset-ring-outline text-fg-secondary",
};

export function RsvpTag({ rsvp, className }: { rsvp: Rsvp; className?: string }) {
  const t = useTranslations("Social.rsvp");
  return <span className={cn("inline-flex h-7 shrink-0 items-center rounded-pill px-3 text-xs font-bold", RSVP_TONE[rsvp], className)}>{t(rsvp)}</span>;
}

const EXPENSE_TONE: Record<ExpenseStatus, string> = {
  proposed: "bg-warning-soft text-warning-text",
  approved: "bg-success-soft text-success-text",
  "edit-pending": "bg-warning-soft text-warning-text",
  rejected: "bg-danger-soft text-danger-text",
};

export function ExpenseStatusTag({ status, className }: { status: ExpenseStatus; className?: string }) {
  const t = useTranslations("Social.expenses.status");
  return <span className={cn("inline-flex min-h-7 items-center rounded-pill px-3 py-1 text-xs font-bold", EXPENSE_TONE[status], className)}>{t(status)}</span>;
}

const GLYPHS: Record<ActivityTemplate | ThingCategory | "expense" | "travel" | "calendar", LucideIcon> = {
  trip: Mountain,
  sport: Dumbbell,
  gathering: PartyPopper,
  family: Users,
  blank: Sparkles,
  outdoor: Mountain,
  tools: Hammer,
  books: BookOpen,
  games: Gamepad2,
  kitchen: CookingPot,
  other: Package,
  expense: Receipt,
  travel: Plane,
  calendar: Calendar,
};

/** Rounded tile with a glyph (activity template, thing category, expense). */
export function GlyphTile({ kind, className }: { kind: keyof typeof GLYPHS; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-row bg-scope-soft text-scope-deep", className)}>
      <Icon icon={GLYPHS[kind]} size={18} />
    </span>
  );
}

/** Card section title with an optional count / action on the end side. */
export function SectionHead({ title, end, as: Tag = "h2", id }: { title: ReactNode; end?: ReactNode; as?: "h2" | "h3"; id?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <Tag id={id} className="type-title text-fg">
        {title}
      </Tag>
      {end}
    </div>
  );
}

/** The server does not offer this part of Social yet (live API): an honest empty slot, never placeholder data. */
export const isUnsupported = (error: unknown) => error instanceof SocialError && error.code === "unsupported";

export function SocialUnsupported({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Social.common");
  if (compact) return <p className="rounded-row bg-subtle p-3 text-sm text-fg-secondary">{t("unsupportedTitle")} · {t("unsupportedBody")}</p>;
  return <UnavailableState title={t("unsupportedTitle")} description={t("unsupportedBody")} />;
}

/** Error / loading for a set of queries: unsupported → SocialUnsupported, other errors → retry, pending → loading; null when all have data. */
export function queryGate(queries: readonly UseQueryResult<unknown>[]): ReactNode | null {
  const failed = queries.find((q) => q.isError);
  if (failed) return isUnsupported(failed.error) ? <SocialUnsupported /> : <ErrorState onRetry={() => void Promise.all(queries.map((q) => q.refetch()))} />;
  if (queries.some((q) => q.data === undefined)) return <AccessLoading />;
  return null;
}

/** "{n} people" with an unknown count shown as a dash. */
export function usePeopleLabel() {
  const t = useTranslations("Social");
  return (count: number | null, digits: (n: number) => string) => t("people", { count: count ?? 0, n: count === null ? t("common.notShown") : digits(count) });
}
