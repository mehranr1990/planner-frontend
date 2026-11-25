import { redirect } from "next/navigation";
import { defaultContextId } from "@/features/navigation/contexts";
import { contextHref } from "@/features/navigation/paths";

/*
 * The site root opens the app: the default context's Overview. In live API
 * mode the AuthGate there sends a signed-out visitor to sign-in (and back
 * here after), so "/" never shows a page of its own. The styleguide stays
 * reachable at /styleguide.
 */
export default function HomePage() {
  redirect(contextHref(defaultContextId));
}
