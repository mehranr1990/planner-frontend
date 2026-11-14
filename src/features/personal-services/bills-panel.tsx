"use client";

import { Archive, ArchiveRestore, History, Pencil, Plus, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { REPEAT_FREQUENCIES, type Bill, type BillInput, type BillOccurrence, type RepeatRule } from "@/data/personal-services";
import { useBillHistory, useBillPreview, useBills, useBillWrite } from "@/data/personal-services-queries";
import { DayField } from "@/features/goals/goal-sheet";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { parseDecimalInput, shiftDecimal } from "@/lib/locale/decimal";
import { cn } from "@/lib/cn";
import { useRepeatText } from "./reminders-list";
import { RepeatFields } from "./repeat-fields";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Finance · Bills: list (active / archived), details with the next
 * occurrences and their payment status, version history, create / edit
 * (a new version from today) and archive. "Record payment" posts the
 * occurrence to the planner's ledger — it does not pay anyone or move money.
 */

type BillsView = "active" | "archived";
const PREVIEW_BACK_DAYS = 31;
const PREVIEW_AHEAD_DAYS = 120;
const DEFAULT_REPEAT: RepeatRule = { frequency: "monthly", interval: 1, weekdays: [], until: null, count: null };

export function BillsPanel({ today }: { today: string }) {
  const t = useTranslations("Services.bills");
  const repeatText = useRepeatText();
  const format = useServiceFormat();
  const [view, setView] = useState<BillsView>("active");
  const [form, setForm] = useState<Bill | "new" | null>(null);
  const [open, setOpen] = useState<Bill | null>(null);
  const query = useBills(view === "archived");

  return (
    <div className="flex flex-col gap-4" data-finance-bills>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PillGroup<BillsView>
          label={t("filter")}
          value={view}
          onValueChange={setView}
          options={[
            { value: "active", label: t("active") },
            { value: "archived", label: t("archived") },
          ]}
        />
        <Button size="sm" onClick={() => setForm("new")}>
          <Plus aria-hidden="true" size={16} />
          {t("new")}
        </Button>
      </div>
      {query.isPending ? (
        <LoadingState>
          <Skeleton className="h-16 rounded-row" />
        </LoadingState>
      ) : query.isError ? (
        <ErrorState variant="bare" title={t("loadError")} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState variant="bare" icon={Receipt} title={view === "active" ? t("emptyTitle") : t("emptyArchived")} description={view === "active" ? t("emptyBody") : undefined} />
      ) : (
        <ul className="flex flex-col gap-2">
          {query.data.map((bill) => (
            <li key={bill.id}>
              <button
                type="button"
                onClick={() => setOpen(bill)}
                className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-row bg-surface px-3 py-2.5 text-start inset-ring inset-ring-line hover:bg-subtle"
              >
                <span className="flex min-w-0 flex-col">
                  <bdi dir="auto" className="truncate text-sm font-bold text-fg">
                    {bill.name}
                  </bdi>
                  <span className="text-xs text-fg-muted">
                    {t("due", { day: format.day(bill.dueDay) })}
                    {bill.repeat ? ` · ${repeatText(bill.repeat)}` : ""}
                    {bill.kind === "income" ? ` · ${t("income")}` : ""}
                  </span>
                </span>
                <span className="text-sm font-bold text-fg tabular">{format.money(bill.amount, bill.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={form !== null} onOpenChange={(next) => !next && setForm(null)}>
        <DialogContent title={form === "new" ? t("newTitle") : t("editTitle")} description={form === "new" ? t("newHint") : t("editHint")} size="md">
          {form !== null ? <BillForm bill={form === "new" ? undefined : form} today={today} onDone={() => setForm(null)} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent title={open?.name ?? t("details")} description={t("detailsHint")} size="md">
          {open ? (
            <BillDetails
              bill={open}
              today={today}
              onEdit={() => {
                setForm(open);
                setOpen(null);
              }}
              onClose={() => setOpen(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BillDetails({ bill, today, onEdit, onClose }: { bill: Bill; today: string; onEdit(): void; onClose(): void }) {
  const t = useTranslations("Services.bills");
  const repeatText = useRepeatText();
  const format = useServiceFormat();
  const write = useBillWrite();
  const message = useServiceError();
  const [history, setHistory] = useState(false);
  const [paying, setPaying] = useState<BillOccurrence | null>(null);
  const from = addDaysToDay(today, -PREVIEW_BACK_DAYS);
  const preview = useBillPreview(bill.id, from, addDaysToDay(today, PREVIEW_AHEAD_DAYS));
  const versions = useBillHistory(bill.id, history);

  const archive = () =>
    write.mutate(
      { kind: "archive", bill, archived: !bill.archived, effectiveFrom: today },
      {
        onSuccess: () => {
          toast({ tone: "neutral", title: bill.archived ? t("restored") : t("archivedDone") });
          onClose();
        },
        onError: (error) => toast({ tone: "danger", title: message(error) }),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-fg-muted">{t("amount")}</dt>
          <dd className="font-bold tabular">{format.money(bill.amount, bill.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("dueDay")}</dt>
          <dd className="font-semibold">{format.day(bill.dueDay)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("repeat")}</dt>
          <dd className="font-semibold">{bill.repeat ? repeatText(bill.repeat) : t("once")}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("since")}</dt>
          <dd className="font-semibold">{format.day(bill.effectiveFrom)}</dd>
        </div>
      </dl>
      <section aria-labelledby="bill-occurrences" className="flex flex-col gap-2">
        <h3 id="bill-occurrences" className="text-sm font-bold text-fg">
          {t("occurrences")}
        </h3>
        {preview.isPending ? (
          <LoadingState>
            <Skeleton className="h-10 rounded-row" />
          </LoadingState>
        ) : preview.isError ? (
          <ErrorState variant="bare" title={t("previewError")} onRetry={() => void preview.refetch()} />
        ) : preview.data.length === 0 ? (
          <p className="text-xs text-fg-muted">{t("noOccurrences")}</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {preview.data.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-row bg-subtle px-3 py-1.5 text-sm">
                <span className="flex flex-col">
                  <span className="font-semibold">{format.day(item.dueDay)}</span>
                  <span className={cn("text-xs", item.state === "paid" ? "text-scope-deep" : item.state === "unpaid" && item.dueDay < today ? "text-danger-text" : "text-fg-muted")}>
                    {t(`state.${item.state}`)}
                    {item.state === "unpaid" && item.dueDay < today ? ` · ${t("overdue")}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs tabular">{format.money(item.amount, item.currency)}</span>
                  {item.state === "unpaid" && !bill.archived ? (
                    <Button size="sm" variant="secondary" disabled={write.isPending} onClick={() => setPaying(item)}>
                      {t("recordPayment")}
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-col gap-2">
        <Button size="sm" variant="ghost" className="self-start" aria-expanded={history} onClick={() => setHistory((next) => !next)}>
          <History aria-hidden="true" size={16} />
          {t("history")}
        </Button>
        {history ? (
          versions.isPending ? (
            <LoadingState>
              <Skeleton className="h-10 rounded-row" />
            </LoadingState>
          ) : versions.isError ? (
            <ErrorState variant="bare" title={t("historyError")} onRetry={() => void versions.refetch()} />
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {versions.data.map((version) => (
                <li key={`${version.effectiveFrom}-${version.amount}-${version.name}`} className="flex flex-wrap justify-between gap-2 rounded-row bg-subtle px-3 py-1.5">
                  <span>
                    {t("versionFrom", { day: format.day(version.effectiveFrom) })}
                    {version.current ? ` · ${t("current")}` : ""}
                    {version.archived ? ` · ${t("archivedState")}` : ""}
                  </span>
                  <span className="text-fg-secondary">
                    <bdi dir="auto">{version.name}</bdi> · {format.money(version.amount, version.currency)} · {format.day(version.dueDay)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={archive} loading={write.isPending && write.variables?.kind === "archive"}>
          {bill.archived ? <ArchiveRestore aria-hidden="true" size={16} /> : <Archive aria-hidden="true" size={16} />}
          {bill.archived ? t("restore") : t("archive")}
        </Button>
        {bill.archived ? null : (
          <Button onClick={onEdit}>
            <Pencil aria-hidden="true" size={16} />
            {t("edit")}
          </Button>
        )}
      </DialogFooter>
      <ConfirmDialog
        open={paying !== null}
        onOpenChange={(next) => !next && setPaying(null)}
        title={t("payTitle")}
        description={paying ? t("payBody", { day: format.day(paying.dueDay), amount: format.money(paying.amount, paying.currency) }) : ""}
        confirmLabel={t("recordPayment")}
        onConfirm={() => {
          if (!paying) return;
          write.mutate(
            { kind: "pay", bill, occurrenceKey: paying.key },
            { onSuccess: () => toast({ tone: "success", title: t("paid") }), onError: (error) => toast({ tone: "danger", title: message(error) }) },
          );
        }}
      />
    </div>
  );
}

function BillForm({ bill, today, onDone }: { bill?: Bill; today: string; onDone(): void }) {
  const t = useTranslations("Services.bills");
  const format = useServiceFormat();
  const write = useBillWrite();
  const message = useServiceError();
  const ids = { name: useId(), amount: useId() };
  const toman = format.currency === "toman";
  const [name, setName] = useState(bill?.name ?? "");
  const [kind, setKind] = useState<BillInput["kind"]>(bill?.kind ?? "expense");
  const [amount, setAmount] = useState(bill && bill.currency === "IRR" ? format.editable(bill.amount) : "");
  const [dueDay, setDueDay] = useState(bill?.dueDay ?? today);
  const [repeats, setRepeats] = useState(bill ? bill.repeat !== null : true);
  const [repeat, setRepeat] = useState<RepeatRule>(bill?.repeat ?? DEFAULT_REPEAT);
  const [submitted, setSubmitted] = useState(false);
  const typed = parseDecimalInput(amount, toman ? 5 : 4);
  const amountRial = typed === null ? null : toman ? shiftDecimal(typed, 1) : typed;
  const foreign = bill !== undefined && bill.currency !== "IRR";
  const errors = {
    name: name.trim() ? null : t("errors.name"),
    amount: foreign || amountRial !== null ? null : t("errors.amount"),
    weekdays: repeats && repeat.frequency === "weekdays" && repeat.weekdays.length === 0 ? t("errors.weekdays") : null,
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    const input: BillInput = { name: name.trim(), kind, amountRial: amountRial ?? "0", dueDay, repeat: repeats ? repeat : null };
    let next: Parameters<typeof write.mutate>[0];
    if (!bill) next = { kind: "create", input };
    else {
      const patch: Partial<BillInput> = {};
      if (input.name !== bill.name) patch.name = input.name;
      if (!foreign && amountRial !== bill.amount) patch.amountRial = input.amountRial;
      if (dueDay !== bill.dueDay) patch.dueDay = dueDay;
      if (JSON.stringify(input.repeat) !== JSON.stringify(bill.repeat)) patch.repeat = input.repeat;
      next = { kind: "update", bill, patch, effectiveFrom: today };
    }
    write.mutate(next, {
      onSuccess: () => {
        toast({ tone: "success", title: bill ? t("saved") : t("created") });
        onDone();
      },
      onError: (error) => toast({ tone: "danger", title: message(error) }),
    });
  };
  const show = (error: string | null) => (submitted && error ? <p className="text-xs font-semibold text-danger-text">{error}</p> : null);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.name} className="text-sm font-bold text-fg">
          {t("name")}
        </label>
        <Input id={ids.name} dir="auto" maxLength={300} value={name} invalid={submitted && !!errors.name} onChange={(event) => setName(event.target.value)} />
        {show(errors.name)}
      </div>
      {bill ? null : (
        <Segmented<BillInput["kind"]>
          label={t("kind")}
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "expense", label: t("expense") },
            { value: "income", label: t("income") },
          ]}
        />
      )}
      {foreign ? (
        <p className="text-xs text-fg-muted">{t("foreignAmount", { amount: format.money(bill.amount, bill.currency) })}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.amount} className="text-sm font-bold text-fg">
            {t("amountIn", { unit: format.unit })}
          </label>
          <Input id={ids.amount} inputMode="decimal" dir="ltr" value={amount} invalid={submitted && !!errors.amount} onChange={(event) => setAmount(event.target.value)} className="w-48" />
          {show(errors.amount)}
        </div>
      )}
      <DayField label={t("dueDay")} emptyLabel={t("dueDay")} value={dueDay} onChange={(day) => day && setDueDay(day)} />
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-fg">
        {t("repeats")}
        <Switch checked={repeats} onCheckedChange={setRepeats} />
      </label>
      {repeats ? (
        <>
          <RepeatFields value={repeat} onChange={setRepeat} frequencies={[...REPEAT_FREQUENCIES]} />
          {show(errors.weekdays)}
        </>
      ) : null}
      {bill ? <p className="text-xs text-fg-muted">{t("versionNote", { day: format.day(today) })}</p> : null}
      <p className="text-xs text-fg-muted">{t("noTransfer")}</p>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={write.isPending}>
          {bill ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

