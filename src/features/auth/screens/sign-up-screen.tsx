"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { getApiClient } from "@/api/runtime";
import { sendVerificationEmail, signUp } from "../auth-api";
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

/** Sign-up provisions the account but does not sign in: the next state is "verification pending". */
export function SignUpScreen() {
  const t = useTranslations("Auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resend, setResend] = useState<"idle" | "pending" | "sent">("idle");

  const nameProblem = submitted && !name.trim() ? "required" : null;
  const emailProblem = submitted ? checkEmail(email) : null;
  const passwordProblem = submitted ? checkPassword(password) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || checkEmail(email) || checkPassword(password) || pending) return;
    setPending(true);
    setProblem(null);
    try {
      await signUp(getApiClient(), {
        name: name.trim(),
        email: email.trim(),
        password,
        callbackURL: callbackUrl(AUTH_ROUTES.verifyEmail),
      });
      setPassword("");
      setSentTo(email.trim());
    } catch (error) {
      setProblem(toAuthProblem(error));
    } finally {
      setPending(false);
    }
  };

  const resendVerification = async () => {
    if (!sentTo) return;
    setResend("pending");
    try {
      await sendVerificationEmail(getApiClient(), { email: sentTo, callbackURL: callbackUrl(AUTH_ROUTES.verifyEmail) });
    } catch {
      // Neutral either way.
    }
    setResend("sent");
  };

  if (sentTo) {
    return (
      <AuthPage title={t("signUp.sentTitle")} subtitle={t("signUp.sentBody", { email: sentTo })}>
        {resend === "sent" ? (
          <AuthNotice tone="success">{t("signUp.resent")}</AuthNotice>
        ) : (
          <Button variant="outline" loading={resend === "pending"} onClick={resendVerification}>
            {t("signUp.resend")}
          </Button>
        )}
        <Link href={AUTH_ROUTES.signIn} className="text-sm font-semibold text-scope-deep underline-offset-4 hover:underline">
          {t("signUp.signInLink")}
        </Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title={t("signUp.title")} subtitle={t("signUp.subtitle")}>
      {problem ? <ProblemNotice problem={problem} /> : null}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <AuthTextField
          name="name"
          autoComplete="name"
          label={t("fields.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          problem={nameProblem}
        />
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
          autoComplete="new-password"
          label={t("fields.password")}
          hint={t("fields.passwordHint")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          problem={passwordProblem}
        />
        <Button type="submit" loading={pending}>
          {t("signUp.submit")}
        </Button>
      </form>
      <p className="text-sm text-fg-secondary">
        {t("signUp.haveAccount")}{" "}
        <Link href={AUTH_ROUTES.signIn} className="font-semibold text-scope-deep underline-offset-4 hover:underline">
          {t("signUp.signInLink")}
        </Link>
      </p>
    </AuthPage>
  );
}
