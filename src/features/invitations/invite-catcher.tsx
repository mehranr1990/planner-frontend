"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { AuthPage } from "@/features/auth/auth-ui";
import { holdProof, invitationLandingHref, parseInviteFragment } from "./held-proof";

const noSubscribe = () => () => undefined;
/** The last fragment read (in memory only), so the snapshot stays stable once the address bar is cleaned. */
let captured: { hash: string; link: ReturnType<typeof parseInviteFragment> } | null = null;
function linkSnapshot() {
  const hash = window.location.hash;
  if (hash && captured?.hash !== hash) captured = { hash, link: parseInviteFragment(hash) };
  return captured ? captured.link : null;
}

/**
 * /invite#id=…&proof=… — the invitation email's landing (INVITATION_ACCEPT_URL).
 * Reads the fragment once, removes it from the address bar and history, keeps
 * the proof in memory and opens the signed-in landing. Signing in first drops
 * the proof; the landing then explains what to do.
 */
export function InviteCatcher() {
  const t = useTranslations("Invitations");
  const router = useRouter();
  // undefined on the server (still opening); null = incomplete link.
  const link = useSyncExternalStore(noSubscribe, linkSnapshot, () => undefined);
  useEffect(() => {
    if (link === undefined) return;
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!link) return;
    holdProof(link.id, link.proof);
    router.replace(invitationLandingHref(link.id, link.kind));
  }, [link, router]);
  return <AuthPage title={t("title")} subtitle={link === null ? t("brokenLink") : t("opening")} />;
}
