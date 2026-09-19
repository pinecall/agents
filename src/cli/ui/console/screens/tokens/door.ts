/** The Tokens screen's doors: the org's tokens — a person's own and its servers' — listed, made, revoked. */

import { z } from "zod";

import { post, read, type Credentials } from "../../../shared/api";

// Never a key: the table keeps a sha256 and the listing says so. A person's key opens whatever
// their row does, so it has no world; a server's token was made for one and says which, and who
// made it — it stays the org's when they leave.
const ListedSchema = z.object({
  fingerprint: z.string(),
  label: z.string().nullable(),
  kind: z.enum(["person", "server"]),
  env: z.enum(["production", "sandbox"]).nullable(),
  name: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  scopes: z.array(z.string()),
});

// The one answer in the console that carries a key in the clear. It is shown once, by the screen
// that asked, and kept by nothing: no state outlives the card that renders it.
const IssuedSchema = z.object({
  key: z.string(),
  key_id: z.string(),
  label: z.string().nullable(),
  env: z.string(),
  scopes: z.array(z.string()),
});

/** One row of the listing. */
export type Listed = z.infer<typeof ListedSchema>;

/** A token at the one moment it exists in the clear. */
export type Issued = z.infer<typeof IssuedSchema>;

/** Every token this key may see, oldest first, revoked ones named as revoked. */
export async function readTokens(credentials: Credentials): Promise<Listed[]> {
  return z.array(ListedSchema).parse(await read(credentials, "/v1/keys"));
}

/** A server's token: what it is for, and the one world it opens. */
export async function makeToken(credentials: Credentials, wanted: { label: string; env: "production" | "sandbox" }): Promise<Issued> {
  return IssuedSchema.parse(await post(credentials, "/v1/keys", wanted));
}

/** Stop one token from the next request. Its row, and the calls it wrote, stay. */
export async function revokeToken(credentials: Credentials, fingerprint: string): Promise<void> {
  await post(credentials, `/v1/keys/${encodeURIComponent(fingerprint)}/revoke`, {});
}
