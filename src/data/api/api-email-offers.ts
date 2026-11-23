import type { EmailOffer } from "../messaging-domain";

/** Conversation / meeting email offers ({id, state, revision, expiresAt}); the address is the one the issuer typed. */
const STATE = { PENDING: "pending", CLAIMED: "claimed", EXPIRED: "expired", REVOKED: "revoked" } as const;

export const toEmailOffer = (dto: { id: string; state: keyof typeof STATE; revision: number; expiresAt: string }, email: string): EmailOffer => ({
  id: dto.id,
  email,
  state: STATE[dto.state],
  revision: dto.revision,
  expiresAt: dto.expiresAt,
});
