"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isLiveApi } from "@/api/runtime";
import { AccountProvider } from "./account-provider";
import { AuthNotice, AuthPage } from "./auth-ui";
import { leaveToSignIn, useSession, useSignOut } from "./session";

/*
 * Wraps the signed-in app (shell and Focus). Mock mode: a pass-through, so
 * every screen keeps running on fixtures without a backend. Live mode: the
 * private app renders only for an active session; anonymous visitors (and
 * sessions revoked while open) leave through leaveToSignIn, which clears all
 * private state first.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  if (!isLiveApi()) return children;
  return <LiveAuthGate>{children}</LiveAuthGate>;
}

function LiveAuthGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Auth.gate");
  const state = useSession();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const wasActive = useRef(false);

  useEffect(() => {
    if (state.status === "active") wasActive.current = true;
    if (state.status !== "anonymous") return;
    leaveToSignIn(queryClient, wasActive.current ? "revoked" : undefined, pathname + window.location.search);
  }, [state.status, queryClient, pathname]);

  if (state.status === "active") {
    return (
      <AccountProvider key={state.session.user.id} session={state.session}>
        {children}
      </AccountProvider>
    );
  }
  if (state.status === "unavailable") return <UnavailableScreen />;
  if (state.status === "offline") {
    return (
      <AuthPage title={t("offlineTitle")} subtitle={t("offlineBody")}>
        <Button onClick={state.retry}>{t("retry")}</Button>
      </AuthPage>
    );
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas text-fg-muted">
      <Spinner size="lg" label={t("loading")} />
    </div>
  );
}

function UnavailableScreen() {
  const t = useTranslations("Auth.gate");
  const tAccount = useTranslations("Auth.account");
  const signOut = useSignOut();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <AuthPage title={t("unavailableTitle")} subtitle={t("unavailableBody")}>
      {failed ? <AuthNotice tone="danger">{tAccount("signOutFailed")}</AuthNotice> : null}
      <Button
        variant="outline"
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
    </AuthPage>
  );
}
