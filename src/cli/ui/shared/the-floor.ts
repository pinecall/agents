/** What this gateway says before anybody holds a key: which runtime, and its password rule. */

import { z } from "zod";

import { answered } from "./api";

// `/.well-known/pinecall` takes no key, which is the point: a card asking somebody to choose a
// password has to say the rule before they type, and it has nothing to authenticate with yet.
const DiscoveredSchema = z.object({
  version: z.string(),
  cloud: z.boolean(),
  signup: z.boolean(),
  min_password: z.number(),
});

/** What the gateway says about itself to a client that knows only its URL. */
export type Discovered = z.infer<typeof DiscoveredSchema>;

/**
 * Ask the gateway what it is. A gateway that will not say is read as the strictest thing it could
 * be — no sign-up — and as having no password rule of its own, because inventing one here is how
 * a page ends up refusing what the box would have accepted.
 */
export async function discovered(base: string): Promise<Discovered> {
  try {
    const answer = await fetch(new URL(`${base.replace(/\/$/, "")}/.well-known/pinecall`, window.location.origin));
    return DiscoveredSchema.parse(await answered(answer));
  } catch {
    return { version: "", cloud: false, signup: false, min_password: 0 };
  }
}
