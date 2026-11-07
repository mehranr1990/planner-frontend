"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { CustomField, CustomFieldType } from "@/data/project-domain";
import { useFieldList, useSettingsActions } from "@/data/project-queries";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { DirtyBar, useReportDirty, useSettingsError } from "./settings-shared";

/*
 * PJ-14 › Fields: per-project custom fields (name, type + options, applies
 * to, required). Edits are a local draft saved with the dirty bar; the type
 * is locked once values exist; Delete asks first with the value count.
 */

type DraftField = Omit<CustomField, "id"> & { id?: string; key: string };
const TYPES: readonly CustomFieldType[] = ["text", "number", "date", "single-select", "multi-select", "person", "url", "checkbox"];

export function FieldsTab() {
  const t = useTranslations("ProjectSettings");
  const { project, capabilities } = useProject();
  const list = useFieldList(project.id);
  const actions = useSettingsActions(project.id);
  const onError = useSettingsError();
  const [draft, setDraft] = useState<DraftField[] | null>(null);
  const [editing, setEditing] = useState<DraftField | null>(null);
  const [deleting, setDeleting] = useState<DraftField | null>(null);
  const canEdit = capabilities.editWorkflow;
  const base = (list.data ?? []).map((field) => ({ ...field, key: field.id }));
  const fields = draft ?? base;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base);
  useReportDirty(dirty);

  if (!list.data) return <AccessLoading />;
  const update = (next: DraftField[]) => setDraft(next);

  return (
    <div className="flex flex-col gap-3">
      {!canEdit ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <ul className="flex flex-col gap-2">
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            canEdit={canEdit}
            onRequired={(required) => update(fields.map((item) => (item.key === field.key ? { ...item, required } : item)))}
            onEdit={() => setEditing(field)}
            onDelete={() => setDeleting(field)}
          />
        ))}
      </ul>
      {canEdit ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 self-start"
          onClick={() =>
            setEditing({ key: `new-${Date.now()}`, name: "", type: "text", appliesTo: ["tasks"], required: false, valueCount: 0 })
          }
        >
          <Icon icon={Plus} size={16} />
          {t("fields.add")}
        </Button>
      ) : null}
      <p className="text-xs font-medium text-fg-secondary">{t("fields.hint")}</p>
      {dirty ? (
        <DirtyBar
          onDiscard={() => setDraft(null)}
          saving={actions.saveFields.isPending}
          onSave={() =>
            actions.saveFields.mutate(
              fields.map((field) => ({
                id: field.id,
                name: field.name,
                type: field.type,
                options: field.options,
                min: field.min,
                max: field.max,
                appliesTo: field.appliesTo,
                required: field.required,
              })),
              {
                onSuccess: () => {
                  setDraft(null);
                  toast({ title: t("saved") });
                },
                onError,
              },
            )
          }
        />
      ) : null}
      {editing ? (
        <FieldDialog
          field={editing}
          onClose={() => setEditing(null)}
          onDone={(field) => {
            const exists = fields.some((item) => item.key === field.key);
            update(exists ? fields.map((item) => (item.key === field.key ? field : item)) : [...fields, field]);
            setEditing(null);
          }}
        />
      ) : null}
      {deleting ? (
        <Dialog open onOpenChange={(open) => !open && setDeleting(null)}>
          <DialogContent
            title={t("fields.deleteTitle", { name: deleting.name })}
            description={t("fields.deleteBody", { n: deleting.valueCount })}
            size="sm"
            data-scope="project"
          >
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                {t("fields.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const target = deleting;
                  setDeleting(null);
                  if (!target.id) {
                    update(fields.filter((item) => item.key !== target.key));
                    return;
                  }
                  actions.removeField.mutate(target.id, {
                    onSuccess: () => {
                      if (draft) setDraft(draft.filter((item) => item.key !== target.key));
                      toast({ title: t("fields.deleted") });
                    },
                    onError,
                  });
                }}
              >
                {t("fields.deleteAction")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function FieldRow({
  field,
  canEdit,
  onRequired,
  onEdit,
  onDelete,
}: {
  field: DraftField;
  canEdit: boolean;
  onRequired: (required: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("ProjectSettings.fields");
  const format = useProjectFormat();
  const detail =
    field.options && field.options.length > 0
      ? field.options.join(", ")
      : field.min !== undefined && field.max !== undefined
        ? t("range", { min: format.number(field.min), max: format.number(field.max) })
        : null;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[18px] bg-subtle px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate text-sm font-bold text-fg">{field.name}</bdi>
        <span className="truncate text-xs font-medium text-fg-secondary">
          <bdi>{[t(`type.${field.type}`), detail].filter(Boolean).join(" · ")}</bdi>
        </span>
      </span>
      <span className="text-xs font-semibold text-fg">
        {field.appliesTo.map((scope) => (scope === "tasks" ? t("appliesTasks") : t("appliesRisks"))).join(", ")}
      </span>
      <Switch
        checked={field.required}
        disabled={!canEdit}
        onCheckedChange={onRequired}
        label={t("required")}
        aria-label={t("requiredOf", { name: field.name })}
      />
      {canEdit ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" variant="ghost" label={t("menu", { name: field.name })}>
              <Icon icon={MoreHorizontal} size={16} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-scope="project">
            <DropdownMenuItem onSelect={onEdit}>{t("edit")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete}>{t("delete")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

function FieldDialog({ field, onClose, onDone }: { field: DraftField; onClose: () => void; onDone: (field: DraftField) => void }) {
  const t = useTranslations("ProjectSettings.fields");
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<CustomFieldType>(field.type);
  const [options, setOptions] = useState((field.options ?? []).join(", "));
  const [applies, setApplies] = useState<readonly ("tasks" | "risks")[]>(field.appliesTo);
  const ids = { name: useId(), type: useId(), options: useId() };
  const locked = field.valueCount > 0;
  const selectType = type === "single-select" || type === "multi-select";
  const toggle = (scope: "tasks" | "risks", on: boolean) =>
    setApplies((current) => (on ? [...new Set([...current, scope])] : current.filter((item) => item !== scope)));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={field.id ? t("edit") : t("newField")} size="sm" data-scope="project">
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor={ids.name}>{t("name")}</FieldLabel>
            <Input id={ids.name} dir="auto" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.type}>{t("typeLabel")}</FieldLabel>
            <Select id={ids.type} value={type} disabled={locked} onValueChange={(value) => setType(value as CustomFieldType)}>
              {TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`type.${value}`)}
                </SelectItem>
              ))}
            </Select>
            {locked ? <FieldDescription>{t("typeLocked")}</FieldDescription> : null}
          </Field>
          {selectType ? (
            <Field>
              <FieldLabel htmlFor={ids.options}>{t("options")}</FieldLabel>
              <Input id={ids.options} dir="auto" value={options} onChange={(event) => setOptions(event.target.value)} />
            </Field>
          ) : null}
          <div role="group" aria-label={t("applies")} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-fg">{t("applies")}</span>
            <Checkbox label={t("appliesTasks")} checked={applies.includes("tasks")} onCheckedChange={(on) => toggle("tasks", on === true)} />
            <Checkbox label={t("appliesRisks")} checked={applies.includes("risks")} onCheckedChange={(on) => toggle("risks", on === true)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!name.trim() || applies.length === 0}
            onClick={() =>
              onDone({
                ...field,
                name: name.trim(),
                type,
                appliesTo: applies,
                options: selectType
                  ? options
                      .split(/[,،]/)
                      .map((option) => option.trim())
                      .filter(Boolean)
                  : undefined,
                ...(type === "number" ? {} : { min: undefined, max: undefined }),
              })
            }
          >
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
