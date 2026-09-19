/** The directory verbs: what the console asks the gateway to ask the `pinecall start` in the agent's directory. */

import type { DevVerb } from "@pinecall/protocol";

import { post, type Credentials } from "../../shared/api";

// The family in the path is the door's scope, the verb the wire's word: the gateway's own table
// (runtime api/agents/dev.py), spelled once here so every screen builds the same path.
const FAMILY_OF: Record<DevVerb, "chat" | "knowledge" | "memory" | "evals"> = {
  "chat.roster": "chat",
  "chat.start": "chat",
  "chat.say": "chat",
  "chat.end": "chat",
  "knowledge.roster": "knowledge",
  "knowledge.push": "knowledge",
  "knowledge.eval": "knowledge",
  "memory.roster": "memory",
  "memory.eval": "memory",
  "memory.extraction": "memory",
  "simulate.roster": "evals",
  "simulate.start": "evals",
  "goldens.roster": "evals",
  "goldens.run": "evals",
  "promote.roster": "evals",
  "promote.write": "evals",
  "drift.read": "evals",
  "reproductions.roster": "evals",
  "reproductions.read": "evals",
};

/** Where one verb of one agent is asked: `/v1/agents/<slug>/dev/<family>/<verb>`. */
export function devPath(agent: string, verb: DevVerb): string {
  return `/v1/agents/${encodeURIComponent(agent)}/dev/${FAMILY_OF[verb]}/${verb}`;
}

/**
 * One verb asked of the process in the agent's directory, through the gateway. The answer is the
 * verb's own shape, parsed by the screen; a refusal is the app's or the gateway's status and
 * sentence, verbatim, as every other door's is.
 */
export async function dev(credentials: Credentials, agent: string, verb: DevVerb, body: unknown = {}): Promise<unknown> {
  return post(credentials, devPath(agent, verb), body);
}
