import type { Metadata, Viewport } from "next";
import { Urbanist, Vazirmatn } from "next/font/google";
import { getTranslations } from "next-intl/server";
import { getRequestPreferences } from "@/features/preferences/request-preferences";
import { Providers } from "./providers";
import "@/styles/globals.css";

/*
 * <html lang dir> depends on the preferences cookie, and an <html> attribute
 * cannot sit inside <Suspense>. This allows the root to block on the request
 * (the documented Cache Components pattern for request-driven <html>
 * attributes); it also turns off static-shell validation app-wide.
 */
export const instant = false;

const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

/** Title and description in the UI language (the preferences cookie, like <html lang>). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Home.meta");
  const name = t("title");
  return {
    title: { default: name, template: `%s · ${name}` },
    description: t("description"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the mobile shell pad for the notch / home indicator (--safe-*).
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const preferences = await getRequestPreferences();

  return (
    // suppressHydrationWarning: next-themes sets data-theme before hydration.
    <html
      lang={preferences.locale}
      dir={preferences.direction}
      suppressHydrationWarning
      className={`${urbanist.variable} ${vazirmatn.variable}`}
    >
      <body>
        <Providers preferences={preferences}>{children}</Providers>
      </body>
    </html>
  );
}
