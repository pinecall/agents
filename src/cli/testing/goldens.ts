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
  const found: Golden[] = [];
  for (const path of paths.length > 0 ? paths : [GOLDENS]) {
    for (const file of await filesUnder(resolve(path))) found.push(...(await goldensOf(file)));
  }
  return found;
}

/** The goldens whose name carries that text, or all of them when nobody narrowed the run. */
export function matching(goldens: Golden[], grep: string | undefined): Golden[] {
  if (grep === undefined) return goldens;
  const wanted = grep.toLowerCase();
  return goldens.filter((golden) => golden.name.toLowerCase().includes(wanted));
}

/**
 * One file's goldens. A file holds one golden or a list of them, and a golden that named itself
 * keeps that name — the file's own basename is what the rest are called, numbered when there are
 * several, so a report names something a person can grep for in their own directory.
 */
async function goldensOf(file: string): Promise<Golden[]> {
  const read = JSON.parse(await readFile(file, "utf8")) as unknown;
  const written = Array.isArray(read) ? (read as Golden[]) : [read as Golden];
  const stem = basename(file, extname(file));
  return written.map((golden, index) => ({
    ...golden,
    name: golden.name ?? (written.length > 1 ? `${stem} #${index + 1}` : stem),
  }));
}

// A directory is read one level deep and sorted: goldens are a flat folder of files, and the order
// a run reports in should be the order `ls` prints, not the order the filesystem happens to answer.
async function filesUnder(path: string): Promise<string[]> {
  if (!(await stat(path).catch(() => null))?.isDirectory()) return [path];
  const names = await readdir(path);
  return names.filter((name) => extname(name) === ".json").sort().map((name) => join(path, name));
}
