"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type Ref } from "react";
import type { FieldErrors, FieldValues } from "react-hook-form";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface FormErrorItem {
  /** Id of the control to jump to (a Field's controlId). */
  fieldId: string;
  message: ReactNode;
}

export interface FormErrorSummaryProps {
  errors: readonly FormErrorItem[];
  /** Defaults to "Please fix the following". */
  title?: ReactNode;
  /**
   * Moves focus to the summary whenever this changes while there are errors:
   * pass RHF's formState.submitCount so every failed submit lands here.
   */
  focusKey?: string | number;
  ref?: Ref<HTMLDivElement>;
  className?: string;
}

/**
 * Summary of form errors after a failed submit, each linking to its field.
 * It is a labelled region that receives focus (pass focusKey, or call
 * focusErrorSummary), which is what announces it; it is deliberately not
 * role="alert", which would announce it a second time. Activating a link
 * focuses and reveals the control (or, for a group such as a RadioGroup,
 * its checked or first enabled control).
 */
export function FormErrorSummary({ errors, title, focusKey, ref, className }: FormErrorSummaryProps) {
  const t = useTranslations("UI");
  const headingId = useId();
  const regionRef = useRef<HTMLDivElement | null>(null);
  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (focusKey === undefined || !hasErrors) return;
    focusErrorSummary(regionRef.current);
  }, [focusKey, hasErrors]);

  if (!hasErrors) return null;

  const jump = (event: MouseEvent<HTMLAnchorElement>, fieldId: string) => {
    const target = document.getElementById(fieldId);
    if (!target) return; // let the browser follow the fragment
    event.preventDefault();
    focusFieldTarget(target);
    target.scrollIntoView?.({ block: "center" });
  };

  return (
    <div
      ref={(node) => {
        regionRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      role="region"
      tabIndex={-1}
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-2 rounded-row bg-danger-soft p-4 text-danger-text", className)}
    >
      <h2 id={headingId} className="flex items-center gap-2 text-body font-bold">
        <Icon icon={CircleAlert} size={18} />
        {title ?? t("errorSummaryTitle")}
      </h2>
      <ul className="flex list-disc flex-col gap-1 ps-9 text-sm">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              href={`#${error.fieldId}`}
              onClick={(event) => jump(event, error.fieldId)}
              className="font-semibold underline underline-offset-2"
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NATIVE_CONTROL = "input, select, textarea, button";
const ENABLED = ":not(:disabled):not([aria-disabled=\"true\"]):not([aria-hidden=\"true\"]):not([type=\"hidden\"])";
const CHECKED_CONTROL = [`[aria-checked="true"]${ENABLED}`, `input:checked${ENABLED}`].join(", ");
const FOCUSABLE_CONTROL = [
  `input${ENABLED}`,
  `select${ENABLED}`,
  `textarea${ENABLED}`,
  `button${ENABLED}`,
  "a[href]",
  `[tabindex]:not([tabindex="-1"])${ENABLED}`,
].join(", ");

/**
 * Focuses the control behind a field id. A native control takes focus
 * itself; a container (e.g. a RadioGroup root div) hands it to its checked
 * control, else its first enabled control, else takes it itself.
 */
function focusFieldTarget(target: HTMLElement) {
  if (target.matches(NATIVE_CONTROL)) {
    target.focus();
    return;
  }
  const inner =
    target.querySelector<HTMLElement>(CHECKED_CONTROL) ?? target.querySelector<HTMLElement>(FOCUSABLE_CONTROL);
  (inner ?? target).focus();
}

/** Focuses and reveals an error summary (e.g. from a submit handler). */
export function focusErrorSummary(element: HTMLElement | null) {
  if (!element) return;
  element.focus();
  element.scrollIntoView?.({ block: "nearest" });
}

/**
 * Flattens top-level react-hook-form errors into summary items. `toId` maps a
 * field name to its control id (defaults to the name itself).
 */
export function fieldErrorsToSummary<T extends FieldValues>(
  errors: FieldErrors<T>,
  toId: (name: string) => string = (name) => name,
): FormErrorItem[] {
  return Object.entries(errors).flatMap(([name, error]) => {
    const message = error && typeof error === "object" && "message" in error ? error.message : undefined;
    return typeof message === "string" && message ? [{ fieldId: toId(name), message }] : [];
  });
}
