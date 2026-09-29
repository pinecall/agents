/** Console door for memory goldens: recall ranking and hang-up extraction. */

import { existsSync } from "node:fs";

import { type ExtractionGolden, type ExtractionRun, type MemoryScore } from "../../wire/rest-retrieval.js";

import { pinecallFor } from "../client-for.js";
import { mount, slugOf } from "../../runtime/connect.js";

import { theQuestionsIn } from "../docs.js";
import { load, mountOptions } from "../load.js";
import { AN_EMPTY_GOLDEN, NO_GOLDEN, recalledOn } from "../memory.js";
import { CASES, extracted, NO_CASES } from "../remember.js";
import type { Door } from "../testing/gateway.js";
import { casesIn } from "../testing/goldens.js";
import { homeOf, MEMORY_GOLDEN, type Home } from "../home.js";
import { anObject, aString, maybeNumber } from "./asked.js";
import { Refusal } from "./refusal.js";

/** This directory's recall golden and extraction cases. */
export interface Roster {
  agent: string | null;
  golden: string | null;
  questions: number;
  cases: string[];
}

/** Memory door as the console server uses it. */
export interface Remembering {
  roster(): Promise<Roster>;
  /** Score the recall golden against the gateway's ranking. */
  recall(asked: unknown): Promise<MemoryScore>;
  /** Run each extraction case through one hang-up model call, judged by code. */
  extract(asked: unknown): Promise<ExtractionRun>;
}

const NOT_THIS_DIRECTORY = (asked: string, here: string | null): string =>
  here === null
    ? `no agent class in this directory: run \`pinecall start\` where ${asked}'s agent.tsx is`
    : `this process runs in ${here}'s directory: to run ${asked}'s memory goldens, run \`pinecall start\` there`;

/** Injectable parts of a run, replaceable in tests. */
export interface Pieces {
  /** Read this directory's extraction cases. */
  cases: () => Promise<ExtractionGolden[]>;
  /** Run the cases against this directory's class, mounted for the run. */
  extract: (door: Door, cases: ExtractionGolden[]) => Promise<ExtractionRun>;
  /** Path of the recall golden and the slug of this directory's class. */
  golden: () => Promise<{ agent: string | null; golden: string | null }>;
}

/**
 * Memory door for one `pinecall start`. Both goldens are local files (`memory/golden.json`,
 * `test/memory`); the gateway runs the models, so no key leaves this process.
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
      if (golden === null || !existsSync(golden)) throw new Refusal(404, NO_GOLDEN(golden ?? MEMORY_GOLDEN));
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

/** Extraction cases in `test/memory`, or none. */
async function theCases(): Promise<ExtractionGolden[]> {
  return existsSync(CASES) ? await casesIn<ExtractionGolden>([], CASES) : [];
}

// Mounted as `pinecall remember` does: the gateway reads the class's memory categories off this socket.
async function inThisProcess(door: Door, cases: ExtractionGolden[], file?: string): Promise<ExtractionRun> {
  const loaded = await load(file);
  const pc = pinecallFor(door);
  const held = mount(loaded.ctor, { ...mountOptions(loaded, pc), takesUnclaimed: false });
  try {
    await pc.connect();
    return await extracted(door, held.slug, cases);
  } finally {
    pc.close();
  }
}

/** Recall golden path and class slug for this directory, or nulls when there is no class. */
async function theGolden(): Promise<{ agent: string | null; golden: string | null }> {
  try {
    const loaded = await load();
    return { agent: slugOf(loaded.ctor), golden: homeOf(loaded.file).memoryGolden };
  } catch {
    return { agent: null, golden: null };
  }
}

/** Memory parts for one agent of a project. */
export function rememberingPiecesFor(home: Home, slug: string): Pieces {
  return {
    cases: async () => (existsSync(home.memoryCases) ? await casesIn<ExtractionGolden>([home.memoryCases], CASES) : []),
    extract: (door, cases) => inThisProcess(door, cases, home.file),
    golden: async () => ({ agent: slug, golden: home.memoryGolden }),
  };
}
