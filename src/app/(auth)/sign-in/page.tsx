import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInScreen } from "@/features/auth/screens/sign-in-screen";
import { firstParam } from "../search-param";

// Reads the request URL (search params): opt out of instant validation (see the root layout).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.signIn");
  return { title: t("title"), robots: { index: false } };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  return <SignInScreen reason={firstParam(params.reason)} next={firstParam(params.next)} />;
}
