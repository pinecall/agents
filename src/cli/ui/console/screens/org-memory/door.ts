/** `GET /v1/memory`: what every agent of the org has learnt, a page at a time, each with its agent. */

import { z } from "zod";

import { GatewayError, read, type Credentials } from "../../../shared/api";

const OrgFactSchema = z.object({
  id: z.string(),
  agent: z.string(),
  contact: z.string(),
  text: z.string(),
  category: z.string().nullish(),
  written_at: z.number(),
});
export type OrgFact = z.infer<typeof OrgFactSchema>;

const OrgMemorySchema = z.object({ facts: z.array(OrgFactSchema), next: z.string().nullish() });
export type OrgMemoryPage = z.infer<typeof OrgMemorySchema>;

// A gateway with no memory configured answers 404 on the memory doors; the screen says so rather
// than drawing an empty table that reads as "nobody has been remembered yet".
/** One page: the words to match, and the cursor of the page before. Null when memory is off here. */
export async function readOrgMemory(credentials: Credentials, words: string, after: string | null): Promise<OrgMemoryPage | null> {
  const params: Record<string, string> = {};
  if (words !== "") params["q"] = words;
  if (after !== null) params["after"] = after;
  try {
    return OrgMemorySchema.parse(await read(credentials, "/v1/memory", params));
  } catch (failed) {
    if (failed instanceof GatewayError && failed.status === 404) return null;
    throw failed;
  }
}
