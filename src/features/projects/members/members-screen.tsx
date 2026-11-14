"use client";

import { CalendarDays, ChevronDown, MoreHorizontal, Plus, UsersRound, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState } from "@/components/feedback/state-views";
import { Avatar } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import type { GuestGrant, PendingInvite, ProjectMember, ProjectRole } from "@/data/project-domain";
import {
  useGuestGrants,
  useInviteActions,
  useMemberActions,
  useMemberList,
  usePendingInvites,
  useProjectTasks,
} from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { isUnavailable, useUnavailableTitle } from "@/features/projects/unavailable";
import { dayToLocalDate, localDateToDay } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useOpenProjectSheet } from "../sheets/project-sheet-params";
import { useMediaQuery } from "../use-media";

/*
 * PJ-13 · Members (/projects/[id]/members). Segmented Members · Invitations
 * · Guests (?view=). Member rows (product cards, never notched): role chip =
 * popover (applies at once, Undo toast), capacity per week (Manager+, used
 * by Workload, never Personal data), open task count, ⋯ menu with Remove
 * (preview: open tasks become Unassigned) or Leave on my own row. The single
 * Owner is never removed or demoted (transfer = Settings › Lifecycle).
 * Pending invitations (Resend / Cancel), a role guide card, and guest task
 * grants with expiry. Invite opens ?sheet=project-invite (PJ-90). Right
 * column drops under the list below 1180px.
 */

type View = "members" | "invitations" | "guests";
const RANK: Record<ProjectRole, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1, guest: 0 };
type AssignableRole = Exclude<ProjectRole, "owner" | "guest">;

function useSaveError() {
  const t = useTranslations("Members");
  const tConflict = useTranslations("Access.states.conflict");
  const unavailable = useUnavailableTitle();
  return (error: unknown) =>
    toast({
      tone: isUnavailable(error) ? "info" : "danger",
      title: unavailable(error) ?? (error instanceof RepositoryError && error.code === "conflict" ? tConflict("title") : t("error")),
    });
}

export function MembersScreen() {
  const t = useTranslations("Members");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { project, capabilities, demo } = useProject();
  const openSheet = useOpenProjectSheet();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const members = useMemberList(project.id);
  const invites = usePendingInvites(project.id);
  const grants = useGuestGrants(project.id);
  const view: View = params.get("view") === "invitations" ? "invitations" : params.get("view") === "guests" ? "guests" : "members";

  const list = members.data ?? [];
  const guests = list.filter((member) => member.role === "guest");
  const pending = demo === "empty" ? [] : (invites.data ?? []);
  // Live: the API lists no pending invitations or task grants; those reads fail and show as unavailable.
  const invitesUnavailable = invites.isError && demo !== "empty";
  const grantList = grants.data ?? [];

  const setView = (next: View) => {
    const query = new URLSearchParams(params.toString());
    if (next === "members") query.delete("view");
    else query.set("view", next);
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ""}`, { scroll: false });
  };

  const header = (
    <ProjectPageHeader
      module="members"
      title={t("title")}
      actions={
        <>
          <Segmented
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "members", label: <Count label={t("view.members")} n={list.length} /> },
              { value: "invitations", label: <Count label={t("view.invitations")} n={pending.length} /> },
              { value: "guests", label: <Count label={t("view.guests")} n={guests.length} /> },
            ]}
          />
          {capabilities.invite ? (
            phone ? (
              // PJM03: a round + on phones.
              <IconButton label={t("invite")} onClick={() => openSheet("project-invite")}>
                <Icon icon={Plus} size={18} />
              </IconButton>
            ) : (
              <Button size="lg" className="gap-2" onClick={() => openSheet("project-invite")}>
                <Icon icon={Plus} size={18} />
                {t("invite")}
              </Button>
            )
          ) : null}
        </>
      }
    />
  );

  if (!members.data || (!invites.data && !invites.isError) || (!grants.data && !grants.isError)) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="flex min-w-0 flex-col gap-4">
          {view === "members" ? (
            <>
              <MemberList members={list} grants={grantList} />
              <PendingInvites invites={invitesUnavailable ? null : pending} />
            </>
          ) : view === "invitations" ? (
            <PendingInvites invites={invitesUnavailable ? null : pending} />
          ) : (
            <GuestList guests={guests} grants={grantList} grantsUnavailable={grants.isError} />
          )}
        </div>
        <RoleGuide />
      </div>
    </>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  const format = useProjectFormat();
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="tabular opacity-80">{format.number(n)}</span>
    </span>
  );
}

const ROW_GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_11rem_5.5rem_5rem_2.5rem] sm:items-center sm:gap-3";

function MemberList({ members, grants }: { members: readonly ProjectMember[]; grants: readonly GuestGrant[] }) {
  const t = useTranslations("Members");
  return (
    <section aria-labelledby="member-list" className="flex flex-col gap-2 sm:rounded-[28px] sm:bg-surface sm:p-4">
      <h2 id="member-list" className="sr-only">
        {t("view.members")}
      </h2>
      <div aria-hidden="true" className={cn(ROW_GRID, "px-3 text-xs font-semibold text-fg-secondary max-sm:hidden")}>
        <span>{t("columns.person")}</span>
        <span>{t("columns.role")}</span>
        <span>{t("columns.capacity")}</span>
        <span>{t("columns.tasks")}</span>
        <span />
      </div>
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <MemberRow key={member.person.id} member={member} grant={grants.find((grant) => grant.personId === member.person.id)} />
        ))}
      </ul>
    </section>
  );
}

function useMemberRights(member: ProjectMember) {
  const { capabilities } = useProject();
  const self = member.person.id === "me";
  const canManage =
    member.role !== "owner" &&
    member.role !== "guest" &&
    (capabilities.manageMembers || (capabilities.manageJuniorMembers && (RANK[member.role] < RANK.manager || self)));
  const canRemove =
    member.role !== "owner" &&
    !self &&
    (capabilities.manageMembers || (capabilities.manageJuniorMembers && RANK[member.role] < RANK.manager));
  const roleOptions: AssignableRole[] = capabilities.manageMembers
    ? ["admin", "manager", "member", "viewer"]
    : ["member", "viewer"];
  return { self, canManage, canRemove, roleOptions };
}

function MemberRow({ member, grant }: { member: ProjectMember; grant?: GuestGrant }) {
  const t = useTranslations("Members");
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const router = useRouter();
  const pathname = usePathname();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const { project, capabilities } = useProject();
  const actions = useMemberActions(project.id);
  const onError = useSaveError();
  const { self, canManage, canRemove, roleOptions } = useMemberRights(member);
  const [confirm, setConfirm] = useState<{ kind: "remove" | "leave"; openTasks: number } | null>(null);
  const name = self ? t("you", { name: member.person.name }) : member.person.name;

  const changeRole = (role: AssignableRole) => {
    const previous = member.role as AssignableRole;
    if (role === previous) return;
    actions.setRole.mutate(
      { personId: member.person.id, role },
      {
        onSuccess: () =>
          toast({
            title: t("roleChanged", { name: member.person.name, role: labels.role(role) }),
            action: {
              label: t("undo"),
              altText: t("undoAlt"),
              onClick: () => actions.setRole.mutate({ personId: member.person.id, role: previous }, { onError }),
            },
          }),
        onError,
      },
    );
  };

  const subtitle =
    member.role === "guest" && grant
      ? t("guestGrant", { n: format.number(grant.taskIds.length), date: format.day(grant.expires) })
      : phone
        ? member.capacityHours !== null
          ? [
              t("hoursPerWeek", { n: format.number(member.capacityHours) }),
              member.openTasks > 0 ? t("openTasks", { n: format.number(member.openTasks) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : member.role === "viewer"
            ? t("readOnly")
            : member.email
        : member.email;

  const roleControl =
    member.role === "guest" ? (
      <button
        type="button"
        onClick={() => router.replace(`${pathname}?view=guests`, { scroll: false })}
        className="inline-flex min-h-8 items-center gap-1 rounded-pill px-3 text-xs font-semibold text-fg inset-ring inset-ring-outline focus-visible:focus-ring"
      >
        {t("guestRole")}
        <Icon icon={ChevronDown} size={14} />
      </button>
    ) : canManage ? (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("changeRoleFor", { name: member.person.name, role: labels.role(member.role) })}
            className="inline-flex min-h-8 items-center gap-1 rounded-pill px-3 text-xs font-semibold text-fg inset-ring inset-ring-outline focus-visible:focus-ring"
          >
            {labels.role(member.role)}
            <Icon icon={ChevronDown} size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={t("changeRole")} className="w-64" data-scope="project">
          <p className="mb-2 text-sm font-bold text-fg">{t("changeRole")}</p>
          <div role="radiogroup" aria-label={t("changeRole")} className="flex flex-col gap-1.5">
            {roleOptions.map((role) => (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={member.role === role}
                onClick={() => changeRole(role)}
                className={cn(
                  "min-h-10 rounded-[14px] px-3 text-start text-sm font-semibold focus-visible:focus-ring",
                  member.role === role ? "bg-surface text-fg inset-ring-[1.5px] inset-ring-scope-deep" : "bg-subtle text-fg",
                )}
              >
                {labels.role(role)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-fg-secondary">{t("ownerNote")}</p>
        </PopoverContent>
      </Popover>
    ) : (
      <span className="inline-flex min-h-8 items-center rounded-pill bg-raised px-3 text-xs font-semibold text-fg">
        {labels.role(member.role)}
      </span>
    );

  const menu =
    canRemove || self ? (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <IconButton size="sm" variant="ghost" label={t("rowMenu", { name: member.person.name })}>
            <Icon icon={MoreHorizontal} size={18} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-scope="project">
          {self ? (
            <DropdownMenuItem
              disabled={member.role === "owner"}
              onSelect={() => void actions.removalPreview(member.person.id).then((preview) => setConfirm({ kind: "leave", ...preview }))}
            >
              {t("leave")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => void actions.removalPreview(member.person.id).then((preview) => setConfirm({ kind: "remove", ...preview }))}
            >
              {t("remove")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <span />
    );

  return (
    <li className={cn(ROW_GRID, "flex flex-wrap items-center gap-3 rounded-[22px] bg-surface p-3 inset-ring inset-ring-outline")}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.person.name} initials={member.person.initials} size={32} decorative className="size-9 text-xs" />
        <span className="flex min-w-0 flex-col">
          <bdi className="truncate text-sm font-bold text-fg">{name}</bdi>
          <span className="truncate text-xs font-medium text-fg-secondary">
            <bdi>{subtitle}</bdi>
          </span>
        </span>
      </span>
      <span className="max-sm:ms-auto">{roleControl}</span>
      <span className="text-sm font-semibold text-fg max-sm:hidden">
        <CapacityCell member={member} editable={capabilities.editCapacity && member.role !== "guest"} />
      </span>
      <span className="text-xs font-semibold text-fg max-sm:hidden">{t("openTasks", { n: format.number(member.openTasks) })}</span>
      <span>{menu}</span>
      {member.role === "owner" && self ? <span className="sr-only">{t("lastOwner")}</span> : null}
      {confirm ? (
        <RemoveDialog member={member} kind={confirm.kind} openTasks={confirm.openTasks} onClose={() => setConfirm(null)} />
      ) : null}
    </li>
  );
}

function CapacityCell({ member, editable }: { member: ProjectMember; editable: boolean }) {
  const t = useTranslations("Members");
  const format = useProjectFormat();
  const { project } = useProject();
  const actions = useMemberActions(project.id);
  const onError = useSaveError();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(member.capacityHours?.toString() ?? "");
  const label = member.capacityHours !== null ? t("hours", { n: format.number(member.capacityHours) }) : t("noCapacity");
  if (!editable) return <>{label}</>;
  const save = (hours: number | null) =>
    actions.setCapacity.mutate({ personId: member.person.id, hours }, { onSuccess: () => setOpen(false), onError });
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(member.capacityHours?.toString() ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("capacityEdit", { name: member.person.name })}: ${label}`}
          className="rounded-[10px] px-1 underline decoration-dotted underline-offset-4 hover:text-scope-deep focus-visible:focus-ring"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={t("capacityEdit", { name: member.person.name })} className="w-64" data-scope="project">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const hours = value.trim() === "" ? null : Number(value);
            save(hours === null || Number.isNaN(hours) ? null : hours);
          }}
        >
          <label htmlFor={inputId} className="text-sm font-bold text-fg">
            {t("capacityEdit", { name: member.person.name })}
          </label>
          <Input id={inputId} type="number" min={0} max={168} inputMode="numeric" dir="ltr" value={value} onChange={(event) => setValue(event.target.value)} />
          <p className="text-xs font-medium text-fg-secondary">{t("capacityHint")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => save(null)}>
              {t("clear")}
            </Button>
            <Button type="submit" size="sm">
              {t("save")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function RemoveDialog({
  member,
  kind,
  openTasks,
  onClose,
}: {
  member: ProjectMember;
  kind: "remove" | "leave";
  openTasks: number;
  onClose: () => void;
}) {
  const t = useTranslations("Members");
  const router = useRouter();
  const { project } = useProject();
  const actions = useMemberActions(project.id);
  const onError = useSaveError();
  const first = member.person.name.split(" ")[0] ?? member.person.name;
  const leave = kind === "leave";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={leave ? t("leaveTitle") : t("removeTitle", { name: member.person.name })}
        description={leave ? t("leaveBody", { n: openTasks }) : t("removeBody", { n: openTasks, first })}
        size="sm"
        data-scope="project"
      >
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (leave) {
                // The project leaves the directory: navigate even though this view unmounts.
                const name = project.name;
                actions.leave.mutateAsync().then(() => {
                  toast({ title: t("left", { project: name }) });
                  router.push("/projects");
                }, onError);
              } else {
                actions.remove.mutate(member.person.id, {
                  onSuccess: () => {
                    toast({ title: t("removed", { name: member.person.name }) });
                    onClose();
                  },
                  onError,
                });
              }
            }}
          >
            {leave ? t("leaveAction") : t("removeAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvites({ invites }: { invites: readonly PendingInvite[] | null }) {
  const t = useTranslations("Members");
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const { project, capabilities } = useProject();
  const actions = useInviteActions(project.id);
  return (
    <section aria-labelledby="pending-invites" className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="pending-invites" className="type-title text-fg">
          {t("pending")}
        </h2>
        {invites ? <span className="text-xs font-semibold text-fg-secondary">{format.number(invites.length)}</span> : null}
      </div>
      {invites === null ? (
        <p className="text-sm text-fg-muted">{t("pendingUnavailable")}</p>
      ) : invites.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("noPending")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
              <Icon icon={UsersRound} size={16} className="shrink-0 text-fg-secondary" />
              <span className="flex min-w-0 flex-1 flex-col">
                <bdi dir="ltr" className="truncate text-start text-sm font-bold text-fg">
                  {invite.email}
                </bdi>
                <span className="text-xs font-medium text-fg-secondary">
                  {invite.expiresAt
                    ? t("inviteMeta", { role: labels.role(invite.role), when: format.relative(invite.expiresAt) })
                    : t("inviteMetaNoExpiry", { role: labels.role(invite.role), when: format.relative(invite.sentAt) })}
                </span>
              </span>
              {capabilities.invite ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-surface"
                    onClick={() => actions.resend.mutate(invite.id, { onSuccess: () => toast({ title: t("resent") }) })}
                  >
                    {t("resend")}
                  </Button>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={t("cancelInvite", { email: invite.email })}
                    onClick={() =>
                      actions.cancel.mutate(invite.id, {
                        onSuccess: () =>
                          toast({
                            title: t("inviteCancelled"),
                            action: { label: t("undo"), altText: t("undo"), onClick: () => actions.restore.mutate(invite) },
                          }),
                      })
                    }
                  >
                    <Icon icon={X} size={16} />
                  </IconButton>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GuestList({
  guests,
  grants,
  grantsUnavailable,
}: {
  guests: readonly ProjectMember[];
  grants: readonly GuestGrant[];
  grantsUnavailable: boolean;
}) {
  const t = useTranslations("Members");
  if (grantsUnavailable) return <EmptyState variant="card" title={t("grantsUnavailable")} titleAs="h2" />;
  if (guests.length === 0) return <EmptyState variant="card" title={t("guestsEmpty")} titleAs="h2" />;
  return (
    <section aria-label={t("view.guests")} className="flex flex-col gap-3">
      {guests.map((guest) => (
        <GuestGrantCard
          key={guest.person.id}
          guest={guest}
          grant={grants.find((grant) => grant.personId === guest.person.id) ?? null}
        />
      ))}
    </section>
  );
}

function GuestGrantCard({ guest, grant }: { guest: ProjectMember; grant: GuestGrant | null }) {
  const t = useTranslations("Members");
  const format = useProjectFormat();
  const { project, capabilities } = useProject();
  const tasks = useProjectTasks(project.id, {});
  const actions = useMemberActions(project.id);
  const onError = useSaveError();
  const [editing, setEditing] = useState(false);
  const [taskIds, setTaskIds] = useState<readonly string[]>(grant?.taskIds ?? []);
  const [expires, setExpires] = useState<string | null>(grant?.expires ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canEdit = capabilities.manageGrants;
  const all = tasks.data?.tasks ?? [];
  const shown = editing ? all : all.filter((task) => (grant?.taskIds ?? []).includes(task.id));
  const headingId = useId();

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar name={guest.person.name} initials={guest.person.initials} size={32} decorative className="size-9 text-xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <h2 id={headingId} className="truncate text-sm font-bold text-fg">
            <bdi>{guest.person.name}</bdi>
          </h2>
          <bdi dir="ltr" className="truncate text-start text-xs font-medium text-fg-secondary">
            {guest.email}
          </bdi>
        </span>
        {canEdit && !editing ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {t("editGrant")}
          </Button>
        ) : null}
      </div>
      <h3 className="text-xs font-bold tracking-[0.08em] text-fg-secondary uppercase">{t("grantTitle")}</h3>
      <ul aria-label={t("grantTasks")} className="flex flex-col gap-1">
        {shown.map((task) => (
          <li key={task.id} className="rounded-row px-2 hover:bg-subtle">
            <Checkbox
              checked={taskIds.includes(task.id)}
              disabled={!editing}
              label={<bdi>{task.title}</bdi>}
              onCheckedChange={(checked) =>
                setTaskIds((current) => (checked === true ? [...current, task.id] : current.filter((id) => id !== task.id)))
              }
              wrapperClassName="min-h-10"
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 rounded-row bg-subtle px-3 py-2.5 text-sm">
        <span className="font-semibold text-fg-secondary">{t("expires")}</span>
        {editing ? (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-2 bg-surface">
                <Icon icon={CalendarDays} size={14} />
                {expires ? format.day(expires) : t("noCapacity")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" aria-label={t("expires")} className="w-auto" data-scope="project">
              <DatePicker
                title={t("expires")}
                defaultValue={expires ? dayToLocalDate(expires) : null}
                onConfirm={(date) => {
                  setExpires(localDateToDay(date));
                  setPickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <span className="font-bold text-fg">{grant ? format.day(grant.expires) : t("noCapacity")}</span>
        )}
      </div>
      {editing ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setTaskIds(grant?.taskIds ?? []);
              setExpires(grant?.expires ?? null);
              setEditing(false);
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={!expires || taskIds.length === 0 || actions.setGrant.isPending}
            onClick={() =>
              expires &&
              actions.setGrant.mutate(
                { personId: guest.person.id, taskIds, expires },
                {
                  onSuccess: () => {
                    toast({ title: t("grantSaved") });
                    setEditing(false);
                  },
                  onError,
                },
              )
            }
          >
            {t("save")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function RoleGuide() {
  const t = useTranslations("Members.guide");
  const labels = useProjectLabels();
  return (
    <section aria-labelledby="role-guide" className="flex h-fit flex-col gap-2 rounded-[28px] bg-surface p-4">
      <h2 id="role-guide" className="type-title text-fg">
        {t("title")}
      </h2>
      <dl className="flex flex-col gap-1.5">
        {(["owner", "admin", "manager", "member", "viewer", "guest"] as const).map((role) => (
          <div key={role} className="rounded-row bg-subtle px-3 py-2">
            <dt className="text-sm font-bold text-fg">{labels.role(role)}</dt>
            <dd className="text-xs font-medium text-fg-secondary">{t(role)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
