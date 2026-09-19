/** The Memory screen's doors: one contact read and forgotten at the gateway, both goldens run in the directory. */

import {
  ContactMemorySchema,
  ExtractionRunSchema,
  ForgottenSchema,
  MemoryScoreSchema,
  type ContactMemory,
  type ExtractionRun,
  type Forgotten,
  type MemoryScore,
} from "@pinecall/protocol";
import { z } from "zod";

import { GatewayError, drop, read, type Credentials } from "../../../shared/api";
import { dev } from "../../lib/dev";

/** What this directory holds for memory: the recall golden, and the extraction cases beside it. */
const HereSchema = z.object({
  agent: z.string().nullable(),
  golden: z.string().nullable(),
  questions: z.int(),
  cases: z.array(z.string()),
});
export type Here = z.infer<typeof HereSchema>;

/** Everything memory ever kept about one contact, current facts first. */
export async function readContact(credentials: Credentials, contact: string): Promise<ContactMemory> {
  return ContactMemorySchema.parse(await read(credentials, `/v1/contacts/${encodeURIComponent(contact)}/memory`));
}

/** The right to be forgotten: every fact about one contact, gone, and how many there were. */
export async function forgetContact(credentials: Credentials, contact: string): Promise<Forgotten> {
  return ForgottenSchema.parse(await drop(credentials, `/v1/contacts/${encodeURIComponent(contact)}/memory`));
}

/** What the agent's directory holds: the two goldens, read off its disk by the `pinecall start` there. */
export async function readHere(credentials: Credentials, agent: string): Promise<Here> {
  return HereSchema.parse(await dev(credentials, agent, "memory.roster", { agent }));
}

/** The recall golden: every question asked of the ranking, scored by code with no model. */
export async function askRecall(credentials: Credentials, agent: string): Promise<MemoryScore> {
  return MemoryScoreSchema.parse(await dev(credentials, agent, "memory.eval", { agent }));
}

/** The extraction goldens: one hang-up's model call per case, judged by code. */
export async function runExtraction(credentials: Credentials, agent: string): Promise<ExtractionRun> {
  return ExtractionRunSchema.parse(await dev(credentials, agent, "memory.extraction", { agent }));
}

// GET /v1/agents/{slug}/memory: every current fact of every caller this agent kept, newest first.
// A gateway that has not grown the door answers 404, and the screen then reads one contact at a time.
const AgentFactSchema = z.object({
  id: z.string(),
  contact: z.string(),
  text: z.string(),
  category: z.string().nullish(),
  written_at: z.number(),
});
export type AgentFact = z.infer<typeof AgentFactSchema>;

const AgentMemorySchema = z.object({ facts: z.array(AgentFactSchema), next: z.union([z.string(), z.number()]).nullish() });

/** Every caller's current facts, or null when this gateway has no such door yet. */
export async function readAgentMemory(credentials: Credentials, agent: string): Promise<AgentFact[] | null> {
  try {
    return AgentMemorySchema.parse(await read(credentials, `/v1/agents/${encodeURIComponent(agent)}/memory`)).facts;
  } catch (failed) {
    if (failed instanceof GatewayError && failed.status === 404) return null;
    throw failed;
  }
}

/** One fact, no longer held. The rest of what memory keeps about that caller stays. */
export async function dropFact(credentials: Credentials, id: string): Promise<void> {
  await drop(credentials, `/v1/memory/facts/${encodeURIComponent(id)}`);
}
