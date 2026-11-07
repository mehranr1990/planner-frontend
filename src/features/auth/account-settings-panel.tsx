"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ApiHttpError } from "@/api/errors";
import { getApiClient } from "@/api/runtime";
import { UtilityField } from "@/design-system/surfaces/utility-card";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDate } from "@/lib/dates/format";
import {
  changeEmail,
  changePassword,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updateMe,
  type AuthSession,
} from "./auth-api";
import { useAccount } from "./account-provider";
import {
  AuthNotice,
  AuthTextField,
  checkEmail,
  checkPassword,
  ProblemNotice,
  toAuthProblem,
  type AuthProblem,
} from "./auth-ui";
import { AUTH_ROUTES, callbackUrl } from "./navigation";
import { accountKeys, sessionQueryKey, useSignOut } from "./session";

/*
 * Settings → Data & account, live API only: profile name, email change,
 * password change, account time zone, signed-in devices and sign-out. Each
 * block is a quiet UtilityField like the other settings rows. Sensitive
 * actions that need a fresh sign-in (email change, device list) say so on 403.
 */

function Block({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <UtilityField className="flex-col items-stretch gap-3 py-3">
      <div className="flex flex-col">
        <span>{title}</span>
        {hint ? <span className="text-xs font-normal text-fg-muted">{hint}</span> : null}
      </div>
      {children}
    </UtilityField>
  );
}

/** A 401 inside a direct call: let the session query decide (the gate signs out if it is gone). */
function useRecheckSession() {
  const queryClient = useQueryClient();
  return (error: unknown) => {
    if (error instanceof ApiHttpError && error.status === 401) void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  };
}

export function AccountSettingsPanel() {
  const account = useAccount();
  if (!account) return null;
  return (
    <>
      <ProfileBlock />
      <EmailBlock />
      <PasswordBlock />
      <TimezoneBlock />
      <SessionsBlock />
      <SignOutBlock />
    </>
  );
}

function ProfileBlock() {
  const t = useTranslations("Auth");
  const account = useAccount()!;
  const queryClient = useQueryClient();
  const recheck = useRecheckSession();
  const [name, setName] = useState(account.user.name);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const trimmed = name.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || trimmed === account.user.name || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const user = await updateMe(getApiClient(), { name: trimmed });
      queryClient.setQueryData(accountKeys.me(user.id), user);
      toast({ id: "account-name", title: t("account.nameSaved"), tone: "success" });
    } catch (error) {
      recheck(error);
      setProblem(toAuthProblem(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Block title={t("account.profile")}>
      {problem ? <ProblemNotice problem={problem} /> : null}
      <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <AuthTextField
            name="account-name"
            autoComplete="name"
            label={t("fields.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            problem={!trimmed ? "required" : null}
          />
        </div>
        <Button type="submit" variant="outline" size="sm" loading={pending} disabled={!trimmed || trimmed === account.user.name}>
          {t("account.nameSave")}
        </Button>
      </form>
    </Block>
  );
}

function EmailBlock() {
  const t = useTranslations("Auth");
  const account = useAccount()!;
  const recheck = useRecheckSession();
  const [open, setOpen] = useState(false);
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
      await changeEmail(getApiClient(), { newEmail: email.trim(), callbackURL: callbackUrl(AUTH_ROUTES.verifyEmail) });
      setSent(true);
      setOpen(false);
      setEmail("");
      setSubmitted(false);
    } catch (error) {
      recheck(error);
      setProblem(toAuthProblem(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Block title={t("account.email")}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <bdi dir="ltr" className="font-normal">
          {account.user.email}
        </bdi>
        <span className="text-xs font-semibold text-fg-muted">
          {account.user.emailVerified ? t("account.verified") : t("account.unverified")}
        </span>
      </div>
      {sent ? <AuthNotice tone="success">{t("account.changeEmailSent")}</AuthNotice> : null}
      {problem ? <ProblemNotice problem={problem} overrides={{ forbidden: t("account.freshSession") }} /> : null}
      {open ? (
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <AuthTextField
            name="account-new-email"
            type="email"
            autoComplete="email"
            label={t("account.newEmail")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            problem={submitted ? checkEmail(email) : null}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending}>
              {t("account.changeEmailSubmit")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("account.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => { setOpen(true); setSent(false); }}>
          {t("account.changeEmail")}
        </Button>
      )}
    </Block>
  );
}

function PasswordBlock() {
  const t = useTranslations("Auth");
  const queryClient = useQueryClient();
  const account = useAccount()!;
  const recheck = useRecheckSession();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AuthProblem | null>(null);

  const reset = () => {
    setCurrent("");
    setNext("");
    setSubmitted(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!current || checkPassword(next) || pending) return;
    setPending(true);
    setProblem(null);
    try {
      await changePassword(getApiClient(), { currentPassword: current, newPassword: next, revokeOtherSessions: revokeOthers });
      reset();
      setOpen(false);
      toast({ id: "account-password", title: t("account.passwordChanged"), tone: "success" });
      void queryClient.invalidateQueries({ queryKey: accountKeys.sessions(account.session.user.id) });
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    } catch (error) {
      recheck(error);
      setCurrent("");
      setProblem(toAuthProblem(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Block title={t("account.password")}>
      {problem ? <ProblemNotice problem={problem} overrides={{ forbidden: t("account.freshSession") }} /> : null}
      {open ? (
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <AuthTextField
            name="account-current-password"
            type="password"
            autoComplete="current-password"
            label={t("fields.currentPassword")}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            problem={submitted && !current ? "required" : null}
          />
          <AuthTextField
            name="account-new-password"
            type="password"
            autoComplete="new-password"
            label={t("fields.newPassword")}
            hint={t("fields.passwordHint")}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            problem={submitted ? checkPassword(next) : null}
          />
          <Checkbox
            label={t("account.revokeOthersOption")}
            checked={revokeOthers}
            onCheckedChange={(checked) => setRevokeOthers(checked === true)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending}>
              {t("account.changePasswordSubmit")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { reset(); setOpen(false); }}>
              {t("account.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => { setOpen(true); setProblem(null); }}>
          {t("account.changePassword")}
        </Button>
      )}
    </Block>
  );
}

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function TimezoneBlock() {
  const t = useTranslations("Auth.account");
  const account = useAccount()!;
  const [pending, setPending] = useState(false);
  const zone = account.settings?.settings.timezone;
  const device = deviceTimeZone();

  const useDevice = async () => {
    if (!device) return;
    setPending(true);
    try {
      await account.updateAccountSettings({ timezone: device });
      toast({ id: "account-timezone", title: t("timezoneSaved"), tone: "success" });
    } catch {
      // updateAccountSettings already reported it
    } finally {
      setPending(false);
    }
  };

  return (
    <Block title={t("timezone")} hint={t("timezoneHint")}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {zone ? (
          <bdi dir="ltr" className="font-normal">
            {zone}
          </bdi>
        ) : (
          <Spinner label={t("timezone")} />
        )}
        {zone && device && device !== zone ? (
          <Button variant="outline" size="sm" loading={pending} onClick={useDevice}>
            {t("useDeviceTimezone", { zone: device })}
          </Button>
        ) : null}
      </div>
    </Block>
  );
}

function deviceLabel(session: AuthSession, fallback: string): string {
  const agent = session.userAgent?.trim();
  if (!agent) return fallback;
  // Keep it short and readable: "Chrome · Windows" style hints from the user agent.
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : null;
  const os = /Windows/.test(agent) ? "Windows" : /Android/.test(agent) ? "Android" : /(iPhone|iPad)/.test(agent) ? "iOS" : /Mac OS X/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : null;
  return [browser, os].filter(Boolean).join(" · ") || fallback;
}

function SessionsBlock() {
  const t = useTranslations("Auth.account");
  const account = useAccount()!;
  const preferences = usePreferences();
  const queryClient = useQueryClient();
  const recheck = useRecheckSession();
  const userId = account.session.user.id;
  const key = accountKeys.sessions(userId);
  // Tokens in this list are revoke handles: memory only (React Query cache), never rendered.
  const sessions = useQuery({ queryKey: key, queryFn: () => listSessions(getApiClient()), retry: false });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [problem, setProblem] = useState<AuthProblem | null>(null);

  const run = async (id: string, action: () => Promise<void>, done: string) => {
    setPendingId(id);
    setProblem(null);
    try {
      await action();
      toast({ id: "account-sessions", title: done, tone: "success" });
    } catch (error) {
      recheck(error);
      setProblem(toAuthProblem(error));
    } finally {
      setPendingId(null);
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const listProblem = sessions.error ? toAuthProblem(sessions.error) : null;
  const others = (sessions.data ?? []).filter((session) => session.id !== account.session.sessionId);

  return (
    <Block title={t("sessions")} hint={t("sessionsHint")}>
      {problem ? <ProblemNotice problem={problem} overrides={{ forbidden: t("freshSession") }} /> : null}
      {sessions.isPending ? (
        <Spinner label={t("sessions")} />
      ) : listProblem ? (
        <div className="flex flex-col items-start gap-2">
          <ProblemNotice problem={listProblem} overrides={{ forbidden: t("freshSession"), generic: t("loadFailed") }} />
          <Button variant="outline" size="sm" onClick={() => void sessions.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {(sessions.data ?? []).map((session) => {
              const current = session.id === account.session.sessionId;
              const label = deviceLabel(session, t("unknownDevice"));
              return (
                <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <bdi className="truncate">{label}</bdi>
                    <span className="text-xs font-normal text-fg-muted">
                      {current
                        ? t("thisDevice")
                        : t("since", { date: formatDate(new Date(session.createdAt), "full", preferences) })}
                    </span>
                  </span>
                  {current ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t("revokeLabel", { device: label })}
                      loading={pendingId === session.id}
                      disabled={pendingId !== null}
                      onClick={() => run(session.id, () => revokeSession(getApiClient(), session.token), t("revoked"))}
                    >
                      {t("revoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {others.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start text-danger-text"
              loading={pendingId === "others"}
              disabled={pendingId !== null}
              onClick={() => run("others", () => revokeOtherSessions(getApiClient()), t("revokedOthers"))}
            >
              {t("revokeOthers")}
            </Button>
          ) : null}
        </>
      )}
    </Block>
  );
}

function SignOutBlock() {
  const t = useTranslations("Auth.account");
  const signOut = useSignOut();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <UtilityField className="flex-wrap justify-between gap-x-4 gap-y-2 py-2">
      <span>{t("signOut")}</span>
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() => {
            setPending(true);
            setFailed(false);
            signOut().catch(() => {
              setPending(false);
              setFailed(true);
            });
          }}
        >
          {t("signOut")}
        </Button>
        {failed ? (
          <span role="alert" className="text-xs text-danger-text">
            {t("signOutFailed")}
          </span>
        ) : null}
      </div>
    </UtilityField>
  );
}
