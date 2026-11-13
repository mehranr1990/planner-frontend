"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { ActivityTemplate, ExpenseScope, GroupTopic, SocialCurrency, ThingCategory } from "@/data/social-domain";
import { useActivities, useActivity, useConnections, useGroupAccess, useMyThings, useSocialDirectory, useSocialMutation } from "@/data/social-queries";
import { SocialError } from "@/data/social-repositories";
import { DayField } from "@/features/goals/goal-sheet";
import { consumeOpenedSheet, SHEET_PARAM } from "@/features/sheets/sheet-params";
import { toLatinDigits } from "@/lib/locale/digits";
import { ExpenseForm } from "../expenses/expense-form";
import { socialHref } from "../paths";
import { newClientOpId, useSocialErrorText } from "../use-social";
import { isSocialSheetId, socialSheetHref, type SocialSheetId } from "./social-sheet-params";

/*
 * Social sheet host for every /social route (SO-90 + SO-08 + SO-10/18):
 * ?sheet=group-new · activity-new (templates; &group= prefills) · connect
 * (privacy-preserving lookup) · expense-propose (&scope=group:id|activity:id)
 * · thing-new (&group=) · item-lend (&thing=). End drawers on desktop,
 * bottom sheets on phones (mobile rule). Closing goes Back when this tab
 * opened the sheet, else drops the parameter.
 */

const TOPICS: GroupTopic[] = ["outdoors", "sport", "family", "food", "travel", "books", "other"];
const CURRENCIES: SocialCurrency[] = ["toman", "try", "eur"];
const TEMPLATES: ActivityTemplate[] = ["trip", "sport", "gathering", "family", "blank"];
const CATEGORIES: ThingCategory[] = ["outdoor", "tools", "books", "games", "kitchen", "other"];

export function SocialSheetHost() {
  const params = useSearchParams();
  const id = params.get(SHEET_PARAM);
  if (!isSocialSheetId(id)) return null;
  return <SocialSheet key={`${id}:${params.toString()}`} id={id} params={params} />;
}

function SocialSheet({ id, params }: { id: SocialSheetId; params: URLSearchParams }) {
  const t = useTranslations("Social");
  const router = useRouter();
  const pathname = usePathname();
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const close = useCallback(() => {
    if (consumeOpenedSheet()) router.back();
    else router.replace(socialSheetHref(pathname, window.location.search, null), { scroll: false });
  }, [router, pathname]);
  const go = (href: string) => router.replace(href);
  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);
  const title: Record<SocialSheetId, string> = {
    "group-new": t("sheets.groupNew.title"),
    "activity-new": t("sheets.activityNew.title"),
    connect: t("connections.lookup.title"),
    "expense-propose": t("propose.title"),
    "item-lend": t("sheets.lend.title"),
    "thing-new": t("sheets.thingNew.title"),
  };
  return (
    <Sheet defaultOpen onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent side="end" size={id === "expense-propose" ? "detail" : "drawer"} title={title[id]} data-scope="social" data-social-sheet={id} onCloseAutoFocus={onCloseAutoFocus}>
        {id === "group-new" ? <GroupNewForm onDone={(groupId) => (groupId ? go(socialHref.group(groupId)) : close())} /> : null}
        {id === "activity-new" ? <ActivityNewForm groupId={params.get("group")} onDone={(activityId) => (activityId ? go(socialHref.activity(activityId)) : close())} /> : null}
        {id === "connect" ? <ConnectForm onDone={close} /> : null}
        {id === "expense-propose" ? <ProposeExpense scopeParam={params.get("scope")} activityParam={params.get("activity")} onDone={close} /> : null}
        {id === "thing-new" ? <ThingNewForm groupId={params.get("group")} onDone={close} /> : null}
        {id === "item-lend" ? <LendForm thingId={params.get("thing")} onDone={close} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Actions({ pending, submit, onCancel }: { pending: boolean; submit: string; onCancel: () => void }) {
  const t = useTranslations("Social.common");
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <Button type="button" variant="secondary" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button type="submit" disabled={pending}>
        {submit}
      </Button>
    </div>
  );
}

function ConnectionPicker({ label, value, onChange }: { label: string; value: string[]; onChange: (ids: string[]) => void }) {
  const connections = useConnections();
  const list = connections.data ?? [];
  if (list.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-bold text-fg">{label}</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {list.map((c) => (
          <Checkbox
            key={c.person.id}
            checked={value.includes(c.person.id)}
            onCheckedChange={(checked) => onChange(checked === true ? [...value, c.person.id] : value.filter((id) => id !== c.person.id))}
            label={<bdi>{c.person.name}</bdi>}
          />
        ))}
      </div>
    </fieldset>
  );
}

function GroupNewForm({ onDone }: { onDone: (groupId?: string) => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState<GroupTopic>("outdoors");
  const [currency, setCurrency] = useState<SocialCurrency>("toman");
  const [visibility, setVisibility] = useState<"private" | "discoverable">("private");
  const [invites, setInvites] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const opId = useRef(newClientOpId("group"));
  const create = useSocialMutation((repo) => repo.groups.create({ name, description, topic, currency, visibility, inviteIds: invites, clientOpId: opId.current }));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!name.trim()) return;
        create.mutate(undefined, {
          onSuccess: (id) => {
            toast({ title: t("sheets.groupNew.created"), tone: "success" });
            onDone(id);
          },
        });
      }}
    >
      <Field invalid={touched && !name.trim()}>
        <FieldLabel>{t("sheets.groupNew.name")}</FieldLabel>
        <Input dir="auto" value={name} onChange={(event) => setName(event.target.value)} />
        {touched && !name.trim() ? <FieldError>{t("sheets.groupNew.nameRequired")}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{t("sheets.groupNew.description")}</FieldLabel>
        <Textarea dir="auto" value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("sheets.groupNew.topic")}</FieldLabel>
          <Select value={topic} onValueChange={(value) => setTopic(value as GroupTopic)}>
            {TOPICS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`topics.${value}`)}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("sheets.groupNew.currency")}</FieldLabel>
          <Select value={currency} onValueChange={(value) => setCurrency(value as SocialCurrency)}>
            {CURRENCIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`currencyName.${value}`)}
              </SelectItem>
            ))}
          </Select>
          <FieldDescription>{t("sheets.groupNew.currencyHint")}</FieldDescription>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-bold text-fg">{t("sheets.groupNew.visibility")}</legend>
        <RadioGroup value={visibility} onValueChange={(value) => setVisibility(value as "private" | "discoverable")}>
          <RadioGroupItem value="private" label={t("sheets.groupNew.private")} />
          <RadioGroupItem value="discoverable" label={t("sheets.groupNew.discoverable")} />
        </RadioGroup>
      </fieldset>
      <ConnectionPicker label={t("sheets.groupNew.invite")} value={invites} onChange={setInvites} />
      {create.isError ? <InlineAlert tone="danger" title={errorText(create.error)} /> : null}
      <Actions pending={create.isPending} submit={t("sheets.groupNew.create")} onCancel={() => onDone()} />
    </form>
  );
}

function ActivityNewForm({ groupId: initialGroup, onDone }: { groupId: string | null; onDone: (activityId?: string) => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const directory = useSocialDirectory();
  const groups = directory.data?.groups ?? [];
  const [template, setTemplate] = useState<ActivityTemplate>("gathering");
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState<string>(initialGroup ?? "none");
  const [startDay, setStartDay] = useState<string | null>(getPlannerToday());
  const [endDay, setEndDay] = useState<string | null>(getPlannerToday());
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [capacity, setCapacity] = useState("");
  const [weekly, setWeekly] = useState(false);
  const [poll, setPoll] = useState(true);
  const [guests, setGuests] = useState<string[]>([]);
  const [currency, setCurrency] = useState<SocialCurrency>("toman");
  const [touched, setTouched] = useState(false);
  const opId = useRef(newClientOpId("activity"));
  const capacityNumber = capacity.trim() === "" ? null : Number(toLatinDigits(capacity.trim()));
  const capacityOk = capacityNumber === null || (Number.isSafeInteger(capacityNumber) && capacityNumber > 0);
  const timeText = toLatinDigits(time.trim());
  const timeOk = timeText === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(timeText);
  const datesOk = startDay !== null && endDay !== null && endDay >= startDay;
  const independent = groupId === "none";
  const create = useSocialMutation((repo) =>
    repo.activities.create({
      title,
      template,
      groupId: independent ? null : groupId,
      startDay: startDay!,
      endDay: endDay!,
      startTime: timeText || null,
      place,
      capacity: capacityNumber,
      recurringWeekly: template === "sport" && weekly,
      currency,
      guestIds: guests,
      withPoll: template === "gathering" && poll,
      clientOpId: opId.current,
    }),
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!title.trim() || !datesOk || !capacityOk || !timeOk) return;
        create.mutate(undefined, {
          onSuccess: (id) => {
            toast({ title: t("sheets.activityNew.created"), tone: "success" });
            onDone(id);
          },
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-bold text-fg">{t("sheets.activityNew.template")}</legend>
        <PillGroup<ActivityTemplate>
          label={t("sheets.activityNew.template")}
          value={template}
          onValueChange={(value) => {
            setTemplate(value);
            if (value !== "trip" && endDay !== startDay) setEndDay(startDay);
          }}
          options={TEMPLATES.map((value) => ({ value, label: t(`templates.${value}`) }))}
        />
        <p className="text-xs text-fg-muted">{t(`templateHints.${template}`)}</p>
      </fieldset>
      <Field invalid={touched && !title.trim()}>
        <FieldLabel>{t("sheets.activityNew.name")}</FieldLabel>
        <Input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
        {touched && !title.trim() ? <FieldError>{t("sheets.activityNew.titleRequired")}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{t("sheets.activityNew.group")}</FieldLabel>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectItem value="none">{t("sheets.activityNew.independent")}</SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </Select>
        {independent ? <FieldDescription>{t("sheets.activityNew.independentHint")}</FieldDescription> : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <DayField label={t("sheets.activityNew.start")} emptyLabel={t("sheets.activityNew.start")} value={startDay} onChange={(day) => {
          setStartDay(day);
          if (day && (template !== "trip" || (endDay !== null && endDay < day))) setEndDay(day);
        }} />
        {template === "trip" ? <DayField label={t("sheets.activityNew.end")} emptyLabel={t("sheets.activityNew.end")} value={endDay} onChange={setEndDay} /> : null}
      </div>
      {touched && !datesOk ? <p className="text-xs font-semibold text-danger-text">{t("sheets.activityNew.datesInvalid")}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field invalid={touched && !timeOk}>
          <FieldLabel>{t("sheets.activityNew.time")}</FieldLabel>
          <Input dir="ltr" inputMode="numeric" placeholder="18:00" className="tabular" value={time} onChange={(event) => setTime(event.target.value)} />
        </Field>
        <Field invalid={touched && !capacityOk}>
          <FieldLabel>{t("sheets.activityNew.capacity")}</FieldLabel>
          <Input dir="ltr" inputMode="numeric" className="tabular" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
          {touched && !capacityOk ? <FieldError>{t("sheets.activityNew.capacityInvalid")}</FieldError> : <FieldDescription>{t("sheets.activityNew.capacityHint")}</FieldDescription>}
        </Field>
      </div>
      <Field>
        <FieldLabel>{t("sheets.activityNew.place")}</FieldLabel>
        <Input dir="auto" value={place} onChange={(event) => setPlace(event.target.value)} />
      </Field>
      {template === "sport" ? <Switch checked={weekly} onCheckedChange={setWeekly} label={t("sheets.activityNew.weekly")} /> : null}
      {template === "gathering" ? <Switch checked={poll} onCheckedChange={setPoll} label={t("sheets.activityNew.poll")} /> : null}
      {independent ? (
        <>
          <Field>
            <FieldLabel>{t("sheets.activityNew.currency")}</FieldLabel>
            <Select value={currency} onValueChange={(value) => setCurrency(value as SocialCurrency)}>
              {CURRENCIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`currencyName.${value}`)}
                </SelectItem>
              ))}
            </Select>
            <FieldDescription>{t("sheets.groupNew.currencyHint")}</FieldDescription>
          </Field>
          <ConnectionPicker label={t("sheets.activityNew.guests")} value={guests} onChange={setGuests} />
        </>
      ) : null}
      {create.isError ? <InlineAlert tone="danger" title={errorText(create.error)} /> : null}
      <Actions pending={create.isPending} submit={t("sheets.activityNew.create")} onCancel={() => onDone()} />
    </form>
  );
}

function ConnectForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Social.connections.lookup");
  const tCommon = useTranslations("Social.common");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const send = useSocialMutation((repo) => repo.connections.request(contact, note));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!contact.trim()) return;
        // Same confirmation whether or not an account exists (no discovery).
        send.mutate(undefined, { onSuccess: () => toast({ title: t("sent"), description: t("lookupNote") }) });
      }}
    >
      <Field invalid={touched && !contact.trim()}>
        <FieldLabel>{t("contact")}</FieldLabel>
        <Input dir="ltr" type="text" autoComplete="off" value={contact} onChange={(event) => setContact(event.target.value)} />
        {touched && !contact.trim() ? <FieldError>{tCommon("required")}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{t("note")}</FieldLabel>
        <Textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <p className="rounded-row bg-subtle p-3 text-sm text-fg-secondary">{t("lookupNote")}</p>
      {send.isSuccess ? <InlineAlert tone="success" title={t("sent")} description={t("lookupNote")} /> : null}
      {send.isError ? <InlineAlert tone="danger" title={send.error instanceof SocialError && send.error.code === "rate-limited" ? t("rateLimited") : tCommon("failed")} /> : null}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {tCommon("close")}
        </Button>
        <Button type="submit" disabled={send.isPending}>
          {t("send")}
        </Button>
      </div>
    </form>
  );
}

function parseScope(value: string | null): ExpenseScope | null {
  const match = /^(group|activity):(.+)$/.exec(value ?? "");
  return match ? { kind: match[1] as ExpenseScope["kind"], id: match[2]! } : null;
}

function ProposeExpense({ scopeParam, activityParam, onDone }: { scopeParam: string | null; activityParam: string | null; onDone: () => void }) {
  const scope = parseScope(scopeParam);
  const group = useGroupAccess(scope?.kind === "group" ? scope.id : undefined);
  const activity = useActivity(scope?.kind === "activity" ? scope.id : undefined);
  const groupActivities = useActivities("all", scope?.kind === "group" ? scope.id : undefined);
  if (!scope) return null;
  const currency = scope.kind === "group" ? (group.data?.kind === "member" ? group.data.group.currency : null) : (activity.data?.currency ?? null);
  if (!currency) return null;
  const activities = scope.kind === "group" ? (groupActivities.data ?? []).filter((a) => a.group?.id === scope.id).map((a) => ({ id: a.id, title: a.title })) : [];
  return <ExpenseForm mode={{ kind: "propose", scope, activities, defaultActivityId: activityParam }} currency={currency} onDone={onDone} />;
}

function ThingNewForm({ groupId, onDone }: { groupId: string | null; onDone: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ThingCategory>("outdoor");
  const [condition, setCondition] = useState("");
  const [notes, setNotes] = useState("");
  const [owner, setOwner] = useState<"mine" | "group">("mine");
  const [touched, setTouched] = useState(false);
  const add = useSocialMutation((repo) => repo.lending.addThing({ name, category, condition, notes, groupId: owner === "group" ? groupId : null }));
  const share = useSocialMutation((repo, id: string) => (groupId ? repo.lending.share(id, groupId, true) : Promise.resolve()));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!name.trim()) return;
        add.mutate(undefined, {
          onSuccess: (id) => {
            if (owner === "mine" && groupId) share.mutate(id);
            toast({ title: t("sheets.thingNew.done"), tone: "success" });
            onDone();
          },
        });
      }}
    >
      <Field invalid={touched && !name.trim()}>
        <FieldLabel>{t("sheets.thingNew.name")}</FieldLabel>
        <Input dir="auto" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t("sheets.thingNew.category")}</FieldLabel>
        <Select value={category} onValueChange={(value) => setCategory(value as ThingCategory)}>
          {CATEGORIES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`categories.${value}`)}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel>{t("sheets.thingNew.condition")}</FieldLabel>
        <Input dir="auto" value={condition} onChange={(event) => setCondition(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t("sheets.thingNew.notes")}</FieldLabel>
        <Textarea dir="auto" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <FieldDescription>{t("lending.placeHint")}</FieldDescription>
      </Field>
      {groupId ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-bold text-fg">{t("sheets.thingNew.owner")}</legend>
          <RadioGroup value={owner} onValueChange={(value) => setOwner(value as "mine" | "group")}>
            <RadioGroupItem value="mine" label={t("sheets.thingNew.mine")} />
            <RadioGroupItem value="group" label={t("sheets.thingNew.group")} />
          </RadioGroup>
        </fieldset>
      ) : null}
      {add.isError ? <InlineAlert tone="danger" title={errorText(add.error)} /> : null}
      <Actions pending={add.isPending} submit={t("sheets.thingNew.submit")} onCancel={onDone} />
    </form>
  );
}

function LendForm({ thingId, onDone }: { thingId: string | null; onDone: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const things = useMyThings();
  const connections = useConnections();
  const available = (things.data ?? []).filter((thing) => thing.activeLoanId === null);
  const [thing, setThing] = useState(thingId ?? "");
  const [to, setTo] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [place, setPlace] = useState("");
  const [touched, setTouched] = useState(false);
  const lend = useSocialMutation((repo) => repo.lending.lendTo(thing, to, due!, place));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!thing || !to || !due) return;
        lend.mutate(undefined, {
          onSuccess: () => {
            toast({ title: t("sheets.lend.done"), tone: "success" });
            onDone();
          },
        });
      }}
    >
      <Field invalid={touched && !thing}>
        <FieldLabel>{t("sheets.lend.thing")}</FieldLabel>
        <Select value={thing} onValueChange={setThing} placeholder={t("sheets.lend.thing")}>
          {available.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Field invalid={touched && !to}>
        <FieldLabel>{t("sheets.lend.to")}</FieldLabel>
        <Select value={to} onValueChange={setTo} placeholder={t("sheets.lend.to")}>
          {(connections.data ?? []).map((c) => (
            <SelectItem key={c.person.id} value={c.person.id}>
              {c.person.name}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <DayField label={t("sheets.lend.due")} emptyLabel={t("sheets.lend.due")} value={due} onChange={setDue} />
      {touched && !due ? <p className="text-xs font-semibold text-danger-text">{t("common.required")}</p> : null}
      <Field>
        <FieldLabel>{t("sheets.lend.place")}</FieldLabel>
        <Input dir="auto" value={place} onChange={(event) => setPlace(event.target.value)} />
        <FieldDescription>{t("sheets.lend.placeHint")}</FieldDescription>
      </Field>
      {lend.isError ? <InlineAlert tone="danger" title={errorText(lend.error)} /> : null}
      <Actions pending={lend.isPending} submit={t("sheets.lend.submit")} onCancel={onDone} />
    </form>
  );
}
