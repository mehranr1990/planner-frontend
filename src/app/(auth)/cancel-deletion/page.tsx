import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CancelDeletionScreen } from "@/features/auth/screens/recovery-screens";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.cancelDeletion");
  return { title: t("title"), robots: { index: false } };
}

export default function CancelDeletionPage() {
  return <CancelDeletionScreen />;
}
