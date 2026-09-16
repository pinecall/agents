/** The console's own door to memory's two goldens: what recall ranks, and what a hang-up makes of a call. */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ExtractionGolden, ExtractionRun, MemoryScore } from "@pinecall/protocol";

import { Pinecall } from "../../client/index.js";
import { mount, slugOf } from "../../runtime/connect.js";

import { theQuestionsIn } from "../knowledge.js";
import { load, mountOptions } from "../load.js";
import { AN_EMPTY_GOLDEN, DEFAULT_GOLDEN, NO_GOLDEN, recalledOn } from "../memory.js";
import { CASES, extracted, NO_CASES } from "../remember.js";
import type { Door } from "../testing/gateway.js";
import { casesIn } from "../testing/goldens.js";
import type { Home } from "../home.js";
import { anObject, aString, maybeNumber } from "./asked.js";
import { Refusal } from "./refusal.js";

/** What this directory holds for memory: the recall golden, and the extraction cases beside it. */
export interface Roster {
  agent: string | null;
  golden: string | null;
  questions: number;
  cases: string[];
}

/** What the server needs from the memory door, and nothing of how it reads a directory. */
export interface Remembering {
  roster(): Promise<Roster>;
  /** The recall golden, asked of the gateway's own ranking. */
  recall(asked: unknown): Promise<MemoryScore>;
  /** The extraction goldens, through one hang-up's model call each, judged by code. */
  extract(asked: unknown): Promise<ExtractionRun>;
}

const NOT_THIS_DIRECTORY = (asked: string, here: string | null): string =>
  here === null
    ? `no agent class in this directory: run \`pinecall run\` where ${asked}'s agent.tsx is`
    : `this process runs in ${here}'s directory: to run ${asked}'s memory goldens, run \`pinecall run\` there`;

/** The pieces a run is built from, named so a test can hand in its own. */
export interface Pieces {
  /** The extraction goldens of this directory, read off the disk. */
  cases: () => Promise<ExtractionGolden[]>;
  /** The cases through the class of this directory, mounted here for the length of the run. */
  extract: (door: Door, cases: ExtractionGolden[]) => Promise<ExtractionRun>;
  /** Where the recall golden is, and which class this directory holds. */
  golden: () => Promise<{ agent: string | null; golden: string | null }>;
}

/**
 * One `Remembering` for the life of a `pinecall run`. Both goldens are FILES of this directory —
 * `memory/golden.json` and `test/memory` — so only the process standing in it can run them, and
 * both are the very ones `pinecall memory eval` and `pinecall remember` run. The models are the
 * gateway's, as they always were: this process sends questions and cases, never a key.
 */
export function rememberingFrom(
  door: Door,
  agent: string | null,
  pieces: Pieces = { cases: theCases, extract: inThisProcess, golden: theGolden },
): Remembering {
  return {
    async roster(): Promise<Roster> {
      const { golden } = await pieces.golden();
      const questions = golden !== null && existsSync(golden) ? theQuestionsIn(golden) : null;
      return {
        agent,
        golden: golden !== null && existsSync(golden) ? golden : null,
        questions: questions?.length ?? 0,
        cases: (await pieces.cases()).map((one) => one.name),
      };
    },

    async recall(asked: unknown): Promise<MemoryScore> {
      const given = anObject(asked, "a golden");
      mine(aString(given, "agent"), agent);
      const { golden } = await pieces.golden();
      if (golden === null || !existsSync(golden)) throw new Refusal(404, NO_GOLDEN(golden ?? DEFAULT_GOLDEN));
      const questions = theQuestionsIn(golden);
      if (questions === null) throw new Refusal(422, AN_EMPTY_GOLDEN(golden));
      return await recalledOn(door, questions, maybeNumber(given, "k", 1, 100));
    },

    async extract(asked: unknown): Promise<ExtractionRun> {
      mine(aString(anObject(asked, "a run"), "agent"), agent);
      const cases = await pieces.cases();
      if (cases.length === 0) throw new Refusal(404, NO_CASES);
      return await pieces.extract(door, cases);
    },
  };
}

function mine(asked: string, here: string | null): void {
  if (asked !== here) throw new Refusal(409, NOT_THIS_DIRECTORY(asked, here));
}

/** The extraction goldens of `test/memory`, or none at all when this directory has none. */
async function theCases(): Promise<ExtractionGolden[]> {
  return existsSync(CASES) ? await casesIn<ExtractionGolden>([], CASES) : [];
}

// The class is mounted here for the length of the run, exactly as `pinecall remember` mounts it:
// the categories a golden may name are the class's own declaration, read off the socket this
// process opens, and the extraction itself runs where the org's keys are.
async function inThisProcess(door: Door, cases: ExtractionGolden[], file?: string): Promise<ExtractionRun> {
  const loaded = await load(file);
  const pc = new Pinecall({ url: door.url, apiKey: door.apiKey });
  const held = mount(loaded.ctor, { ...mountOptions(loaded, pc), takesUnclaimed: false });
  try {
    await pc.connect();
    return await extracted(door, held.slug, cases);
  } finally {
    pc.close();
  }
}

/** Where the recall golden of this directory is, and which class it belongs to. */
async function theGolden(): Promise<{ agent: string | null; golden: string | null }> {
  try {
    const loaded = await load();
    return { agent: slugOf(loaded.ctor), golden: resolve(join(dirname(loaded.file), DEFAULT_GOLDEN)) };
  } catch {
    return { agent: null, golden: null };
  }
}

/** The pieces for one agent of a project: its extraction cases, its class, its recall golden. */
export function rememberingPiecesFor(home: Home, slug: string): Pieces {
  return {
    cases: async () => (existsSync(home.memoryCases) ? await casesIn<ExtractionGolden>([home.memoryCases], CASES) : []),
    extract: (door, cases) => inThisProcess(door, cases, home.file),
    golden: async () => ({ agent: slug, golden: home.memoryGolden }),
  };
}
