import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordScreen } from "@/features/auth/screens/recovery-screens";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.forgot");
  return { title: t("title"), robots: { index: false } };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
