/** What the gateway says about itself before anybody has a key: its version, and whether it is Pinecall's cloud. */

import { z } from "zod";

// runtime api/discovery.py: GET /.well-known/pinecall, no key. `signup` is PINECALL_SIGNUP —
// whether a stranger may make an org HERE, off unless the person running the gateway turned it
// on. `cloud` is a different fact (a plan, billed) and the way in is never drawn off it.
const DiscoveredSchema = z.object({
  version: z.string(),
  cloud: z.boolean(),
  signup: z.boolean().default(false),
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

// A gateway that does not answer, or answers something older: assume it opens no sign-up. The
// wrong guess in that direction offers nothing; the other would offer a door that refuses.
const A_BOX: Discovered = { version: "", cloud: false, signup: false };
