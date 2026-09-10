/** A golden read off the tenant's disk: the schema the runner takes, and nothing more. */

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

/** A fact from the tenant's backend, injected mid-conversation the way the app would send it. */
export interface EventStep {
  /** How many of the caller's turns have been answered when it arrives. 0 is before a word. */
  after_turn?: number;
  name: string;
  data?: Record<string, unknown>;
}

/** What a golden is accepted against: one field is one question, and one graph answers it. */
export interface Expect {
  tools?: string[];
  /** The mirror of `tools`: none of these ran. `not` is about words; this one is about the log. */
  not_tools?: string[];
  not?: string[];
  says?: string[];
  grounded?: boolean;
  register?: "tu" | "usted";
  replies?: boolean;
}

/** One conversation written down: where it starts, what is said, and what is expected of it. */
export interface Golden {
  name: string;
  state?: Record<string, unknown>;
  input: string[];
  /** What memory already holds about this caller when the call opens, in the words a fact is
   * written in. A golden that seeds one asks the question memory exists for — does the agent USE
   * what it remembered — and it never touches the memory table: the facts are answered to the
   * `recall` tool for this call and nothing is written down. */
  memory?: string[];
  events?: EventStep[];
  /** `YYYY-MM-DD`: the day the call is opened on. A golden that names a weekday pins the one
   * it means, so it reads the same in September and in a year. Without it, the real today. */
  today?: string;
  expect?: Expect;
  /** The call `pinecall runs promote` read this out of. Provenance: no judge ever reads it. */
  promoted_from?: string;
}

/**
 * Where a golden lives when nobody said. `test/` itself already holds the tenant's own vitest
 * files, the `--state` cases `pinecall prompt` reads and the captured prompts, so a golden gets a
 * directory of its own rather than a naming convention inside a crowded one.
 */
export const GOLDENS = "test/goldens";

/** What to say when the default directory is not there: the path, and what belongs in it. */
export const NO_GOLDENS =
  `no goldens at ${GOLDENS}: write one, or name the file or directory to run`;

/** Every golden under those paths, in the order a person would read the directory. */
export async function goldensIn(paths: string[]): Promise<Golden[]> {
  return await casesIn<Golden>(paths, GOLDENS);
}

/**
 * Every case under those paths, whatever shape of golden the caller reads. A file holds one case
 * or a list of them, and a case that named itself keeps that name — the file's own basename is
 * what the rest are called, numbered when there are several, so a report names something a person
 * can grep for in their own directory. The extraction goldens are read through this too.
 */
export async function casesIn<T extends { name?: string }>(paths: string[], fallback: string): Promise<T[]> {
  const found: T[] = [];
  for (const path of paths.length > 0 ? paths : [fallback]) {
    for (const file of await filesUnder(resolve(path))) found.push(...(await casesOf<T>(file)));
  }
  return found;
}

/** The cases whose name carries that text, or all of them when nobody narrowed the run. */
export function matching<T extends { name: string }>(cases: T[], grep: string | undefined): T[] {
  if (grep === undefined) return cases;
  const wanted = grep.toLowerCase();
  return cases.filter((one) => one.name.toLowerCase().includes(wanted));
}

async function casesOf<T extends { name?: string }>(file: string): Promise<T[]> {
  const read = JSON.parse(await readFile(file, "utf8")) as unknown;
  const written = Array.isArray(read) ? (read as T[]) : [read as T];
  const stem = basename(file, extname(file));
  return written.map((one, index) => ({
    ...one,
    name: one.name ?? (written.length > 1 ? `${stem} #${index + 1}` : stem),
  }));
}

// A directory is read one level deep and sorted: goldens are a flat folder of files, and the order
// a run reports in should be the order `ls` prints, not the order the filesystem happens to answer.
async function filesUnder(path: string): Promise<string[]> {
  if (!(await stat(path).catch(() => null))?.isDirectory()) return [path];
  const names = await readdir(path);
  return names.filter((name) => extname(name) === ".json").sort().map((name) => join(path, name));
}
