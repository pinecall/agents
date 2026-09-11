/** The Memory screen's doors: one contact read and forgotten at the gateway, both goldens run here. */

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

import { drop, post, read, type Credentials } from "../../lib/api";

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

/** What this directory holds: the two goldens, read off the disk by the terminal that serves this page. */
export async function readHere(credentials: Credentials): Promise<Here> {
  return HereSchema.parse(await read(credentials, "/ui/memory"));
}

/** The recall golden: every question asked of the ranking, scored by code with no model. */
export async function askRecall(credentials: Credentials, agent: string): Promise<MemoryScore> {
  return MemoryScoreSchema.parse(await post(credentials, "/ui/memory/eval", { agent }));
}

/** The extraction goldens: one hang-up's model call per case, judged by code. */
export async function runExtraction(credentials: Credentials, agent: string): Promise<ExtractionRun> {
  return ExtractionRunSchema.parse(await post(credentials, "/ui/memory/extraction", { agent }));
}
