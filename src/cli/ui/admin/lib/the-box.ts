/** What the page reads before anything else: that this key opens the box, and which box it is. */

import { z } from "zod";

import { read, type Credentials } from "../../shared/api";

const BoxSchema = z.object({
  operator: z.boolean(),
  version: z.string(),
  domain: z.string().nullable(),
});

/** The box as its own door describes it. */
export type TheBox = z.infer<typeof BoxSchema>;

/** Prove the key at `/v1/ops/whoami` and say which box answered. Throws as any door throws. */
export async function theBox(credentials: Credentials): Promise<TheBox> {
  return BoxSchema.parse(await read(credentials, "/v1/ops/whoami"));
}

/** What a header says this box is: its domain when it has one, else where the page was loaded. */
export function named(box: TheBox): string {
  return box.domain ?? window.location.host;
}
