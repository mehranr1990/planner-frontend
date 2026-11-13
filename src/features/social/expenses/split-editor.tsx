"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import type { SocialCurrency, SocialPerson } from "@/data/social-domain";
import { computeSplit, PERCENT_SCALE, SPLIT_METHODS, type SplitMethod, type SplitResult, type SplitSpec } from "@/data/social-money";
import { formatNumber, toLatinDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { minorToInput, parseMinor, useSocialFormat } from "../format";

/*
 * Split editor (SO-08): Equal · Fixed · Percent · Weighted · Selected. Inputs
 * stay as typed text; the spec handed to the server holds exact integers
 * (fixed = minor units, percent = basis points, weighted = whole weights).
 * Live "sum matches" check; the remainder of an integer split goes to the
 * payer first, then in member order, and is shown. Save stays disabled until
 * the split is valid (the caller reads `result.error`).
 */

export interface SplitDraft {
  method: SplitMethod;
  /** "selected": who takes part (member order is kept from `people`). */
  selected: string[];
  /** Raw text per person for fixed / percent / weighted. */
  inputs: Record<string, string>;
}

export function initialDraft(people: readonly SocialPerson[], spec?: SplitSpec, currency?: SocialCurrency): SplitDraft {
  if (!spec) return { method: "equal", selected: people.map((p) => p.id), inputs: {} };
  const inputs: Record<string, string> = {};
  for (const [id, value] of Object.entries(spec.values ?? {})) {
    inputs[id] = spec.method === "fixed" && currency ? minorToInput(value, currency) : spec.method === "percent" ? String(value / 100) : String(value);
  }
  return { method: spec.method, selected: [...spec.participants], inputs };
}

/** Parses "33.34" → 3334 basis points (at most two decimals). */
function parsePercent(text: string): number | null {
  const clean = toLatinDigits(text).replace("٫", ".").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole = "0", frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** The spec for the server, or null while an input can't be read. */
export function draftToSpec(draft: SplitDraft, people: readonly SocialPerson[], currency: SocialCurrency): SplitSpec | null {
  const order = people.map((p) => p.id);
  if (draft.method === "equal") return { method: "equal", participants: order };
  if (draft.method === "selected") return { method: "selected", participants: order.filter((id) => draft.selected.includes(id)) };
  const values: Record<string, number> = {};
  const participants: string[] = [];
  for (const id of order) {
    const raw = (draft.inputs[id] ?? "").trim();
    if (raw === "") {
      if (draft.method === "weighted") {
        values[id] = 1;
        participants.push(id);
      }
      continue;
    }
    const parsed = draft.method === "fixed" ? parseMinor(raw, currency) : draft.method === "percent" ? parsePercent(raw) : /^\d+$/.test(toLatinDigits(raw)) ? Number(toLatinDigits(raw)) : null;
    if (parsed === null) return null;
    if (parsed === 0 && draft.method !== "weighted") continue;
    values[id] = parsed;
    participants.push(id);
  }
  return { method: draft.method, participants, values };
}

export function SplitEditor({
  amount,
  currency,
  people,
  draft,
  onChange,
  result,
}: {
  amount: number | null;
  currency: SocialCurrency;
  people: readonly SocialPerson[];
  draft: SplitDraft;
  onChange: (draft: SplitDraft) => void;
  result: SplitResult | null;
}) {
  const t = useTranslations("Social.split");
  const tCommon = useTranslations("Social.common");
  const format = useSocialFormat();
  const statusId = useId();
  const shareOf = (id: string) => result?.shares.find((s) => s.personId === id);
  const nameOf = (id: string) => (id === "me" ? tCommon("you") : (people.find((p) => p.id === id)?.name ?? id));
  const valueKind = draft.method === "fixed" ? format.unit(currency) : draft.method === "percent" ? t("percentSuffix") : "×";

  const status = (() => {
    if (!result || amount === null) return null;
    if (result.error === "no-participants") return { ok: false, text: t("noParticipants") };
    if (result.error === "sum-mismatch" || result.error === "invalid-value") {
      const show = (n: number) => (draft.method === "fixed" ? format.plain(n, currency) : `${formatNumber(n / 100, format.digits)}${t("percentSuffix")}`);
      return { ok: false, text: result.expected !== null ? t("sumOff", { entered: show(result.entered), expected: show(result.expected) }) : t("noParticipants") };
    }
    if (result.error) return null;
    return { ok: true, text: t("sumMatches") };
  })();
  const remainderNames = result && result.remainder > 0 ? result.shares.filter((s) => s.extra > 0).map((s) => nameOf(s.personId)).join(format.locale === "fa" ? "، " : ", ") : "";

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={statusId}>
      <legend className="mb-2 text-sm font-bold text-fg">{t("label")}</legend>
      <PillGroup<SplitMethod>
        label={t("label")}
        value={draft.method}
        onValueChange={(method) => onChange({ ...draft, method, inputs: method === draft.method ? draft.inputs : {} })}
        options={SPLIT_METHODS.map((m) => ({ value: m, label: t(m) }))}
      />
      <ul className="flex flex-col gap-1.5">
        {people.map((person) => {
          const share = shareOf(person.id);
          const included = draft.method !== "selected" || draft.selected.includes(person.id);
          return (
            <li key={person.id} className={cn("flex min-h-12 items-center gap-3 rounded-row bg-subtle px-3 py-1.5", !included && "opacity-60")}>
              {draft.method === "selected" ? (
                <Checkbox
                  checked={included}
                  onCheckedChange={(checked) =>
                    onChange({ ...draft, selected: checked === true ? [...draft.selected, person.id] : draft.selected.filter((id) => id !== person.id) })
                  }
                  label={<bdi className="text-sm font-semibold">{nameOf(person.id)}</bdi>}
                  wrapperClassName="min-w-0 flex-1"
                />
              ) : (
                <bdi className="min-w-0 flex-1 truncate text-sm font-semibold">{nameOf(person.id)}</bdi>
              )}
              {draft.method === "fixed" || draft.method === "percent" || draft.method === "weighted" ? (
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  aria-label={t("valueLabel", { name: nameOf(person.id), kind: valueKind })}
                  placeholder={draft.method === "weighted" ? "1" : "0"}
                  value={draft.inputs[person.id] ?? ""}
                  onChange={(event) => onChange({ ...draft, inputs: { ...draft.inputs, [person.id]: event.target.value } })}
                  className="h-10 w-28 text-end tabular"
                />
              ) : null}
              <span className="w-32 shrink-0 text-end text-sm font-bold text-fg tabular">
                {share && included ? format.plain(share.amount, currency) : "—"}
                {share && share.extra > 0 ? <span className="ms-1 text-xs font-semibold text-scope-deep">+{format.plain(share.extra, currency)}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div id={statusId} role="status" className="flex flex-col gap-1 text-xs">
        {status ? (
          <p className={cn("flex items-center gap-1.5 font-bold", status.ok ? "text-success-text" : "text-danger-text")}>
            <Icon icon={status.ok ? CircleCheck : TriangleAlert} size={14} />
            {status.text}
            {status.ok && result ? <span className="font-semibold text-fg-secondary">· {result.remainder > 0 ? t("remainderTo", { n: format.plain(result.remainder, currency), names: remainderNames }) : t("remainder", { n: format.plain(0, currency) })}</span> : null}
          </p>
        ) : null}
        <p className="text-fg-muted">{t("remainderRule")}</p>
      </div>
    </fieldset>
  );
}

/** Live split preview for a draft. */
export function previewSplit(amount: number | null, draft: SplitDraft, people: readonly SocialPerson[], currency: SocialCurrency, payerId: string): SplitResult | null {
  if (amount === null) return null;
  const spec = draftToSpec(draft, people, currency);
  if (!spec) return { shares: [], remainder: 0, entered: 0, expected: draft.method === "percent" ? PERCENT_SCALE : draft.method === "fixed" ? amount : null, error: "invalid-value" };
  return computeSplit(amount, spec, payerId);
}
