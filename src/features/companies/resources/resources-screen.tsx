"use client";

import { Archive, Check, Clock, Link2, Plus, Undo2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { CompanyResource, CompanyRoom, ResourceRequest, ResourceStatus } from "@/data/company-domain";
import {
  useApprovals,
  useCapacity,
  useCompanyMutation,
  useDepartments,
  useResourceRequests,
  useResources,
  useRooms,
} from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { DayField } from "@/features/goals/goal-sheet";
import { companyHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-06 · Resources & capacity (/companies/[id]/resources?tab=equipment ·
 * rooms · capacity). Equipment: inventory with tag, type, assignee,
 * department and status (Assigned / Available / Requested / Repair /
 * Retired); a request (dates + reason) runs through the "Resources" chain;
 * conflicts suggest the next free date. Request signature card: notch
 * Approve request for the current reviewer, otherwise Withdraw (own) or
 * Copy link. Rooms: a day timeline per room; others' bookings show as busy
 * without a title. Capacity: department booked ÷ capacity heat table by
 * month (basic check, no HR scheduling). No depreciation or accounting.
 */

type Tab = "equipment" | "rooms" | "capacity";
type Filter = "all" | ResourceStatus;
const STATUS_TONE: Record<ResourceStatus, "success" | "warning" | "neutral" | "info" | "danger"> = {
  assigned: "info",
  available: "success",
  requested: "warning",
  repair: "neutral",
  retired: "neutral",
};

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The busy window a request overlaps, and the first free day after it (keeping the same length). */
export function findConflict(resource: CompanyResource, from: string, to: string) {
  const overlap = resource.busy.find((range) => range.from <= to && from <= range.to);
  if (!overlap) return null;
  const length = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  let start = addDays(overlap.to, 1);
  for (const range of [...resource.busy].sort((a, b) => a.from.localeCompare(b.from))) {
    const end = addDays(start, length);
    if (range.from <= end && start <= range.to) start = addDays(range.to, 1);
  }
  return { overlap, suggestion: { from: start, to: addDays(start, length) } };
}

export function ResourcesScreen() {
  const t = useTranslations("Company.resources");
  const { capabilities } = useCompany();
  const writable = useCompanyWritable();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "rooms" || (raw === "capacity" && capabilities.seeCapacity) ? raw : "equipment";
  const [adding, setAdding] = useState(false);
  const [requesting, setRequesting] = useState<CompanyResource | null | "pick">(null);

  const setTab = (next: Tab) => {
    const search = new URLSearchParams(params.toString());
    search.set("tab", next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };

  return (
    <>
      <CompanyPageHeader
        module="resources"
        title={t("title")}
        scope
        actions={
          <>
            <Segmented<Tab>
              label={t("tabs.label")}
              value={tab}
              onValueChange={setTab}
              options={[
                { value: "equipment", label: t("tabs.equipment") },
                { value: "rooms", label: t("tabs.rooms") },
                ...(capabilities.seeCapacity ? [{ value: "capacity" as const, label: t("tabs.capacity") }] : []),
              ]}
            />
            {tab === "equipment" && writable ? (
              capabilities.manageResources ? (
                <Button className="gap-2" onClick={() => setAdding(true)}>
                  <Icon icon={Plus} size={16} />
                  {t("add")}
                </Button>
              ) : capabilities.requestResource ? (
                <Button className="gap-2" onClick={() => setRequesting("pick")}>
                  <Icon icon={Plus} size={16} />
                  {t("request")}
                </Button>
              ) : null
            ) : null}
          </>
        }
      />
      {tab === "equipment" ? <Equipment onRequest={(resource) => setRequesting(resource)} /> : null}
      {tab === "rooms" ? <Rooms /> : null}
      {tab === "capacity" ? <Capacity /> : null}
      {adding ? <AddResourceDialog onClose={() => setAdding(false)} /> : null}
      {requesting ? <RequestDialog initial={requesting === "pick" ? null : requesting} onClose={() => setRequesting(null)} /> : null}
    </>
  );
}

function Equipment({ onRequest }: { onRequest: (resource: CompanyResource) => void }) {
  const t = useTranslations("Company.resources");
  const { company, capabilities, departmentId } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const resources = useResources(company.id);
  const requests = useResourceRequests(company.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  if (resources.isError) return <ErrorState onRetry={() => void resources.refetch()} />;
  if (!resources.data || !requests.data) return <AccessLoading />;
  const scoped = resources.data.filter((item) => departmentId === null || item.departmentId === departmentId || item.departmentId === null);
  const count = (key: Filter) => (key === "all" ? scoped.length : scoped.filter((item) => item.status === key).length);
  const shown = scoped.filter((item) => filter === "all" || item.status === filter);
  const pending = requests.data.filter((request) => request.status === "pending");
  const selected = pending.find((request) => request.resourceId === selectedId) ?? pending[0];

  const note = (item: CompanyResource) => {
    if (item.status === "assigned" && item.since) return t("since", { date: format.day(item.since) });
    if (item.status === "requested") {
      const request = pending.find((candidate) => candidate.resourceId === item.id);
      if (request) return t("requestedUntil", { name: request.requesterName, date: format.day(request.to) });
    }
    return item.note;
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <ProductCard as="section" aria-label={t("tabs.equipment")} className="gap-3">
        <PillGroup<Filter>
          label={t("filter")}
          value={filter}
          onValueChange={setFilter}
          options={(["all", "assigned", "available", "requested", "repair", "retired"] as const).map((key) => ({
            value: key,
            label: t(`status.${key}`),
            count: count(key),
          }))}
        />
        {shown.length === 0 ? (
          <EmptyState icon={Archive} title={t("empty")} size="compact" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shown.map((item) => {
              const isSelected = selected?.resourceId === item.id;
              const requestable = writable && capabilities.requestResource && (item.status === "available" || item.status === "assigned" || item.status === "requested");
              return (
                <li
                  key={item.id}
                  className={cn(
                    "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-row px-3 py-2.5 inset-ring inset-ring-line sm:grid-cols-[auto_minmax(0,1fr)_7rem_7rem_6.5rem_minmax(0,8rem)_auto]",
                    isSelected && "inset-ring-[1.5px] inset-ring-scope-deep",
                  )}
                >
                  <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-tile bg-subtle text-fg-secondary">
                    <Icon icon={Archive} size={15} />
                  </span>
                  <button
                    type="button"
                    className="flex min-w-0 flex-col text-start"
                    onClick={() => setSelectedId(item.id)}
                    disabled={item.status !== "requested"}
                  >
                    <span className="truncate text-sm font-bold text-fg">
                      <bdi>{item.name}</bdi> · <span className="tabular">{item.tag}</span>
                    </span>
                    <span className="text-xs text-fg-secondary">{t(`type.${item.type}`)}</span>
                  </button>
                  <bdi className="truncate text-xs font-semibold text-fg max-sm:hidden">{item.assigneeName ?? "—"}</bdi>
                  <span className="max-sm:hidden">
                    {item.departmentName ? (
                      <span className="rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">
                        <bdi>{item.departmentName}</bdi>
                      </span>
                    ) : (
                      <span className="text-xs text-fg-muted">—</span>
                    )}
                  </span>
                  <StatusChip tone={STATUS_TONE[item.status]}>{t(`status.${item.status}`)}</StatusChip>
                  <span className="truncate text-xs text-fg-secondary max-sm:hidden">
                    <bdi>{note(item) ?? ""}</bdi>
                  </span>
                  {requestable ? (
                    <Button size="sm" variant="ghost" onClick={() => onRequest(item)} aria-label={t("requestItem", { name: item.name, tag: item.tag })}>
                      {t("request")}
                    </Button>
                  ) : (
                    <span className="max-sm:hidden" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-fg-muted">{t("note")}</p>
      </ProductCard>
      {selected ? <RequestCard request={selected} resource={resources.data.find((item) => item.id === selected.resourceId)} /> : null}
    </div>
  );
}

function RequestCard({ request, resource }: { request: ResourceRequest; resource: CompanyResource | undefined }) {
  const t = useTranslations("Company.resources.card");
  const { company, me } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const approvals = useApprovals(company.id);
  const approval = approvals.data?.find((item) => item.id === request.approvalId);
  const forMe = writable && approval?.forMe === true;
  const own = request.requesterId === me.id;
  const [declining, setDeclining] = useState(false);
  const decide = useCompanyMutation(company.id, (repo, id, vars: { decision: "approved" | "rejected"; note: string | null }) =>
    repo.decide(id, request.approvalId!, vars.decision, vars.note),
  );
  const withdraw = useCompanyMutation(company.id, (repo, id) => repo.withdrawResourceRequest(id, request.id));
  // Other people's busy windows that this request overlaps (its own window excluded).
  const others = resource ? { ...resource, busy: resource.busy.filter((range) => !(range.from === request.from && range.to === request.to)) } : undefined;
  const conflict = others ? findConflict(others, request.from, request.to) : null;

  const action = forMe ? (
    <SignatureCardAction
      icon={Check}
      label={t("approve")}
      disabled={decide.isPending}
      onClick={() => decide.mutate({ decision: "approved", note: null }, { onSuccess: () => toast({ title: t("approved") }) })}
    />
  ) : own && writable ? (
    <SignatureCardAction
      icon={Undo2}
      variant="neutral"
      label={t("withdraw")}
      disabled={withdraw.isPending}
      onClick={() => withdraw.mutate(undefined, { onSuccess: () => toast({ title: t("withdrawn") }) })}
    />
  ) : (
    <SignatureCardAction
      icon={Link2}
      variant="neutral"
      label={t("copyLink")}
      onClick={() => {
        void navigator.clipboard?.writeText(new URL(`${companyHref(company.id, "resources")}?tab=equipment`, window.location.origin).toString());
        toast({ title: t("copied") });
      }}
    />
  );

  return (
    <SignatureCard as="section" aria-labelledby="request-title" action={action} contentClassName="gap-3" className="self-start">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-warning-text uppercase">{forMe ? t("kickerForMe") : t("kicker")}</p>
        <h2 id="request-title" className="type-title text-fg">
          <bdi>{request.resourceName}</bdi> · <span className="tabular">{request.tag}</span>
        </h2>
        <p className="text-xs font-semibold text-fg-secondary">
          {t("meta", { name: request.requesterName, department: request.departmentName, from: format.day(request.from), to: format.day(request.to) })}
        </p>
      </div>
      <div className="rounded-row bg-subtle px-3 py-2.5">
        <p className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("reason")}</p>
        <p className="text-sm text-fg">
          <bdi>{request.reason}</bdi>
        </p>
      </div>
      {conflict ? (
        <div className="flex items-center gap-2 rounded-row bg-warning-soft px-3 py-2.5 text-xs font-semibold text-warning-text">
          <Icon icon={Clock} size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">{t("overlaps", { date: format.day(conflict.overlap.to) })}</span>
          <span className="shrink-0 rounded-pill bg-surface px-2.5 py-1 font-bold text-fg">{t("suggest", { date: format.day(conflict.suggestion.from) })}</span>
        </div>
      ) : null}
      {forMe ? (
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => setDeclining(true)}>
            {t("decline")}
          </Button>
          <Button
            variant="secondary"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ decision: "approved", note: null }, { onSuccess: () => toast({ title: t("approved") }) })}
          >
            {t("approveDates")}
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-fg-muted">{t("chain")}</p>
      {declining ? (
        <ReasonDialog
          title={t("declineTitle")}
          label={t("declineReason")}
          submit={t("declineSubmit")}
          pending={decide.isPending}
          onClose={() => setDeclining(false)}
          onSubmit={(note) =>
            decide.mutate(
              { decision: "rejected", note },
              {
                onSuccess: () => {
                  toast({ title: t("declined") });
                  setDeclining(false);
                },
              },
            )
          }
        />
      ) : null}
    </SignatureCard>
  );
}

export function ReasonDialog({
  title,
  label,
  submit,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  submit: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const t = useTranslations("Company.resources");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={title}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (note.trim()) onSubmit(note.trim());
          }}
        >
          <Field invalid={touched && !note.trim()}>
            <FieldLabel>{label}</FieldLabel>
            <Textarea dir="auto" autoFocus value={note} onChange={(event) => setNote(event.target.value)} />
            {touched && !note.trim() ? <FieldError>{t("required")}</FieldError> : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestDialog({ initial, onClose }: { initial: CompanyResource | null; onClose: () => void }) {
  const t = useTranslations("Company.resources.requestDialog");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const resources = useResources(company.id);
  const today = getPlannerToday();
  const [resourceId, setResourceId] = useState(initial?.id ?? "");
  const [from, setFrom] = useState<string | null>(addDays(today, 1));
  const [to, setTo] = useState<string | null>(addDays(today, 7));
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const request = useCompanyMutation(company.id, (repo, id, vars: { resourceId: string; from: string; to: string; reason: string }) =>
    repo.requestResource(id, vars),
  );
  const options = (resources.data ?? []).filter((item) => item.status !== "retired" && item.status !== "repair");
  const resource = options.find((item) => item.id === resourceId);
  const conflict = resource && from && to ? findConflict(resource, from, to) : null;
  const datesInvalid = !from || !to || from > to;
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!resourceId || datesInvalid || !reason.trim() || conflict) return;
            request.mutate(
              { resourceId, from: from!, to: to!, reason },
              {
                onSuccess: () => {
                  toast({ title: t("sent"), description: t("sentBody") });
                  onClose();
                },
              },
            );
          }}
        >
          <Field invalid={touched && !resourceId}>
            <FieldLabel>{t("resource")}</FieldLabel>
            <Select value={resourceId} onValueChange={setResourceId} placeholder={t("choose")}>
              {options.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {`${item.name} · ${item.tag}`}
                </SelectItem>
              ))}
            </Select>
            {touched && !resourceId ? <FieldError>{t("resourceRequired")}</FieldError> : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <DayField label={t("from")} emptyLabel={t("from")} value={from} onChange={setFrom} />
            <DayField label={t("to")} emptyLabel={t("to")} value={to} onChange={setTo} />
          </div>
          {touched && datesInvalid ? <p className="text-xs font-semibold text-danger-text">{t("datesInvalid")}</p> : null}
          {conflict ? (
            <InlineAlert
              tone="warning"
              title={t("conflict", { date: format.day(conflict.overlap.to) })}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setFrom(conflict.suggestion.from);
                    setTo(conflict.suggestion.to);
                  }}
                >
                  {t("useSuggestion", { from: format.day(conflict.suggestion.from), to: format.day(conflict.suggestion.to) })}
                </Button>
              }
            />
          ) : null}
          <Field invalid={touched && !reason.trim()}>
            <FieldLabel>{t("reason")}</FieldLabel>
            <Textarea dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />
            {touched && !reason.trim() ? <FieldError>{t("reasonRequired")}</FieldError> : null}
          </Field>
          {request.isError ? (
            <InlineAlert tone="danger" title={request.error instanceof RepositoryError && request.error.code === "conflict" ? t("busy") : t("failed")} />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={request.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddResourceDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Company.resources.addDialog");
  const tType = useTranslations("Company.resources.type");
  const { company } = useCompany();
  const departments = useDepartments(company.id);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [type, setType] = useState<CompanyResource["type"]>("laptop");
  const [departmentId, setDepartmentId] = useState("none");
  const [touched, setTouched] = useState(false);
  const add = useCompanyMutation(company.id, (repo, id, vars: { name: string; tag: string; type: CompanyResource["type"]; departmentId: string | null }) =>
    repo.addResource(id, vars),
  );
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!name.trim() || !tag.trim()) return;
            add.mutate(
              { name, tag, type, departmentId: departmentId === "none" ? null : departmentId },
              {
                onSuccess: () => {
                  toast({ title: t("added") });
                  onClose();
                },
              },
            );
          }}
        >
          <Field invalid={touched && !name.trim()}>
            <FieldLabel>{t("name")}</FieldLabel>
            <Input dir="auto" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            {touched && !name.trim() ? <FieldError>{t("nameRequired")}</FieldError> : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field invalid={touched && !tag.trim()}>
              <FieldLabel>{t("tag")}</FieldLabel>
              <Input dir="ltr" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="EU-LT-030" />
              {touched && !tag.trim() ? <FieldError>{t("tagRequired")}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel>{t("type")}</FieldLabel>
              <Select value={type} onValueChange={(value) => setType(value as CompanyResource["type"])}>
                {(["laptop", "monitor", "phone", "license", "vehicle", "other"] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {tType(value)}
                  </SelectItem>
                ))}
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("department")}</FieldLabel>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectItem value="none">{t("shared")}</SelectItem>
              {(departments.data ?? []).map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </Select>
          </Field>
          {add.isError ? <InlineAlert tone="danger" title={t("failed")} /> : null}
          <p className="text-xs text-fg-muted">{t("purchaseNote")}</p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DAY_START = 8;
const DAY_END = 18;
const toHours = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h + m / 60;
};

function Rooms() {
  const t = useTranslations("Company.resources.rooms");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const today = getPlannerToday();
  const rooms = useRooms(company.id, today);
  const [booking, setBooking] = useState<CompanyRoom | null>(null);
  if (rooms.isError) return <ErrorState onRetry={() => void rooms.refetch()} />;
  if (!rooms.data) return <AccessLoading />;
  if (rooms.data.length === 0) return <EmptyState title={t("empty")} />;
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, index) => DAY_START + index);
  return (
    <ProductCard as="section" aria-label={t("title", { day: format.day(today) })} className="gap-3">
      <h2 className="type-title text-fg">{t("title", { day: format.day(today) })}</h2>
      <ul className="flex flex-col gap-2">
        {rooms.data.map((room) => (
          <li key={room.id} className="grid gap-3 rounded-row px-3 py-2.5 inset-ring inset-ring-line sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center">
            <div className="flex flex-col">
              <bdi className="text-sm font-bold text-fg">{room.name}</bdi>
              <span className="text-xs text-fg-secondary">{t("seats", { n: format.number(room.seats), floor: room.floor })}</span>
            </div>
            {/* Timeline: logical inset so RTL mirrors; the clock labels stay LTR digits islands. */}
            <div className="relative h-9 rounded-pill bg-subtle" aria-label={t("timeline", { room: room.name })} role="img">
              {room.bookings.map((booking) => {
                const start = ((toHours(booking.from) - DAY_START) / (DAY_END - DAY_START)) * 100;
                const width = ((toHours(booking.to) - toHours(booking.from)) / (DAY_END - DAY_START)) * 100;
                return (
                  <span
                    key={booking.id}
                    className={cn(
                      "absolute inset-y-1 flex items-center overflow-hidden rounded-pill px-2 text-[0.6875rem] font-bold",
                      booking.mine ? "bg-scope-deep text-on-accent" : "bg-raised text-fg-secondary",
                    )}
                    style={{ insetInlineStart: `${start}%`, width: `${width}%` }}
                  >
                    <span className="truncate">
                      <span dir="ltr" className="tabular">
                        {booking.from}
                      </span>{" "}
                      {booking.title ?? t("busy")}
                    </span>
                  </span>
                );
              })}
            </div>
            {writable ? (
              <Button size="sm" variant="secondary" onClick={() => setBooking(room)}>
                {t("book")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="flex justify-between px-1 text-[0.6875rem] text-fg-muted sm:ms-[10.75rem] sm:me-24" aria-hidden="true">
        {hours.filter((hour) => hour % 2 === 0).map((hour) => (
          <span key={hour} className="tabular">
            {format.number(hour)}:00
          </span>
        ))}
      </p>
      <p className="text-xs text-fg-muted">{t("note")}</p>
      {booking ? <BookRoomDialog room={booking} onClose={() => setBooking(null)} /> : null}
    </ProductCard>
  );
}

function BookRoomDialog({ room, onClose }: { room: CompanyRoom; onClose: () => void }) {
  const t = useTranslations("Company.resources.book");
  const { company } = useCompany();
  const [from, setFrom] = useState("15:00");
  const [to, setTo] = useState("16:00");
  const [title, setTitle] = useState("");
  const book = useCompanyMutation(company.id, (repo, id, vars: { from: string; to: string; title: string }) =>
    repo.bookRoom(id, { roomId: room.id, day: getPlannerToday(), ...vars }),
  );
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title", { room: room.name })} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            book.mutate(
              { from, to, title },
              {
                onSuccess: () => {
                  toast({ title: t("done") });
                  onClose();
                },
              },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("from")}</FieldLabel>
              <Input type="time" dir="ltr" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{t("to")}</FieldLabel>
              <Input type="time" dir="ltr" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("what")}</FieldLabel>
            <Input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          {book.isError ? (
            <InlineAlert tone="danger" title={book.error instanceof RepositoryError && book.error.code === "conflict" ? t("busy") : t("failed")} />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={book.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Capacity() {
  const t = useTranslations("Company.resources.capacity");
  const tMonths = useTranslations("Company.months");
  const { company, departmentId } = useCompany();
  const format = useCompanyFormat(company.currency);
  const capacity = useCapacity(company.id, true);
  if (capacity.isError) return <ErrorState onRetry={() => void capacity.refetch()} />;
  if (!capacity.data) return <AccessLoading />;
  const rows = capacity.data.rows.filter((row) => departmentId === null || row.departmentId === departmentId);
  if (rows.length === 0) return <EmptyState title={t("empty")} />;
  const tone = (value: number) =>
    value > 100 ? "bg-danger-soft text-danger-text" : value >= 85 ? "bg-scope-dot/45 text-fg" : value >= 75 ? "bg-scope-soft text-fg" : "bg-scope-soft/50 text-fg";
  return (
    <ProductCard as="section" aria-labelledby="capacity-title" className="gap-3 overflow-x-auto">
      <h2 id="capacity-title" className="sr-only">
        {t("title")}
      </h2>
      <table className="w-full min-w-[30rem] border-separate border-spacing-1.5 text-sm">
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-32">
              <span className="sr-only">{t("department")}</span>
            </th>
            {capacity.data.months.map((month) => (
              <th key={month} scope="col" className="text-center text-xs font-semibold text-fg-muted">
                {tMonths(String(month) as "1")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.departmentId}>
              <th scope="row" className="text-start text-xs font-bold text-fg">
                <bdi>{row.name}</bdi>
              </th>
              {row.values.map((value, index) => (
                <td key={capacity.data!.months[index]} className={cn("rounded-tile py-2.5 text-center text-xs font-bold tabular", tone(value))}>
                  {format.percent(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-fg-muted">{t("note")}</p>
    </ProductCard>
  );
}
