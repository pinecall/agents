/** `knowledge` / `docs` / `memory` fields → what the declaration carries: the file read, the base named, the policy. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { Camel, DocsConfig, KnowledgeFile, MemoryConfig } from "@pinecall/protocol";

import type { DocsDeclaration, MemoryDeclaration } from "../agent/agent.js";

/** The three fields as the wire carries them. Absent when the class said nothing. */
export interface Grounding {
  knowledge?: Camel<KnowledgeFile>;
  docs?: Camel<DocsConfig>;
  memory?: Camel<MemoryConfig>;
}

// A string with a `*` or a `/` in it is the glob `docs` used to be — a path the app expanded
// itself. The base is pushed by name now, and the sentence says which verb does the pushing.
const A_GLOB = /[*/]/;

/**
 * What the class says it knows, reads and remembers, read off one probe instance. `file` is the
 * agent's own path, so a knowledge file is found beside the class and not beside whoever ran the
 * process; without one it is read from the working directory.
 */
export function groundingOf(probe: object, file?: string): Grounding {
  const declared = probe as { knowledge?: unknown; docs?: unknown; memory?: unknown };
  const grounding: Grounding = {};
  const knowledge = knowledgeOf(declared.knowledge, file);
  if (knowledge) grounding.knowledge = knowledge;
  const docs = baseOf(declared.docs);
  if (docs) grounding.docs = docs;
  const memory = memoryOf(declared.memory);
  if (memory) grounding.memory = memory;
  return grounding;
}

// The file is sent whole: the runtime puts its text where the knowledge marker is, in the static
// block, once per call. Its path travels as the class wrote it, because that is the name the
// marker carries. A file that is not there is refused here, with the path that was looked at.
function knowledgeOf(value: unknown, file: string | undefined): Camel<KnowledgeFile> | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const path = resolve(file === undefined ? process.cwd() : dirname(file), value);
  if (!existsSync(path)) {
    throw new Error(`knowledge ${value}: no such file at ${path}`);
  }
  return { path: value, text: readFileSync(path, "utf8") };
}

/** `docs = "clinica-norte"` or `docs = { base, mode?, k?, minScore? }`: the base, as the wire names it. */
function baseOf(value: unknown): Camel<DocsConfig> | undefined {
  if (typeof value === "string") {
    if (value === "") return undefined;
    if (A_GLOB.test(value)) {
      throw new Error(
        "docs name the base they were pushed to: run `pinecall knowledge push ./knowledge/docs --base <slug>`",
      );
    }
    return { base: value };
  }
  if (typeof value !== "object" || value === null) return undefined;
  const declared = value as DocsDeclaration;
  const docs: Camel<DocsConfig> = { base: declared.base };
  if (declared.mode !== undefined) docs.mode = declared.mode;
  if (declared.k !== undefined) docs.k = declared.k;
  if (declared.minScore !== undefined) docs.minScore = declared.minScore;
  return docs;
}

/** `memory = { remember: [...], forget: [...] }`, in the tenant's words, as declared. */
function memoryOf(value: unknown): Camel<MemoryConfig> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const declared = value as MemoryDeclaration;
  const memory: Camel<MemoryConfig> = {};
  if (Array.isArray(declared.remember)) memory.remember = declared.remember;
  if (Array.isArray(declared.forget)) memory.forget = declared.forget;
  return memory;
}
