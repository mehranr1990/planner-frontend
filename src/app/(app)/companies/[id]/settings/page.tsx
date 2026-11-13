import { CompanySettingsScreen } from "@/features/companies/settings/company-settings-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-14 · Company settings: /companies/[id]/settings (inside the company gate). */
export default function CompanySettingsPage() {
  return <CompanySettingsScreen />;
}
