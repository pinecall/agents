/** The org's Docs screen's doors: every base pushed in this world, and which agents read each. */

import { KnowledgeListSchema, KnowledgeUsesSchema, type KnowledgeBase } from "@pinecall/protocol";

import { read, type Credentials } from "../../../shared/api";

/** One base as the screen draws it: what the gateway holds, and the agents whose settings read it. */
export interface BaseRead extends KnowledgeBase {
  agents: string[];
}

/** Every base this org pushed in the console's world, each with its readers; a base nobody reads has none. */
export async function readBasesRead(credentials: Credentials): Promise<BaseRead[]> {
  const [listed, uses] = await Promise.all([
    KnowledgeListSchema.parse(await read(credentials, "/v1/knowledge")),
    KnowledgeUsesSchema.parse(await read(credentials, "/v1/knowledge/attached")),
  ]);
  const readers = new Map(uses.bases.map((one) => [one.base, one.agents]));
  return listed.bases.map((base) => ({ ...base, agents: readers.get(base.base) ?? [] }));
}
