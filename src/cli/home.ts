/** Paths of an agent's files in the project layout, each folder named after the agent. */

import { cannotRun } from "./cannot-run.js";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { agentFilesOfTheProject, load, slugOfAgentFile } from "./load.js";

/**
 * Paths a verb reads beside the class. Verbs never build these paths themselves.
 *
 *     agents/<name>/agent.ts      the class and its private helpers
 *     lib/                        code shared by two or more agents
 *     docs/<name>/                documents the agent searches (RAG)
 *     test/<name>/agent.test.ts   ring 0
 *     test/<name>/goldens/        ring 1, plus the `docs.json` and `memory.json` goldens
 *     test/<name>/memory/         extraction cases, one written call each
 *
 * Personas live on the gateway; `personas` is only where `pinecall personas push` reads legacy files.
 */
export interface Home {
  /** Absolute path of the class's file. */
  file: string;
  /** The agent's folder name under agents/. */
  name: string;
  /** Project root, where verbs run. */
  root: string;
  goldens: string;
  personas: string;
  docs: string;
  docsGolden: string;
  memoryGolden: string;
  memoryCases: string;
}

/** File names of the retrieval and recall goldens inside the goldens folder. */
export const DOCS_GOLDEN = "docs.json";
export const MEMORY_GOLDEN = "memory.json";

/** Resolve the home of the class at `agents/<name>/agent.ts`. */
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

/** Whether the path exists and is a directory. */
export function hasDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * The agents a verb acts on: `file` if given, else every agent in the project, or the one
 * `agent` names by folder name (`sales`) or slug (`bidfire-sales`).
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
    if ((await slugOfAgentFile(home.file)) === agent) return [home];
  }
  throw cannotRun(`no agent ${agent} in this project: it has ${homes.map((home) => home.name).join(", ")}`);
}

/** The single agent a conversational verb acts on; a multi-agent project must name it. */
export async function oneHome(verb: string, file?: string, agent?: string): Promise<Home> {
  const homes = await homesFor(file, agent);
  if (homes.length > 1) {
    const names = homes.map((home) => `--agent ${home.name}`).join(" or ");
    throw cannotRun(`${verb} talks to one agent and this project has ${homes.length}: add ${names}`);
  }
  return homes[0]!;
}

/** The `--agent` option: a folder name in the project, or a slug. */
export const AGENT_FLAG = { agent: { type: "string" } } as const;
