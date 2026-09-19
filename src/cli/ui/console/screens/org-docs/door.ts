/** The org's Docs screen's doors: every base pushed in this world, which agents read each, and a base's files one at a time. */

import {
  KnowledgeFilePushedSchema,
  KnowledgeFileReadSchema,
  KnowledgeFilesSchema,
  KnowledgeListSchema,
  KnowledgeUsesSchema,
  type KnowledgeBase,
  type KnowledgeFilePushed,
  type KnowledgeFileRead,
  type KnowledgeFiles,
} from "@pinecall/protocol";

import { drop, put, read, type Credentials } from "../../../shared/api";

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

// A file's path is the tenant's own — `faq/horarios.md` — and travels in the URL segment by
// segment, so a slash stays a slash and everything else is escaped.
function fileDoor(base: string, path: string): string {
  return `/v1/knowledge/${encodeURIComponent(base)}/files/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Every file of one base, by path, with its size and what it became. */
export async function readFiles(credentials: Credentials, base: string): Promise<KnowledgeFiles> {
  return KnowledgeFilesSchema.parse(await read(credentials, `/v1/knowledge/${encodeURIComponent(base)}`));
}

/** One file, text and all. */
export async function readFile(credentials: Credentials, base: string, path: string): Promise<KnowledgeFileRead> {
  return KnowledgeFileReadSchema.parse(await read(credentials, fileDoor(base, path)));
}

/** The file put into the base — new under that path, or replaced in place — and re-cut alone. */
export async function putFile(credentials: Credentials, base: string, path: string, text: string): Promise<KnowledgeFilePushed> {
  return KnowledgeFilePushedSchema.parse(await put(credentials, fileDoor(base, path), { text }));
}

/** The file and its chunks gone; the base too when it was the last. */
export async function dropFile(credentials: Credentials, base: string, path: string): Promise<void> {
  await drop(credentials, fileDoor(base, path));
}
