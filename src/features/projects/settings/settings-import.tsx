"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { ImportDryRun, ImportInspection, ImportRowError, ImportTarget } from "@/data/project-domain";
import { useImportConfig, useProjectWorkflow, useSettingsActions } from "@/data/project-queries";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { downloadText, useSettingsError } from "./settings-shared";

/*
 * PJ-14 › Import (Manager+): CSV only, stepper Upload → Map columns → Dry
 * run (changes nothing) → Import valid rows in one batch, with the server's
 * Undo window (DECISIONS proposed 10 minutes, shown on the board). Result
 * tiles rows read / ready / with errors, an error table and a downloadable
 * error report. Phones: allowed, "desktop recommended".
 */

const TARGETS: readonly ImportTarget[] = ["title", "status", "assignee", "due", "estimate"];
type Step = "upload" | "map" | "dryRun" | "import";
type Mapping = Record<ImportTarget, number | null>;
const NONE = "none";

export function ImportTab({ phone }: { phone: boolean }) {
  const t = useTranslations("ProjectSettings");
  const format = useProjectFormat();
  const { project, capabilities } = useProject();
  const actions = useSettingsActions(project.id);
  const config = useImportConfig(project.id);
  const workflow = useProjectWorkflow(project.id);
  const onError = useSettingsError();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [result, setResult] = useState<ImportDryRun | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setInspection(null);
    setMapping(null);
    setResult(null);
  };

  const problem = (error: ImportRowError) =>
    t(`import.problem.${error.problem}`, { value: error.value, n: format.number(workflow.data?.version ?? 0) });

  if (!capabilities.importCsv) return <InlineAlert tone="info" title={t("readOnly")} />;
  const steps: Step[] = ["upload", "map", "dryRun", "import"];
  const stepIndex = steps.indexOf(step);

  return (
    <div className="flex flex-col gap-4">
      {phone ? <InlineAlert tone="info" title={t("phoneImport")} /> : null}
      <ol aria-label={t("import.steps")} className="flex flex-wrap items-center gap-4">
        {steps.map((value, index) => (
          <li key={value} aria-current={value === step ? "step" : undefined} className="flex items-center gap-2 text-xs font-semibold">
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full tabular",
                index <= stepIndex ? "bg-primary text-on-accent" : "bg-raised text-fg-secondary",
              )}
            >
              {format.number(index + 1)}
            </span>
            <span className={value === step ? "font-bold text-fg" : "text-fg-secondary"}>{t(`import.step.${value}`)}</span>
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <div className="flex flex-col items-start gap-2 rounded-[20px] border-[1.5px] border-dashed border-outline p-5">
          <Button className="gap-2" onClick={() => input.current?.click()}>
            <Icon icon={Upload} size={16} />
            {t("import.choose")}
          </Button>
          <p className="text-xs font-medium text-fg-secondary">{t("import.csvOnly")}</p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            hidden
            aria-label={t("import.choose")}
            onChange={async (event) => {
              const picked = event.target.files?.[0];
              event.target.value = "";
              if (!picked) return;
              try {
                const csv = await picked.text();
                const inspected = await actions.importInspect(csv);
                setFile({ name: picked.name, csv });
                setInspection(inspected);
                setMapping({ ...inspected.suggested });
                setStep("map");
              } catch (error) {
                onError(error);
              }
            }}
          />
        </div>
      ) : null}

      {step === "map" && inspection && mapping && file ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-fg">
            <bdi>{t("import.rows", { n: inspection.rowCount, file: file.name })}</bdi>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TARGETS.map((target) => (
              <label key={target} className="flex items-center justify-between gap-3 rounded-[16px] bg-subtle px-3 py-2 text-sm font-semibold text-fg">
                {t(`import.target.${target}`)}
                <Select
                  aria-label={t(`import.target.${target}`)}
                  value={mapping[target] === null ? NONE : String(mapping[target])}
                  onValueChange={(value) => setMapping({ ...mapping, [target]: value === NONE ? null : Number(value) })}
                  className="h-9 w-44 bg-surface"
                >
                  <SelectItem value={NONE}>{t("import.notMapped")}</SelectItem>
                  {inspection.headers.map((header, index) => (
                    <SelectItem key={`${header}-${index}`} value={String(index)}>
                      {header}
                    </SelectItem>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          {mapping.title === null ? <p className="text-xs font-semibold text-danger-text">{t("import.titleNeeded")}</p> : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset}>
              {t("import.back")}
            </Button>
            <Button
              disabled={mapping.title === null}
              onClick={async () => {
                try {
                  setResult(await actions.importDryRun(file.csv, mapping));
                  setStep("dryRun");
                } catch (error) {
                  onError(error);
                }
              }}
            >
              {t("import.dryRun")}
            </Button>
          </div>
        </div>
      ) : null}

      {(step === "dryRun" || step === "import") && result && file && mapping ? (
        <div className="flex flex-col gap-3">
          <ul className="grid gap-2 sm:grid-cols-3">
            <li className="flex flex-col rounded-[18px] bg-subtle p-4">
              <span className="text-2xl font-bold text-fg tabular">{format.number(result.rowsRead)}</span>
              <span className="text-xs font-semibold text-fg-secondary">{t("import.rowsRead")}</span>
            </li>
            <li className="flex flex-col rounded-[18px] bg-scope-soft p-4 text-scope-deep">
              <span className="text-2xl font-bold tabular">{format.number(result.ready)}</span>
              <span className="text-xs font-semibold">{t("import.ready")}</span>
            </li>
            <li className="flex flex-col rounded-[18px] bg-danger-soft p-4 text-danger-text">
              <span className="text-2xl font-bold tabular">{format.number(new Set(result.errors.map((error) => error.row)).size)}</span>
              <span className="text-xs font-semibold">{t("import.withErrors")}</span>
            </li>
          </ul>
          {result.errors.length > 0 ? (
            <div className="overflow-x-auto rounded-[18px] bg-surface inset-ring inset-ring-outline">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-fg-secondary">
                    <th scope="col" className="px-3 py-2 text-start font-semibold">{t("import.row")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">{t("import.column")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">{t("import.problemLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((error) => (
                    <tr key={`${error.row}-${error.column}`} className="border-t border-hairline">
                      <td className="px-3 py-2 tabular">{format.number(error.row)}</td>
                      <td className="px-3 py-2">{t(`import.target.${error.column}`)}</td>
                      <td className="px-3 py-2">
                        <bdi>{problem(error)}</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {result.errors.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadText(
                    `${project.key}-import-errors.csv`,
                    ["row,column,problem", ...result.errors.map((error) => `${error.row},${error.column},"${problem(error).replace(/"/g, '""')}"`)].join("\n"),
                  )
                }
              >
                {t("import.report")}
              </Button>
            ) : null}
            {step === "dryRun" ? (
              <Button
                disabled={result.ready === 0 || actions.importCommit.isPending}
                onClick={() =>
                  actions.importCommit.mutate(
                    { csv: file.csv, mapping },
                    {
                      onSuccess: (done) => {
                        setStep("import");
                        toast({
                          title: t("import.done", { n: done.created }),
                          action: {
                            label: t("import.undo"),
                            altText: t("import.undo"),
                            onClick: () =>
                              actions.importUndo.mutate(done.batchId, { onSuccess: () => toast({ title: t("import.undone") }), onError }),
                          },
                        });
                      },
                      onError,
                    },
                  )
                }
              >
                {t("import.commit", { n: result.ready })}
              </Button>
            ) : (
              <Button variant="secondary" onClick={reset}>
                {t("import.again")}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {config.data ? (
        <p className="text-xs font-medium text-fg-secondary">{t("import.note", { minutes: format.number(config.data.undoMinutes) })}</p>
      ) : null}
    </div>
  );
}
