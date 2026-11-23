"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { EmailOffer } from "@/data/messaging-domain";
import { useMsgFormat } from "@/features/messages/format";

/*
 * Issuer side of a conversation / meeting email offer: one exact address at a
 * time, the same neutral answer for every address (no account lookup), and the
 * offers created here with Withdraw while still pending. The API lists no
 * offers, so only this session's offers are shown; "pending" never claims the
 * email was delivered.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailInviteForm({ send, revoke }: { send: (email: string) => Promise<EmailOffer>; revoke: (offer: EmailOffer) => Promise<EmailOffer> }) {
  const t = useTranslations("Invitations.byEmail");
  const format = useMsgFormat();
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<"invalid" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [offers, setOffers] = useState<EmailOffer[]>([]);
  const replace = (offer: EmailOffer) => setOffers((list) => list.map((item) => (item.id === offer.id ? offer : item)));

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${inputId}-title`}>
      <h3 id={`${inputId}-title`} className="text-sm font-bold text-fg">
        {t("title")}
      </h3>
      <p className="text-xs text-fg-secondary">{t("hint")}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const address = email.trim();
          if (!EMAIL.test(address)) return setError("invalid");
          setError(null);
          setBusy(true);
          try {
            const offer = await send(address);
            setOffers((list) => [offer, ...list]);
            setEmail("");
            toast({ title: t("sent", { email: address }), tone: "neutral" });
          } catch {
            setError("failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t("email")}
        </label>
        <Input id={inputId} type="email" dir="ltr" autoComplete="off" placeholder={t("email")} value={email} onChange={(event) => setEmail(event.target.value)} className="min-w-48 flex-1" />
        <Button type="submit" size="sm" disabled={busy}>
          {t("send")}
        </Button>
      </form>
      {error ? <InlineAlert tone={error === "invalid" ? "warning" : "danger"} title={t(error)} /> : null}
      {offers.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {offers.map((offer) => (
            <li key={offer.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <bdi dir="ltr" className="truncate">
                  {offer.email}
                </bdi>
                <span className="text-xs text-fg-secondary">
                  {" · "}
                  {offer.state === "pending" ? t("pendingNote") : t(`state.${offer.state}`)}
                  {offer.state === "pending" ? ` · ${t("expires", { date: format.date(offer.expiresAt) })}` : ""}
                </span>
              </span>
              {offer.state === "pending" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    revoke(offer).then(
                      (next) => {
                        replace(next);
                        toast({ title: t("revoked"), tone: "neutral" });
                      },
                      () => toast({ title: t("failed"), tone: "danger" }),
                    )
                  }
                >
                  {t("revoke")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
