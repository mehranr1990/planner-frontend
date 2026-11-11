"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { consumeOpenedSheet, SHEET_PARAM } from "@/features/sheets/sheet-params";
import { useCurrentTeamAccess } from "../use-current-team";
import { isTeamSheetId, teamSheetHref, type TeamSheetId } from "./team-sheet-params";
import { NewTeamSheet } from "./new-team-sheet";
import { TeamInviteSheet } from "./team-invite-sheet";
import { TeamStatusSheet } from "./team-status-sheet";

/*
 * TM-90 sheet host for every /teams route: ?sheet=team-new · team-invite ·
 * team-status. End drawers on desktop, bottom sheets on phones. Closing goes
 * Back when this tab opened the sheet, else drops the parameter.
 */
export function TeamSheetHost() {
  const params = useSearchParams();
  const id = params.get(SHEET_PARAM);
  if (!isTeamSheetId(id)) return null;
  return <TeamSheet key={id} id={id} />;
}

function TeamSheet({ id }: { id: TeamSheetId }) {
  const tStatus = useTranslations("TeamStatus");
  const tNew = useTranslations("TeamNew");
  const tInvite = useTranslations("TeamInvite");
  const router = useRouter();
  const pathname = usePathname();
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const { team } = useCurrentTeamAccess();

  const close = useCallback(() => {
    if (consumeOpenedSheet()) router.back();
    else router.replace(teamSheetHref(pathname, window.location.search, null), { scroll: false });
  }, [router, pathname]);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);

  // team-status and team-invite act on the team in the URL; team-new opens anywhere under /teams.
  if (id !== "team-new" && !team) return null;

  const title =
    id === "team-new"
      ? tNew("title")
      : id === "team-invite"
        ? tInvite("title", { team: team?.name ?? "" })
        : team
          ? tStatus("titleIn", { team: team.name })
          : tStatus("title");
  return (
    <Sheet
      defaultOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        side="end"
        size="drawer"
        title={title}
        data-scope="team"
        data-team-sheet={id}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {id === "team-new" ? <NewTeamSheet onDone={close} /> : null}
        {id === "team-invite" ? <TeamInviteSheet onDone={close} /> : null}
        {id === "team-status" ? <TeamStatusSheet onDone={close} /> : null}
      </SheetContent>
    </Sheet>
  );
}
