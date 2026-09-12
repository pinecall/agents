/** What the page reads before anything else: that this key opens the box, and who is looking. */

import { z } from "zod";

import { read, type Credentials } from "../../shared/api";

const BoxSchema = z.object({
  operator: z.boolean(),
  version: z.string(),
  domain: z.string().nullable(),
  // Who is holding the key, when it is a person's rather than the box's own out of its
  // environment. Null for that one, which belongs to nobody and is nobody.
  name: z.string().nullable(),
  org: z.string().nullable(),
});

/** The box as its own door describes it, and who is looking at it. */
export type TheBox = z.infer<typeof BoxSchema>;

/** Prove the key at `/v1/ops/whoami` and say which box answered. Throws as any door throws. */
export async function theBox(credentials: Credentials): Promise<TheBox> {
  return BoxSchema.parse(await read(credentials, "/v1/ops/whoami"));
}

/** What the header says: the person holding the key, or the box itself when nobody is. */
export function named(box: TheBox): string {
  return box.name ?? box.domain ?? window.location.host;
}
