"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ApiHttpError, ApiNetworkError } from "@/api/errors";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { cn } from "@/lib/cn";

/*
 * Shared pieces of the auth screens. Auth pages are form groups, so they sit
 * on one quiet Utility card (never notched) centred on the canvas. Errors map
 * HTTP status → copy; server message text is never shown, only its requestId.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldProblem = "required" | "email" | "passwordLength" | "mismatch";

export function checkEmail(value: string): FieldProblem | null {
  if (!value.trim()) return "required";
  return EMAIL_PATTERN.test(value.trim()) ? null : "email";
}

export function checkPassword(value: string): FieldProblem | null {
  if (!value) return "required";
  return value.length < PASSWORD_MIN || value.length > PASSWORD_MAX ? "passwordLength" : null;
}

export type AuthErrorKind = "offline" | "rateLimited" | "invalid" | "unauthorized" | "forbidden" | "generic";

export interface AuthProblem {
  kind: AuthErrorKind;
  requestId?: string;
}

export function toAuthProblem(error: unknown): AuthProblem {
  if (error instanceof ApiNetworkError) return { kind: "offline" };
  if (error instanceof ApiHttpError) {
    const kind: AuthErrorKind =
      error.status === 429
        ? "rateLimited"
        : error.status === 400
          ? "invalid"
          : error.status === 401
            ? "unauthorized"
            : error.status === 403
              ? "forbidden"
              : "generic";
    return { kind, requestId: error.requestId };
  }
  return { kind: "generic" };
}

export function AuthPage({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  const t = useTranslations("Auth");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-gutter py-12">
      <p className="type-label text-fg-muted">{t("brand")}</p>
      <UtilityCard as="section" aria-labelledby="auth-title" tone="surface" className="gap-5 p-6 shadow-island">
        <header className="flex flex-col gap-1">
          <h1 id="auth-title" className="type-h2">
            {title}
          </h1>
          {subtitle ? <p className="type-body text-fg-secondary">{subtitle}</p> : null}
        </header>
        {children}
      </UtilityCard>
    </main>
  );
}

/** Inline status message: errors are role=alert, confirmations role=status. */
export function AuthNotice({ tone, children, requestId }: { tone: "danger" | "success" | "info"; children: ReactNode; requestId?: string }) {
  const t = useTranslations("Auth.errors");
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-card-sm px-3 py-2.5 text-sm",
        tone === "danger" ? "bg-danger-soft text-danger-text" : tone === "success" ? "bg-success-soft text-success-text" : "bg-raised text-fg",
      )}
    >
      <Icon icon={tone === "danger" ? CircleAlert : CircleCheck} size={18} className="mt-0.5 shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span>{children}</span>
        {requestId ? (
          <span className="text-xs opacity-80" dir="ltr">
            {t("reference", { id: requestId })}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Generic transport problem copy (offline / rate limit / invalid / generic). */
export function ProblemNotice({ problem, overrides }: { problem: AuthProblem; overrides?: Partial<Record<AuthErrorKind, string>> }) {
  const t = useTranslations("Auth.errors");
  const fallback: Record<AuthErrorKind, string> = {
    offline: t("offline"),
    rateLimited: t("rateLimited"),
    invalid: t("invalid"),
    unauthorized: t("generic"),
    forbidden: t("generic"),
    generic: t("generic"),
  };
  return (
    <AuthNotice tone="danger" requestId={problem.kind === "offline" ? undefined : problem.requestId}>
      {overrides?.[problem.kind] ?? fallback[problem.kind]}
    </AuthNotice>
  );
}

interface TextFieldProps extends Omit<ComponentProps<typeof Input>, "id"> {
  name: string;
  label: string;
  hint?: string;
  problem?: FieldProblem | null;
}

/** Label + input + hint + error, LTR for emails/passwords (they are Latin by nature). */
export function AuthTextField({ name, label, hint, problem, required = true, ...props }: TextFieldProps) {
  const t = useTranslations("Auth.errors");
  return (
    <Field controlId={name} required={required} invalid={!!problem}>
      <FieldLabel>{label}</FieldLabel>
      <Input name={name} dir={props.type === "email" || props.type === "password" ? "ltr" : "auto"} {...props} />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      <FieldError>{problem ? t(problem) : null}</FieldError>
    </Field>
  );
}
