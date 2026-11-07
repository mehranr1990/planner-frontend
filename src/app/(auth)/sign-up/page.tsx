import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignUpScreen } from "@/features/auth/screens/sign-up-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.signUp");
  return { title: t("title"), robots: { index: false } };
}

export default function SignUpPage() {
  return <SignUpScreen />;
}
