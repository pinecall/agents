/** The Docs screen's doors: the gateway's list and drop, and the directory's push and golden through it. */

import { KnowledgeListSchema, KnowledgePushedSchema, KnowledgeScoreSchema, type KnowledgeList, type KnowledgePushed, type KnowledgeScore } from "@pinecall/protocol";
import { z } from "zod";

import { drop, read, type Credentials } from "../../../shared/api";
import { dev } from "../../lib/dev";

/** What the directory `pinecall start` runs in has to push, and what golden sits beside it. */
const HereSchema = z.object({
  agent: z.string().nullable(),
  base: z.string().nullable(),
  directory: z.string().nullable(),
  files: z.int(),
  golden: z.string().nullable(),
  questions: z.int(),
});
export type Here = z.infer<typeof HereSchema>;

/** A push, with the number of files the terminal actually read off the disk. */
const PushedSchema = KnowledgePushedSchema.extend({ files: z.int() });
export type Pushed = z.infer<typeof PushedSchema>;

/** Every base this org has pushed. The gateway's own door: the page asks it directly. */
export async function readBases(credentials: Credentials): Promise<KnowledgeList> {
  return KnowledgeListSchema.parse(await read(credentials, "/v1/knowledge"));
}

/** What that directory holds: where the documents are, how many, and whether a golden is beside them. */
export async function readHere(credentials: Credentials, agent: string): Promise<Here> {
  return HereSchema.parse(await dev(credentials, agent, "knowledge.roster", { agent }));
}

/** The folder, sent whole. The base is replaced and never merged. */
export async function pushKnowledge(credentials: Credentials, agent: string, base: string): Promise<Pushed> {
  return PushedSchema.parse(await dev(credentials, agent, "knowledge.push", { agent, ...(base === "" ? {} : { base }) }));
}

/** The golden beside the documents, asked of the base: recall@k and nDCG@10, computed by code. */
export async function askTheGolden(credentials: Credentials, agent: string, base: string): Promise<KnowledgeScore> {
  return KnowledgeScoreSchema.parse(await dev(credentials, agent, "knowledge.eval", { agent, ...(base === "" ? {} : { base }) }));
}

/** One base gone. The gateway's own door, and there is no undo but another push. */
export async function dropBase(credentials: Credentials, base: string): Promise<void> {
  await drop(credentials, `/v1/knowledge/${encodeURIComponent(base)}`);
}
