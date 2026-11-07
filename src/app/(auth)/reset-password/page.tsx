import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordScreen } from "@/features/auth/screens/recovery-screens";
import { firstParam } from "../search-param";

// Reads the request URL (search params): opt out of instant validation (see the root layout).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.reset");
  // The URL can carry a one-time token: never index, never send it as a referrer.
  return { title: t("title"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  return <ResetPasswordScreen token={firstParam(params.token)} error={firstParam(params.error)} />;
}
