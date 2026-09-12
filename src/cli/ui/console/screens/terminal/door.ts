/** The Terminal screen's doors: the word `pinecall login` printed, read and then approved. */

import { z } from "zod";

import { post, read, type Credentials } from "../../../shared/api";

// No key is ever in this: the key the page mints goes to the TERMINAL that asked for it, through
// a door of its own that this page never calls. All a person approving needs is what they are
// approving. See the runtime's api/pairing.py.
const AskedSchema = z.object({
  device: z.string().nullable(),
  expires_at: z.number(),
  answered: z.boolean(),
});

/** What the card is about to sign in: the terminal's own name for itself, when it gave one. */
export type Asked = z.infer<typeof AskedSchema>;

const ApprovedSchema = z.object({ device: z.string().nullable(), org: z.string() });

function at(code: string): string {
  return `/v1/login/pairings/${encodeURIComponent(code)}`;
}

/** What this word is asking for. It spends nothing, so an open tab may be reloaded. */
export async function asking(credentials: Credentials, code: string): Promise<Asked> {
  return AskedSchema.parse(await read(credentials, at(code)));
}

/**
 * Sign that terminal in as the person this tab is.
 *
 * The key minted here is the terminal's OWN — a fresh one for the same person, labelled as that
 * machine — and it never travels through this page. What this call leaves behind is collected
 * once, by the process that printed the word.
 */
export async function approve(credentials: Credentials, code: string): Promise<string> {
  return ApprovedSchema.parse(await post(credentials, at(code), {})).org;
}
