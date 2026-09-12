/** The Team screen's doors: the members listed, one invited, one changed. Every shape is the runtime's. */

import { z } from "zod";

import { answered, headersFor, post, read, type Credentials } from "../../../shared/api";

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
  who: { email: string; name: string; role: Member["role"]; agents: string[] },
): Promise<Invited> {
  return InvitedSchema.parse(await post(credentials, "/v1/members", who));
}

/** Replace the role, the agents or the standing. A field left out keeps what the member had. */
export async function change(
  credentials: Credentials,
  id: string,
  said: { role?: Member["role"]; agents?: string[]; status?: Member["status"] },
): Promise<Member> {
  const answer = await fetch(new URL(`${credentials.base.replace(/\/$/, "")}/v1/members/${encodeURIComponent(id)}`, window.location.origin), {
    method: "PATCH",
    headers: { ...headersFor(credentials), "content-type": "application/json" },
    body: JSON.stringify(said),
  });
  return MemberSchema.parse(await answered(answer));
}
