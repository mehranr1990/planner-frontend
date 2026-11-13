"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { consumeOpenedSheet, SHEET_PARAM } from "@/features/sheets/sheet-params";
import { ExpenseSheet } from "../expenses/expense-sheet";
import { useCurrentCompanyAccess } from "../use-current-company";
import { companySheetHref, isCompanySheetId, type CompanySheetId } from "./company-sheet-params";
import { CompanyInviteSheet, NewCompanySheet, NewDepartmentSheet } from "./company-sheets";

/*
 * Company sheet host for every /companies route: ?sheet=company-new ·
 * company-invite · department-new (CO-90) · expense-new (CO-08, receipt
 * first; `&expense=<id>` edits a draft / changes-requested expense). End
 * drawers on desktop, bottom sheets on phones. Sheets that act on a company
 * need the company in the URL and the matching capability; closing goes Back
 * when this tab opened the sheet, else drops the parameter.
 */
export function CompanySheetHost() {
  const params = useSearchParams();
  const id = params.get(SHEET_PARAM);
  if (!isCompanySheetId(id)) return null;
  return <CompanySheet key={id} id={id} expenseId={params.get("expense") ?? undefined} />;
}

function CompanySheet({ id, expenseId }: { id: CompanySheetId; expenseId: string | undefined }) {
  const t = useTranslations("Company.sheets");
  const router = useRouter();
  const pathname = usePathname();
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const { company, capabilities, myDepartmentIds } = useCurrentCompanyAccess();

  const close = useCallback(() => {
    if (consumeOpenedSheet()) router.back();
    else router.replace(companySheetHref(pathname, window.location.search, null), { scroll: false });
  }, [router, pathname]);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);

  if (id !== "company-new") {
    if (!company || !capabilities) return null;
    const writable = company.lifecycle === "active" && company.role !== "viewer";
    if (!writable) return null;
    if (id === "company-invite" && !capabilities.invite) return null;
    if (id === "department-new" && !capabilities.manageDepartments) return null;
    if (id === "expense-new" && !capabilities.createExpense) return null;
  }

  const title =
    id === "company-new"
      ? t("new.title")
      : id === "company-invite"
        ? t("invite.title", { company: company?.name ?? "" })
        : id === "department-new"
          ? t("department.title")
          : expenseId
            ? t("expense.editTitle")
            : t("expense.title");

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
        data-scope="company"
        data-company-sheet={id}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {id === "company-new" ? <NewCompanySheet onDone={close} /> : null}
        {id === "company-invite" && company ? <CompanyInviteSheet companyId={company.id} onDone={close} /> : null}
        {id === "department-new" && company ? <NewDepartmentSheet companyId={company.id} companyName={company.name} onDone={close} /> : null}
        {id === "expense-new" && company ? <ExpenseSheet company={company} defaultDepartmentId={myDepartmentIds[0]} expenseId={expenseId} onDone={close} /> : null}
      </SheetContent>
    </Sheet>
  );
}
