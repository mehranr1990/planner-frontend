import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VerifyEmailScreen } from "@/features/auth/screens/recovery-screens";
import { firstParam } from "../search-param";

// Reads the request URL (search params): opt out of instant validation (see the root layout).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.verify");
  return { title: t("title"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  return <VerifyEmailScreen error={firstParam(params.error)} />;
}
