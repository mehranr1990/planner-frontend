"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type AriaAttributes,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/*
 * Field = label + control + description + error, wired for assistive tech.
 * The Field generates ids; controls read them through useFieldControl(), so
 * <Field><FieldLabel/><Input/><FieldError/></Field> needs no manual ids.
 * Every control also works on its own, without a Field.
 */

type FieldPart = "description" | "error";

interface FieldContextValue {
  controlId: string;
  labelId: string;
  descriptionId: string;
  errorId: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  hasDescription: boolean;
  hasError: boolean;
  setPart: (part: FieldPart, present: boolean) => void;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** The surrounding Field, or null when a control is used on its own. */
export function useField(): FieldContextValue | null {
  return use(FieldContext);
}

export interface FieldProps extends ComponentProps<"div"> {
  /** Id for the control (e.g. an RHF field name). Generated when omitted. */
  controlId?: string;
  /** Defaults to true whenever a non-empty <FieldError> is rendered. */
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}

export function Field({
  controlId,
  invalid,
  required = false,
  disabled = false,
  readOnly = false,
  className,
  children,
  ...props
}: FieldProps) {
  const autoId = useId();
  const [parts, setParts] = useState({ description: false, error: false });

  const setPart = useCallback((part: FieldPart, present: boolean) => {
    setParts((current) => (current[part] === present ? current : { ...current, [part]: present }));
  }, []);

  const value = useMemo<FieldContextValue>(() => {
    const base = controlId ?? `${autoId}control`;
    return {
      controlId: base,
      labelId: `${base}-label`,
      descriptionId: `${base}-description`,
      errorId: `${base}-error`,
      invalid: invalid ?? parts.error,
      required,
      disabled,
      readOnly,
      hasDescription: parts.description,
      hasError: parts.error,
      setPart,
    };
  }, [autoId, controlId, invalid, required, disabled, readOnly, parts, setPart]);

  return (
    <FieldContext value={value}>
      <div
        className={cn("flex flex-col gap-1.5", className)}
        data-invalid={value.invalid || undefined}
        data-disabled={disabled || undefined}
        {...props}
      >
        {children}
      </div>
    </FieldContext>
  );
}

export interface FieldControlInput {
  id?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-required"?: AriaAttributes["aria-required"];
}

export interface FieldControlProps {
  id: string | undefined;
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  invalid: boolean;
  required: boolean;
  /** For group controls (radio group) that are named by aria-labelledby. */
  labelId: string | undefined;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true | undefined;
}

function isAriaTrue(value: AriaAttributes["aria-invalid"] | AriaAttributes["aria-required"]) {
  return value !== undefined && value !== false && value !== "false";
}

/**
 * Merges a control's own props with the surrounding Field: id, described-by
 * (description + error), invalid, required and disabled. Explicit props win.
 */
export function useFieldControl(props: FieldControlInput): FieldControlProps {
  const field = useField();
  const invalid =
    props.invalid ?? (props["aria-invalid"] !== undefined ? isAriaTrue(props["aria-invalid"]) : (field?.invalid ?? false));
  const required =
    props.required ?? (props["aria-required"] !== undefined ? isAriaTrue(props["aria-required"]) : (field?.required ?? false));
  const describedBy = [
    props["aria-describedby"],
    field?.hasDescription ? field.descriptionId : undefined,
    field?.hasError ? field.errorId : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: props.id ?? field?.controlId,
    disabled: props.disabled ?? (field?.disabled || undefined),
    readOnly: props.readOnly ?? (field?.readOnly || undefined),
    invalid,
    required,
    labelId: field?.labelId,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": invalid || undefined,
    "aria-required": required || undefined,
  };
}

export interface FieldLabelProps extends ComponentProps<"label"> {
  /**
   * "required" shows a visual marker (screen readers get aria-required from
   * the control); "optional" is spoken. Defaults to required when the Field is.
   */
  marker?: "required" | "optional" | "none";
  /** Muted trailing context, e.g. "Toman" in "Amount · Toman". */
  hint?: ReactNode;
}

export function FieldLabel({ marker, hint, className, children, htmlFor, id, ...props }: FieldLabelProps) {
  const field = useField();
  const t = useTranslations("Common");
  const resolved = marker ?? (field?.required ? "required" : "none");

  return (
    <label
      htmlFor={htmlFor ?? field?.controlId}
      id={id ?? field?.labelId}
      className={cn(
        "text-[0.8125rem] font-semibold leading-normal text-fg",
        field?.disabled && "text-fg-muted",
        className,
      )}
      {...props}
    >
      {children}
      {hint ? <span className="font-medium text-fg-muted"> · {hint}</span> : null}
      {resolved === "required" ? (
        <span aria-hidden="true" className="font-medium text-fg-muted">
          {" "}
          · {t("required")}
        </span>
      ) : null}
      {resolved === "optional" ? <span className="font-medium text-fg-muted"> · {t("optional")}</span> : null}
    </label>
  );
}

function hasContent(node: ReactNode): boolean {
  return node !== null && node !== undefined && node !== false && node !== "";
}

export function FieldDescription({ className, id, children, ...props }: ComponentProps<"p">) {
  const field = useField();
  const setPart = field?.setPart;
  const present = hasContent(children);

  useEffect(() => {
    if (!setPart) return;
    setPart("description", present);
    return () => setPart("description", false);
  }, [setPart, present]);

  if (!present) return null;
  return (
    <p id={id ?? field?.descriptionId} className={cn("text-xs text-fg-muted", className)} {...props}>
      {children}
    </p>
  );
}

/**
 * Validation message. The live region stays mounted (polite) so a message
 * that appears or changes is announced; it is linked to the control through
 * aria-describedby only while it has content.
 */
export function FieldError({ className, id, children, ...props }: ComponentProps<"p">) {
  const field = useField();
  const setPart = field?.setPart;
  const present = hasContent(children);

  useEffect(() => {
    if (!setPart) return;
    setPart("error", present);
    return () => setPart("error", false);
  }, [setPart, present]);

  return (
    <p
      id={id ?? field?.errorId}
      aria-live="polite"
      className={cn(
        "flex items-start gap-1.5 text-xs font-semibold text-danger-text empty:sr-only",
        className,
      )}
      {...props}
    >
      {present ? (
        <>
          <Icon icon={CircleAlert} size={14} className="mt-px" />
          <span>{children}</span>
        </>
      ) : null}
    </p>
  );
}
