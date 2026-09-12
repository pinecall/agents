/** What the gateway says about itself before anybody has a key: its version, and whether it is Pinecall's cloud. */

import { z } from "zod";

// runtime api/discovery.py: GET /.well-known/pinecall, no key. `cloud` is PINECALL_CLOUD — the
// one gateway that takes a sign-up; a box of its own has an operator who invites people.
const DiscoveredSchema = z.object({
  version: z.string(),
  cloud: z.boolean(),
});
export type Discovered = z.infer<typeof DiscoveredSchema>;

const WELL_KNOWN = "/.well-known/pinecall";

/** Which runtime answers here. A gateway that does not say — older, or unreachable — is a box. */
export async function discover(base: string): Promise<Discovered> {
  try {
    const answer = await fetch(new URL(`${base.replace(/\/$/, "")}${WELL_KNOWN}`, window.location.origin));
    if (!answer.ok) return A_BOX;
    return DiscoveredSchema.parse(await answer.json());
  } catch {
    return A_BOX;
  }
}

const A_BOX: Discovered = { version: "", cloud: false };
