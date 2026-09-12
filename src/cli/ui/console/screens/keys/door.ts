/** The Keys screen's doors: the org's own API keys — listed by fingerprint, issued once, revoked. */

import { z } from "zod";

import { post, read, type Credentials } from "../../../shared/api";

// Never a key: the table keeps a sha256 and the listing says so. `subject` names the member a key
// was minted for; a machine's names nobody, which is what a deployment's key is.
const ListedSchema = z.object({
  fingerprint: z.string(),
  label: z.string().nullable(),
  env: z.string(),
  scopes: z.array(z.string()),
  subject: z.string().nullable(),
  name: z.string().nullable(),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
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

/** A key at the one moment it exists in the clear. */
export type Issued = z.infer<typeof IssuedSchema>;

/** What the form says: what the key is for, which world it opens, and what it may do there. */
export interface Wanted {
  label: string;
  env: string;
  scopes: string[];
}

/** Every key of this org, oldest first, revoked ones named as revoked. */
export async function readKeys(credentials: Credentials): Promise<Listed[]> {
  return z.array(ListedSchema).parse(await read(credentials, "/v1/keys"));
}

/** One key for a machine of this org. It names nobody: people get keys by logging in. */
export async function issueKey(credentials: Credentials, wanted: Wanted): Promise<Issued> {
  return IssuedSchema.parse(await post(credentials, "/v1/keys", wanted));
}

/** Stop one key from the next request. Its row, and the calls it wrote, stay. */
export async function revokeKey(credentials: Credentials, fingerprint: string): Promise<void> {
  await post(credentials, `/v1/keys/${encodeURIComponent(fingerprint)}/revoke`, {});
}
