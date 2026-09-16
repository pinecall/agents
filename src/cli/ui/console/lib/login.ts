/** The ways a browser gets a key of its own: a code `pinecall run` printed, an invitation accepted, a password, or the other world. */

import { z } from "zod";

import { answered, post, read, type Credentials } from "../../shared/api";

// What POST /v1/login answers, in the one shape a key travels in. The key is read once and kept
// by lib/session-key.ts under the world it opens; the rest is what the header shows.
const SignedSchema = z.object({
  key: z.string(),
  key_id: z.string(),
  org: z.string(),
  label: z.string().nullish(),
  env: z.enum(["production", "sandbox"]),
  scopes: z.array(z.string()),
  subject: z.string().nullish(),
  name: z.string().nullish(),
});
export type Signed = z.infer<typeof SignedSchema>;

// What the key this browser holds is labelled in the org's key list, so a person revoking one
// knows which device it was.
const THIS_DEVICE = "console";

/** Spend a one-use code from `?login=`: the key `pinecall run`'s process stood for, minted anew for this tab. */
export async function loginWithCode(base: string, code: string): Promise<Signed> {
  return login(base, { code, device: THIS_DEVICE });
}

/** A person's own login: their email and password, and the org when they belong to several. */
export async function loginWithPassword(
  base: string,
  who: { org?: string; email: string; password: string; env?: "production" | "sandbox" },
): Promise<Signed> {
  return login(base, { ...who, org: who.org === undefined || who.org === "" ? null : who.org, device: THIS_DEVICE });
}

// The orgs a person belongs to, as GET /v1/login/orgs lists them: the one this key opens is `here`.
const OrgsOfSchema = z.object({
  orgs: z.array(
    z.object({
      org: z.string(),
      slug: z.string().nullish(),
      name: z.string().nullish(),
      role: z.string(),
      status: z.string(),
      here: z.boolean(),
    }),
  ),
});
export type OrgOf = z.infer<typeof OrgsOfSchema>["orgs"][number];

/** Every org this key's person belongs to. A machine key names nobody and is refused in a sentence. */
export async function orgsOf(credentials: Credentials): Promise<OrgOf[]> {
  return OrgsOfSchema.parse(await read(credentials, "/v1/login/orgs")).orgs;
}

/** The same person, another of their orgs: a key minted for them there, in this key's world. */
export async function loginToOrg(credentials: Credentials, org: string): Promise<Signed> {
  return SignedSchema.parse(await post(credentials, "/v1/login/org", { org }));
}

/**
 * The same person, the other world: their key mints a sibling with the same scopes in the world
 * named. A machine key is refused there in a sentence — an org's own key opens one world.
 */
export async function loginToWorld(credentials: Credentials, env: Signed["env"]): Promise<Signed> {
  return SignedSchema.parse(await post(credentials, "/v1/login/env", { env }));
}

/**
 * Accept the invitation this tab was sent: the person chooses a password, the token is spent, and
 * the answer is their first key — in the same shape a login answers, so the tab keeps it the same
 * way. The token was in the LINK and never in a header: it is the right, and it is one use.
 */
export async function acceptInvitation(base: string, token: string, password: string): Promise<Signed> {
  return knocked(base, `/v1/invitations/${encodeURIComponent(token)}`, { password, device: THIS_DEVICE });
}

// The one door a browser knocks at with no key at all: it is how this tab gets its own.
async function login(base: string, body: unknown): Promise<Signed> {
  return knocked(base, "/v1/login", body);
}

// The two doors that take no key — a login, an invitation accepted — through one fetch: no
// Authorization header, because there is nothing yet to put in one.
async function knocked(base: string, path: string, body: unknown): Promise<Signed> {
  const answer = await fetch(new URL(`${base.replace(/\/$/, "")}${path}`, window.location.origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return SignedSchema.parse(await answered(answer));
}
