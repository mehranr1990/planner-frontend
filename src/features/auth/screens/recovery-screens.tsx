"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/api/runtime";
import { defaultContextId } from "@/features/navigation/contexts";
import { contextHref } from "@/features/navigation/paths";
import { cancelDeletion, deletionRecoveryStatus, type DeletionJob } from "../account-lifecycle-api";
import { requestPasswordReset, resetPassword, sendVerificationEmail } from "../auth-api";
import {
  AuthNotice,
  AuthPage,
  AuthTextField,
  checkEmail,
  checkPassword,
  ProblemNotice,
  toAuthProblem,
  type AuthProblem,
} from "../auth-ui";
import { AUTH_ROUTES, callbackUrl } from "../navigation";
import { useSession } from "../session";

const linkClass = "text-sm font-semibold text-scope-deep underline-offset-4 hover:underline";

/** Request a reset link. The answer is always the same generic result (no account probing). */
export function ForgotPasswordScreen() {
  const t = useTranslations("Auth");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (checkEmail(email) || pending) return;
    setPending(true);
    setProblem(null);
    try {
      await requestPasswordReset(getApiClient(), { email: email.trim(), redirectTo: callbackUrl(AUTH_ROUTES.resetPassword) });
      setSent(true);
    } catch (error) {
      const next = toAuthProblem(error);
      // Only transport limits are worth telling; anything else reads as the generic result.
      if (next.kind === "offline" || next.kind === "rateLimited") setProblem(next);
      else setSent(true);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthPage title={t("forgot.sentTitle")} subtitle={t("forgot.sentBody")}>
        <Link href={AUTH_ROUTES.signIn} className={linkClass}>
          {t("forgot.back")}
        </Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title={t("forgot.title")} subtitle={t("forgot.subtitle")}>
      {problem ? <ProblemNotice problem={problem} /> : null}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <AuthTextField
          name="email"
          type="email"
          autoComplete="email"
          label={t("fields.email")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          problem={submitted ? checkEmail(email) : null}
        />
        <Button type="submit" loading={pending}>
          {t("forgot.submit")}
        </Button>
      </form>
      <Link href={AUTH_ROUTES.signIn} className={linkClass}>
        {t("forgot.back")}
      </Link>
    </AuthPage>
  );
}

/**
 * Landing page of the provider's reset redirect (?token=… or ?error=…). The
 * token is moved out of the address bar into memory at once, so it never
 * stays in history, and is sent only with the new password.
 */
export function ResetPasswordScreen({ token: initialToken, error }: { token?: string; error?: string }) {
  const t = useTranslations("Auth");
  const [token] = useState(() => (error ? undefined : initialToken));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [state, setState] = useState<"form" | "invalid" | "done">(token ? "form" : "invalid");

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const passwordProblem = submitted ? checkPassword(password) : null;
  const confirmProblem = submitted ? (!confirm ? "required" : confirm !== password ? "mismatch" : null) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!token || checkPassword(password) || confirm !== password || pending) return;
    setPending(true);
    setProblem(null);
    try {
      await resetPassword(getApiClient(), { token, newPassword: password });
      setState("done");
    } catch (failure) {
      const next = toAuthProblem(failure);
      // The provider rejects an expired/used token as a client error.
      if (next.kind === "invalid" || next.kind === "unauthorized" || next.kind === "forbidden") setState("invalid");
      else setProblem(next);
    } finally {
      setPassword("");
      setConfirm("");
      setPending(false);
    }
  };

  if (state === "done") {
    return (
      <AuthPage title={t("reset.doneTitle")} subtitle={t("reset.doneBody")}>
        <Link href={AUTH_ROUTES.signIn} className={buttonVariants()}>
          {t("reset.signIn")}
        </Link>
      </AuthPage>
    );
  }
  if (state === "invalid") {
    return (
      <AuthPage title={t("reset.title")}>
        <AuthNotice tone="danger">{t("reset.invalidLink")}</AuthNotice>
        <Link href={AUTH_ROUTES.forgotPassword} className={buttonVariants({ variant: "outline" })}>
          {t("reset.requestNew")}
        </Link>
      </AuthPage>
    );
  }
  return (
    <AuthPage title={t("reset.title")} subtitle={t("reset.subtitle")}>
      {problem ? <ProblemNotice problem={problem} /> : null}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <AuthTextField
          name="new-password"
          type="password"
          autoComplete="new-password"
          label={t("fields.newPassword")}
          hint={t("fields.passwordHint")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          problem={passwordProblem}
        />
        <AuthTextField
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          label={t("fields.confirmPassword")}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          problem={confirmProblem}
        />
        <Button type="submit" loading={pending}>
          {t("reset.submit")}
        </Button>
      </form>
    </AuthPage>
  );
}

/**
 * Landing page of the verification (and email-change) redirect. A redirect
 * alone is not proof of success: with ?error the link failed; otherwise the
 * session decides between "verified" (signed in, verified) and "sign in".
 */
export function VerifyEmailScreen({ error }: { error?: string }) {
  const t = useTranslations("Auth");
  const session = useSession();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resend, setResend] = useState<"idle" | "pending" | "sent">("idle");

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  if (error) {
    const submit = async (event: FormEvent) => {
      event.preventDefault();
      setSubmitted(true);
      if (checkEmail(email) || resend === "pending") return;
      setResend("pending");
      try {
        await sendVerificationEmail(getApiClient(), { email: email.trim(), callbackURL: callbackUrl(AUTH_ROUTES.verifyEmail) });
      } catch {
        // Neutral either way.
      }
      setResend("sent");
    };
    return (
      <AuthPage title={t("verify.errorTitle")} subtitle={t("verify.errorBody")}>
        {resend === "sent" ? (
          <AuthNotice tone="success">{t("verify.resent")}</AuthNotice>
        ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <AuthTextField
              name="email"
              type="email"
              autoComplete="email"
              label={t("fields.email")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              problem={submitted ? checkEmail(email) : null}
            />
            <Button type="submit" loading={resend === "pending"}>
              {t("verify.resendSubmit")}
            </Button>
          </form>
        )}
        <Link href={AUTH_ROUTES.signIn} className={linkClass}>
          {t("verify.signIn")}
        </Link>
      </AuthPage>
    );
  }

  if (session.status === "loading") return <AuthPage title={t("verify.title")} subtitle={t("gate.loading")} />;

  if (session.status === "active" && session.session.user.emailVerified) {
    return (
      <AuthPage title={t("verify.verifiedTitle")} subtitle={t("verify.verifiedBody")}>
        <Link href={contextHref(defaultContextId)} className={buttonVariants()}>
          {t("verify.continue")}
        </Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title={t("verify.processedTitle")} subtitle={t("verify.processedBody")}>
      <Link href={AUTH_ROUTES.signIn} className={buttonVariants()}>
        {t("verify.signIn")}
      </Link>
    </AuthPage>
  );
}

/**
 * Signed out: check or cancel a pending account deletion with the request ID
 * and recovery code saved at request time, plus the current password. The
 * code travels only in a header and stays in this component's memory; a
 * canceled account signs in again (revoked sessions are not restored).
 */
export function CancelDeletionScreen() {
  const t = useTranslations("Auth.cancelDeletion");
  const tState = useTranslations("Services.account.delete.states");
  const tAuth = useTranslations("Auth");
  const [jobId, setJobId] = useState("");
  const [recovery, setRecovery] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState<"status" | "cancel" | null>(null);
  const [pending, setPending] = useState<"status" | "cancel" | null>(null);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [status, setStatus] = useState<DeletionJob["state"] | null>(null);

  const missing = (value: string, only?: "cancel") => (submitted && (!only || submitted === only) && !value.trim() ? ("required" as const) : null);

  const run = async (kind: "status" | "cancel") => {
    setSubmitted(kind);
    if (!jobId.trim() || !recovery.trim() || (kind === "cancel" && !password) || pending) return;
    setPending(kind);
    setProblem(null);
    try {
      const job =
        kind === "cancel"
          ? await cancelDeletion(getApiClient(), { jobId: jobId.trim(), password }, recovery.trim())
          : await deletionRecoveryStatus(getApiClient(), jobId.trim(), recovery.trim());
      setStatus(job.state);
      if (kind === "cancel") setPassword("");
    } catch (error) {
      setProblem(toAuthProblem(error));
    } finally {
      setPending(null);
    }
  };

  if (status === "CANCELED") {
    return (
      <AuthPage title={t("doneTitle")} subtitle={t("doneBody")}>
        <Link href={AUTH_ROUTES.signIn} className={linkClass}>
          {tAuth("forgot.back")}
        </Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title={t("title")} subtitle={t("subtitle")}>
      {problem ? <ProblemNotice problem={problem} /> : null}
      {status ? <AuthNotice tone="info">{t("status", { state: tState(status) })}</AuthNotice> : null}
      <form
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void run("cancel");
        }}
        className="flex flex-col gap-4"
      >
        <AuthTextField name="jobId" dir="ltr" autoComplete="off" spellCheck={false} label={t("jobId")} value={jobId} onChange={(event) => setJobId(event.target.value)} problem={missing(jobId)} />
        <AuthTextField name="recovery" dir="ltr" autoComplete="off" spellCheck={false} label={t("recoveryCode")} value={recovery} onChange={(event) => setRecovery(event.target.value)} problem={missing(recovery)} />
        <AuthTextField
          name="password"
          type="password"
          autoComplete="current-password"
          label={tAuth("fields.password")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          problem={missing(password, "cancel")}
        />
        <Button type="submit" loading={pending === "cancel"}>
          {t("submit")}
        </Button>
        <Button type="button" variant="secondary" loading={pending === "status"} onClick={() => void run("status")}>
          {t("check")}
        </Button>
      </form>
      <Link href={AUTH_ROUTES.signIn} className={linkClass}>
        {tAuth("forgot.back")}
      </Link>
    </AuthPage>
  );
}
