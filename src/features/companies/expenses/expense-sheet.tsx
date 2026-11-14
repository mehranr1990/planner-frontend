"use client";

import { Camera, FileText, MessageSquareWarning, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button, IconButton } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { CompanySummary, ExpenseCategory, ExpenseInput, ExpensePayer } from "@/data/company-domain";
import { useCompanyMutation, useCompanyProjects, useDepartments, useExpenses } from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { DayField } from "@/features/goals/goal-sheet";
import { parseLocalizedNumber } from "@/lib/locale/digits";
import { useCompanyFormat } from "../format";

/*
 * ?sheet=expense-new (CO-08 "New expense"): receipt first (drop a file or
 * take a photo), then amount (exact whole number in the company currency,
 * numeric keypad), date, category, department, optional project and who
 * paid (I paid · reimburse me / Company card). Save draft or Submit; the
 * receipt may be missing on a draft, the policy can require it to submit.
 * `expenseId` edits a draft or a changes-requested expense: resubmitting
 * restarts the chain at the step that asked (new revision, history kept).
 * Nothing is written to Personal Finance.
 */

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ["meals", "travel", "software", "equipment", "training", "other"];

export function ExpenseSheet({
  company,
  defaultDepartmentId,
  expenseId,
  onDone,
}: {
  company: CompanySummary;
  /** My first department (the form's default). */
  defaultDepartmentId?: string;
  expenseId?: string;
  onDone: () => void;
}) {
  const t = useTranslations("Company.sheets.expense");
  const tCategory = useTranslations("Company.expenses.category");
  const format = useCompanyFormat(company.currency);
  const departments = useDepartments(company.id);
  const projects = useCompanyProjects(company.id, company.role);
  const expenses = useExpenses(company.id);
  const existing = expenseId ? expenses.data?.find((item) => item.id === expenseId) : undefined;
  if (expenseId && !expenses.data) return null;
  if (expenseId && !existing) return <InlineAlert tone="warning" title={t("notEditable")} />;
  return (
    <ExpenseForm
      key={existing?.id ?? "new"}
      company={company}
      expenseId={existing?.id}
      changesNote={existing?.changesNote ?? null}
      initial={{
        title: existing?.title ?? "",
        amount: existing?.amount ?? 0,
        date: existing?.date ?? getPlannerToday(),
        category: existing?.category ?? "meals",
        departmentId: existing?.departmentId ?? defaultDepartmentId ?? company.departmentId ?? "",
        projectId: existing?.projectId ?? null,
        payer: existing?.payer ?? "me",
        receipt: existing?.receipt ?? null,
      }}
      departments={(departments.data ?? []).map((dept) => ({ id: dept.id, name: dept.name }))}
      projects={(projects.data ?? []).map((project) => ({ id: project.id, name: project.name }))}
      unit={format.unit}
      amountText={(value) => format.amount(value)}
      categoryLabel={(value) => tCategory(value)}
      onDone={onDone}
    />
  );
}

function ExpenseForm({
  company,
  expenseId,
  changesNote,
  initial,
  departments,
  projects,
  unit,
  amountText,
  categoryLabel,
  onDone,
}: {
  company: CompanySummary;
  expenseId: string | undefined;
  changesNote: { by: string; text: string } | null;
  initial: ExpenseInput;
  departments: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  unit: string;
  amountText: (value: number) => string;
  categoryLabel: (value: ExpenseCategory) => string;
  onDone: () => void;
}) {
  const t = useTranslations("Company.sheets.expense");
  const fileId = useId();
  const [title, setTitle] = useState(initial.title);
  const [amountInput, setAmountInput] = useState(initial.amount ? amountText(initial.amount) : "");
  const [date, setDate] = useState<string | null>(initial.date);
  const [category, setCategory] = useState<ExpenseCategory>(initial.category);
  const [departmentId, setDepartmentId] = useState(initial.departmentId);
  const [projectId, setProjectId] = useState(initial.projectId ?? "none");
  const [payer, setPayer] = useState<ExpensePayer>(initial.payer);
  const [receipt, setReceipt] = useState(initial.receipt);
  const [touched, setTouched] = useState(false);
  const [receiptRequired, setReceiptRequired] = useState(false);
  const save = useCompanyMutation(company.id, (repo, id, vars: { input: ExpenseInput; submit: boolean }) =>
    repo.saveExpense(id, vars.input, vars.submit, expenseId),
  );

  const parsed = parseLocalizedNumber(amountInput.replace(/[\s٬,]/g, ""));
  const amountValid = parsed !== null && Number.isInteger(parsed) && parsed > 0;
  const errors = {
    title: touched && !title.trim() ? t("titleRequired") : null,
    amount: touched && !amountValid ? t("amountInvalid") : null,
    department: touched && !departmentId ? t("departmentRequired") : null,
  };

  const run = (submit: boolean) => {
    setTouched(true);
    setReceiptRequired(false);
    if (!title.trim() || !amountValid || !departmentId || !date) return;
    save.mutate(
      {
        input: {
          title,
          amount: parsed!,
          date,
          category,
          departmentId,
          projectId: projectId === "none" ? null : projectId,
          payer,
          receipt,
        },
        submit,
      },
      {
        onSuccess: () => {
          toast({ title: submit ? t("submitted") : t("saved"), description: submit ? t("submittedBody") : undefined });
          onDone();
        },
        onError: (error) => {
          if (error instanceof RepositoryError && error.message === "receipt-required") setReceiptRequired(true);
          // Partial success: the draft exists but the receipt / submission did not go through. Say so and close (a retry here would duplicate it).
          if (error instanceof RepositoryError && error.message === "saved-as-draft") {
            toast({ title: t("savedDraftOnly"), description: t("savedDraftOnlyBody") });
            onDone();
          }
        },
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(true);
      }}
    >
      {changesNote ? (
        <InlineAlert
          tone="warning"
          icon={MessageSquareWarning}
          title={t("changesTitle")}
          description={
            <>
              <bdi>{changesNote.by}</bdi>: <bdi>{changesNote.text}</bdi> {t("changesBody")}
            </>
          }
        />
      ) : null}

      {/* Receipt first: drop a file or take a photo. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-fg">{t("receipt")}</span>
        {receipt ? (
          <div className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
            <Icon icon={FileText} size={18} className="shrink-0 text-scope-deep" />
            <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{receipt.name}</bdi>
            <IconButton icon={X} size="sm" variant="ghost" label={t("removeReceipt")} onClick={() => setReceipt(null)} />
          </div>
        ) : (
          <label
            htmlFor={fileId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) setReceipt({ name: file.name, file });
            }}
            className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-card-sm bg-[repeating-linear-gradient(135deg,var(--scope-soft)_0_8px,transparent_8px_16px)] px-4 py-4 text-sm font-bold text-scope-deep inset-ring-[1.5px] inset-ring-scope-deep focus-within:ring-2 focus-within:ring-focus"
          >
            <Icon icon={Camera} size={18} />
            {t("drop")}
            <input
              id={fileId}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setReceipt({ name: file.name, file });
              }}
            />
          </label>
        )}
        {receiptRequired ? <p className="text-xs font-semibold text-danger-text">{t("receiptRequired")}</p> : null}
      </div>

      <Field invalid={errors.title !== null}>
        <FieldLabel>{t("whatFor")}</FieldLabel>
        <Input dir="auto" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        {errors.title ? <FieldError>{errors.title}</FieldError> : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field invalid={errors.amount !== null}>
          <FieldLabel>{t("amount", { unit })}</FieldLabel>
          <Input dir="ltr" inputMode="numeric" className="tabular" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} />
          {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}
        </Field>
        <DayField label={t("date")} emptyLabel={t("date")} value={date} onChange={setDate} />
        <Field>
          <FieldLabel>{t("category")}</FieldLabel>
          <Select value={category} onValueChange={(value) => setCategory(value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {categoryLabel(value)}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field invalid={errors.department !== null}>
          <FieldLabel>{t("department")}</FieldLabel>
          <Select value={departmentId} onValueChange={setDepartmentId} placeholder={t("choose")}>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </Select>
          {errors.department ? <FieldError>{errors.department}</FieldError> : null}
        </Field>
      </div>
      <Field>
        <FieldLabel>{t("project")}</FieldLabel>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectItem value="none">{t("noProject")}</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-fg">{t("payer")}</span>
        <Segmented<ExpensePayer>
          label={t("payer")}
          value={payer}
          onValueChange={setPayer}
          options={[
            { value: "me", label: t("iPaid") },
            { value: "card", label: t("companyCard") },
          ]}
        />
      </div>
      <p className="text-xs text-fg-secondary">{t("note")}</p>
      {save.isError && !receiptRequired ? <InlineAlert tone="danger" title={t("failed")} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={save.isPending} onClick={() => run(false)}>
          {t("saveDraft")}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {changesNote ? t("resubmit") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
