/** The console's own door to the knowledge base: this directory's documents pushed, and its golden asked. */

import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { KnowledgePushed, KnowledgeScore } from "@pinecall/protocol";

import { slugOf } from "../../runtime/connect.js";
import {
  AN_EMPTY_GOLDEN,
  DEFAULT_DIR,
  DEFAULT_GOLDEN,
  markdownUnder,
  NO_DIRECTORY,
  NO_GOLDEN,
  NO_MARKDOWN,
  pushedTo,
  scoredOn,
  theQuestionsIn,
} from "../knowledge.js";
import { load } from "../load.js";
import type { Door } from "../testing/gateway.js";
import { anObject, aString, maybeNumber, someWords } from "./asked.js";
import { Refusal } from "./refusal.js";

/** What this directory has to push: where the documents are, how many, and whether a golden sits beside them. */
export interface Roster {
  agent: string | null;
  /** The base the class names — its slug — or nothing when there is no class here. */
  base: string | null;
  directory: string | null;
  files: number;
  golden: string | null;
  questions: number;
}

/** What the server needs from the knowledge door, and nothing of how it reads a directory. */
export interface Knowing {
  roster(): Promise<Roster>;
  push(asked: unknown): Promise<KnowledgePushed & { files: number }>;
  measure(asked: unknown): Promise<KnowledgeScore>;
}

/** Where the documents and the golden of this directory are, read off the class once. */
export interface Here {
  agent: string | null;
  directory: string | null;
  golden: string | null;
}

const NOT_THIS_DIRECTORY = (asked: string, here: string | null): string =>
  here === null
    ? `no agent class in this directory: run \`pinecall run\` where ${asked}'s agent.tsx is`
    : `this process runs in ${here}'s directory: to push ${asked}'s knowledge, run \`pinecall run\` there`;

/**
 * One `Knowing` for the life of a `pinecall run`. Pushing a base is reading files off this
 * machine's disk, which only the process standing in the agent's directory can do — the same
 * `knowledge/docs` and `knowledge/golden.json` `pinecall knowledge` reads, through the same two
 * doors of the gateway. Listing and dropping a base are the gateway's own and the page asks it
 * directly; nothing of that passes through here.
 */
export function knowingFrom(door: Door, agent: string | null, here: () => Promise<Here> = theDirectory): Knowing {
  return {
    async roster(): Promise<Roster> {
      const found = await here();
      const files = found.directory === null ? [] : documents(found.directory);
      const questions = found.golden === null || !existsSync(found.golden) ? null : theQuestionsIn(found.golden);
      return {
        agent: found.agent,
        base: found.agent,
        directory: found.directory,
        files: files.length,
        golden: found.golden !== null && existsSync(found.golden) ? found.golden : null,
        questions: questions?.length ?? 0,
      };
    },

    async push(asked: unknown): Promise<KnowledgePushed & { files: number }> {
      const given = anObject(asked, "a push");
      const found = await mine(aString(given, "agent"), here);
      const base = someWords(given, "base") ?? found.agent!;
      const directory = found.directory!;
      if (!existsSync(directory) || !statSync(directory).isDirectory()) throw new Refusal(404, NO_DIRECTORY(directory));
      const files = documents(directory);
      if (files.length === 0) throw new Refusal(422, NO_MARKDOWN(directory));
      return { ...(await pushedTo(door, base, files)), files: files.length };
    },

    async measure(asked: unknown): Promise<KnowledgeScore> {
      const given = anObject(asked, "a golden");
      const found = await mine(aString(given, "agent"), here);
      const base = someWords(given, "base") ?? found.agent!;
      const golden = found.golden!;
      if (!existsSync(golden)) throw new Refusal(404, NO_GOLDEN(golden));
      const questions = theQuestionsIn(golden);
      if (questions === null) throw new Refusal(422, AN_EMPTY_GOLDEN(golden));
      return await scoredOn(door, base, questions, maybeNumber(given, "k", 1, 100));
    },
  };
}

// Both writing verbs are for the class of THIS directory: the page may be open on any agent the
// gateway holds, and the files are only ever here.
async function mine(asked: string, here: () => Promise<Here>): Promise<Here> {
  const found = await here();
  if (found.agent !== asked || found.directory === null) throw new Refusal(409, NOT_THIS_DIRECTORY(asked, found.agent));
  return found;
}

function documents(directory: string): ReturnType<typeof markdownUnder> {
  return existsSync(directory) && statSync(directory).isDirectory() ? markdownUnder(directory) : [];
}

/** The class of this directory and the two paths beside it, or nothing at all when there is none. */
async function theDirectory(): Promise<Here> {
  try {
    const loaded = await load();
    const beside = dirname(loaded.file);
    return {
      agent: slugOf(loaded.ctor),
      directory: resolve(join(beside, DEFAULT_DIR)),
      golden: resolve(join(beside, DEFAULT_GOLDEN)),
    };
  } catch {
    return { agent: null, directory: null, golden: null };
  }
}
