/** Where an agent's files are: one layout, every folder by the agent's name under the project's root. */

import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { slugOf } from "../runtime/connect.js";
import { agentFilesOfTheProject, load } from "./load.js";

/**
 * Everything a verb reads beside the class, in the one layout a project has:
 *
 *     agents/<name>/agent.ts      the class, and whatever only it uses beside it
 *     lib/                        what two or more agents share
 *     docs/<name>/                the documents the agent SEARCHES — the RAG, and nothing else
 *     test/<name>/agent.test.ts   ring 0
 *     test/<name>/goldens/        ring 1 (the conversations), and beside them the retrieval
 *                                 golden `docs.json` and the recall golden `memory.json`
 *     test/<name>/personas/       ring 2, the synthetic callers
 *     test/<name>/memory/         the extraction cases, one written call each
 *
 * What the agent knows by heart is not in the repository at all: it is its settings' `knowledge`
 * (the console's Knowledge textarea, `pinecall agent knowledge edit`). One agent or five, the
 * layout is the same, and a verb never computes a path of its own: it asks for the agent's home.
 */
export interface Home {
  /** The class's file, absolute. */
  file: string;
  /** The agent's name in the project: its folder under agents/. */
  name: string;
  /** The project's root: where the verbs run from. */
  root: string;
  goldens: string;
  personas: string;
  docs: string;
  docsGolden: string;
  memoryGolden: string;
  memoryCases: string;
}

/** The two names a retrieval golden and a recall golden go by, inside the goldens folder. */
export const DOCS_GOLDEN = "docs.json";
export const MEMORY_GOLDEN = "memory.json";

/** The home of the class in this file: `agents/<name>/agent.ts` says the name and the root. */
export function homeOf(file: string): Home {
  const path = resolve(file);
  const folder = dirname(path);
  const name = basename(folder);
  const root = dirname(dirname(folder));
  const tests = join(root, "test", name);
  return {
    file: path,
    name,
    root,
    goldens: join(tests, "goldens"),
    personas: join(tests, "personas"),
    docs: join(root, "docs", name),
    docsGolden: join(tests, "goldens", DOCS_GOLDEN),
    memoryGolden: join(tests, "goldens", MEMORY_GOLDEN),
    memoryCases: join(tests, "memory"),
  };
}

/** Whether a home's folder of that kind is there to read. */
export function hasDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * The agents a verb acts on, from what was typed.
 *
 * `file` — that class. Otherwise every `agents/<name>/agent.ts` of the project this terminal
 * stands in, or the one `agent` names — by its name in the project (`sales`) or by its slug
 * (`bidfire-sales`).
 */
export async function homesFor(file?: string, agent?: string): Promise<Home[]> {
  if (file !== undefined) return [homeOf(file)];
  const project = agentFilesOfTheProject();
  if (project.length === 0) return [homeOf((await load()).file)];
  const homes = project.map(homeOf);
  if (agent === undefined) return homes;
  const byName = homes.find((home) => home.name === agent);
  if (byName !== undefined) return [byName];
  for (const home of homes) {
    if (slugOf((await load(home.file)).ctor) === agent) return [home];
  }
  throw new Error(`no agent ${agent} in this project: it has ${homes.map((home) => home.name).join(", ")}`);
}

/** The one agent a verb that holds a conversation acts on; a project of several must name it. */
export async function oneHome(verb: string, file?: string, agent?: string): Promise<Home> {
  const homes = await homesFor(file, agent);
  if (homes.length > 1) {
    const names = homes.map((home) => `--agent ${home.name}`).join(" or ");
    throw new Error(`${verb} talks to one agent and this project has ${homes.length}: add ${names}`);
  }
  return homes[0]!;
}

/** The `--agent` option every verb that reads a class takes: a name in the project, or a slug. */
export const AGENT_FLAG = { agent: { type: "string" } } as const;
