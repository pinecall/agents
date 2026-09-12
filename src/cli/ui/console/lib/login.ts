/** The ways a browser gets a key of its own: a one-use code `pinecall run` printed, a person's password, or the other world. */

import { z } from "zod";

import { answered, post, type Credentials } from "../../shared/api";

// What POST /v1/login answers, in the one shape a key travels in. The key is read once and kept
// by lib/session-key.ts under the world it opens; the rest is what the header shows.
const SignedSchema = z.object({
  key: z.string(),
  key_id: z.string(),
  org: z.string(),
  label: z.string().nullish(),
  env: z.enum(["production", "development"]),
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

/** A person's own login: their org, their email, their password. */
export async function loginWithPassword(base: string, who: { org: string; email: string; password: string }): Promise<Signed> {
  return login(base, { ...who, device: THIS_DEVICE });
}

/**
 * The same person, the other world: their key mints a sibling with the same scopes in the world
 * named. A machine key is refused there in a sentence — an org's own key opens one world.
 */
export async function loginToWorld(credentials: Credentials, env: Signed["env"]): Promise<Signed> {
  return SignedSchema.parse(await post(credentials, "/v1/login/env", { env }));
}

// The one door a browser knocks at with no key at all: it is how this tab gets its own.
async function login(base: string, body: unknown): Promise<Signed> {
  const answer = await fetch(new URL(`${base.replace(/\/$/, "")}/v1/login`, window.location.origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return SignedSchema.parse(await answered(answer));
}
