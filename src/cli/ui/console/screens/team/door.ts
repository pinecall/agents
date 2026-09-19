/** The Team screen's doors: the members listed, one invited, one changed. Every shape is the runtime's. */

import { z } from "zod";

import { answered, drop, GatewayError, headersFor, post, put, read, type Credentials } from "../../../shared/api";

export const ROLES = ["qa", "supervisor", "manager", "admin", "developer"] as const;
export const STATUSES = ["invited", "active", "disabled"] as const;

const MemberSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  agents: z.array(z.string()),
  status: z.enum(STATUSES),
  scopes: z.array(z.string()),
  /** Whether a request of theirs may run in production: the admin's switch, or being an admin. */
  production: z.boolean(),
});
export type Member = z.infer<typeof MemberSchema>;

// The one answer that carries the token, and it carries it once: the screen shows it and never
// asks for it again, because the table keeps its hash.
const InvitedSchema = z.object({ member: MemberSchema, token: z.string(), expires_at: z.string() });
export type Invited = z.infer<typeof InvitedSchema>;

/** Every member of the org, oldest first, disabled ones included. */
export async function readMembers(credentials: Credentials): Promise<Member[]> {
  return z.object({ members: z.array(MemberSchema) }).parse(await read(credentials, "/v1/members")).members;
}

/** One more person, invited: the row, and the one-use token shown once. */
export async function invite(
  credentials: Credentials,
  who: { email: string; name: string; role: Member["role"]; agents: string[]; production: boolean },
): Promise<Invited> {
  return InvitedSchema.parse(await post(credentials, "/v1/members", who));
}

/**
 * A one-use link for a member who forgot their password (POST /v1/members/{id}/reset). This box sends
 * no email, so the admin hands the link on; it opens the same card an invitation does, and every
 * newer link spends the ones before it.
 */
export async function resetLink(credentials: Credentials, id: string): Promise<Invited> {
  return InvitedSchema.parse(await post(credentials, `/v1/members/${encodeURIComponent(id)}/reset`, {}));
}

/** Remove a member for good: their keys revoked, their seat freed. The row the log names them by stays text. */
export async function removeMember(credentials: Credentials, id: string): Promise<void> {
  await drop(credentials, `/v1/members/${encodeURIComponent(id)}`);
}

/** Replace the role, the agents, the standing or production. A field left out keeps what the member had. */
export async function change(
  credentials: Credentials,
  id: string,
  said: { role?: Member["role"]; agents?: string[]; status?: Member["status"]; production?: boolean },
): Promise<Member> {
  const answer = await fetch(new URL(`${credentials.base.replace(/\/$/, "")}/v1/members/${encodeURIComponent(id)}`, window.location.origin), {
    method: "PATCH",
    headers: { ...headersFor(credentials), "content-type": "application/json" },
    body: JSON.stringify(said),
  });
  return MemberSchema.parse(await answered(answer));
}

// GET /v1/org/sso (the runtime's docs/protocol/people.md): one shape, and an org that wired no
// provider answers each field's empty value. Never the secret — not here, not anywhere.
const SsoSchema = z.object({
  configured: z.boolean(),
  issuer: z.string().nullish(),
  client_id: z.string().nullish(),
  domains: z.array(z.string()),
  role: z.string().nullish(),
  required: z.boolean(),
  redirect_uri: z.string(),
});
export type Sso = z.infer<typeof SsoSchema>;

/** What PUT /v1/org/sso takes: the whole configuration, the secret sent once. */
export interface WantedSso {
  issuer: string;
  client_id: string;
  client_secret: string;
  domains: string[];
  role: Member["role"] | null;
  required: boolean;
}

/** The org's identity provider, or null from a gateway that signs nobody in with one (its 404). */
export async function readSso(credentials: Credentials): Promise<Sso | null> {
  try {
    return SsoSchema.parse(await read(credentials, "/v1/org/sso"));
  } catch (refused) {
    if (refused instanceof GatewayError && (refused.status === 404 || refused.status === 405)) return null;
    throw refused;
  }
}

/** Replace the org's provider. The gateway asks the issuer for its discovery document before it keeps anything. */
export async function saveSso(credentials: Credentials, wanted: WantedSso): Promise<Sso> {
  return SsoSchema.parse(await put(credentials, "/v1/org/sso", wanted));
}

/** Forget the provider: passwords are how this org signs in again. */
export async function removeSso(credentials: Credentials): Promise<void> {
  await drop(credentials, "/v1/org/sso");
}
