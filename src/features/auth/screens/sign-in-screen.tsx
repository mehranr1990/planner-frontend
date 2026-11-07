"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { getApiClient } from "@/api/runtime";
import { defaultContextId } from "@/features/navigation/contexts";
import { contextHref } from "@/features/navigation/paths";
import { sendVerificationEmail, signIn } from "../auth-api";
import { AuthNotice, AuthPage, AuthTextField, checkEmail, ProblemNotice, toAuthProblem, type AuthProblem } from "../auth-ui";
import { AUTH_ROUTES, callbackUrl, hardNavigate, safeNextPath, type SignInReason } from "../navigation";
import { sessionQueryKey, useSession } from "../session";

const REASONS: readonly SignInReason[] = ["expired", "signed-out", "revoked"];

export function SignInScreen({ reason, next }: { reason?: string; next?: string }) {
  const t = useTranslations("Auth");
  const queryClient = useQueryClient();
  const session = useSession();
  const target = safeNextPath(next) ?? contextHref(defaultContextId);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [resend, setResend] = useState<"idle" | "pending" | "sent">("idle");

  // Already signed in (another tab, back button): go straight to the app.
  useEffect(() => {
    if (session.status === "active") hardNavigate(target);
  }, [session.status, target]);

  const emailProblem = submitted ? checkEmail(email) : null;
  const passwordProblem = submitted && !password ? "required" : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (checkEmail(email) || !password || pending) return;
    setPending(true);
    setProblem(null);
    setResend("idle");
    try {
      await signIn(getApiClient(), { email: email.trim(), password });
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      // A full navigation starts the app with a clean in-memory state for this account.
      hardNavigate(target);
    } catch (error) {
      setPassword("");
      setProblem(toAuthProblem(error));
      setPending(false);
    }
  };

  const resendVerification = async () => {
    setResend("pending");
    try {
      await sendVerificationEmail(getApiClient(), { email: email.trim(), callbackURL: callbackUrl(AUTH_ROUTES.verifyEmail) });
    } catch {
      // Same neutral answer either way: never reveal whether the account exists.
    }
    setResend("sent");
  };

  const reasonKey = REASONS.find((value) => value === reason);

  return (
    <AuthPage title={t("signIn.title")} subtitle={t("signIn.subtitle")}>
      {reasonKey && !problem ? <AuthNotice tone="info">{t(`signIn.reasons.${reasonKey}`)}</AuthNotice> : null}
      {problem ? (
        <ProblemNotice
          problem={problem}
          overrides={{ unauthorized: t("signIn.wrongCredentials"), forbidden: t("signIn.forbidden") }}
        />
      ) : null}
      {problem?.kind === "forbidden" ? (
        resend === "sent" ? (
          <AuthNotice tone="success">{t("signIn.resent")}</AuthNotice>
        ) : (
          <Button variant="outline" size="sm" className="self-start" loading={resend === "pending"} onClick={resendVerification}>
            {t("signIn.resend")}
          </Button>
        )
      ) : null}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <AuthTextField
          name="email"
          type="email"
          autoComplete="email"
          label={t("fields.email")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          problem={emailProblem}
        />
        <AuthTextField
          name="password"
          type="password"
          autoComplete="current-password"
          label={t("fields.password")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          problem={passwordProblem}
        />
        <Link href={AUTH_ROUTES.forgotPassword} className="self-start text-sm font-semibold text-scope-deep underline-offset-4 hover:underline">
          {t("signIn.forgot")}
        </Link>
        <Button type="submit" loading={pending}>
          {t("signIn.submit")}
        </Button>
      </form>
      <p className="text-sm text-fg-secondary">
        {t("signIn.noAccount")}{" "}
        <Link href={AUTH_ROUTES.signUp} className="font-semibold text-scope-deep underline-offset-4 hover:underline">
          {t("signIn.signUpLink")}
        </Link>
      </p>
    </AuthPage>
  );
}
