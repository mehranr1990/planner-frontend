/*
 * The email link's proof, held in memory only between the public /invite
 * catcher and the signed-in landing (a soft navigation keeps this module
 * alive). Never written to storage, URLs, logs or analytics; a full reload or
 * the sign-in redirect drops it by design. Claim it once, then forget it.
 */

export type InviteLinkKind = "CONVERSATION" | "MEETING";

let held: { id: string; proof: string } | null = null;

export function holdProof(id: string, proof: string) {
  held = { id, proof };
}

/** The held proof for this invitation id, if any (not consumed). */
export function peekProof(id: string): string | null {
  return held?.id === id ? held.proof : null;
}

export function forgetProof() {
  held = null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses `#id=…&proof=…[&kind=CONVERSATION|MEETING]`; null when the link is incomplete. */
export function parseInviteFragment(hash: string): { id: string; proof: string; kind: InviteLinkKind | null } | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const id = params.get("id");
  const proof = params.get("proof");
  const kind = params.get("kind");
  if (!id || !UUID.test(id) || !proof) return null;
  return { id, proof, kind: kind === "CONVERSATION" || kind === "MEETING" ? kind : null };
}

/** The in-app landing for an invitation (id and kind only; the proof never goes in a URL). */
export function invitationLandingHref(id: string, kind: InviteLinkKind | null): string {
  const params = new URLSearchParams({ id });
  if (kind) params.set("kind", kind);
  return `/invitations/accept?${params.toString()}`;
}
