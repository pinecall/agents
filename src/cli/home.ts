/** Where an agent's files are: beside its own agent.tsx, or — in a project of several — by its name under the project's folders. */

import { existsSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import { slugOf } from "../runtime/connect.js";
import { agentFilesOfTheProject, load, PROJECT_AGENTS } from "./load.js";

/**
 * Everything a verb reads beside the class. Two layouts, one shape:
 *
 * - **One agent, one folder** — the folder holds `agent.tsx`, and beside it `knowledge/docs`,
 *   `knowledge/golden.json`, `memory/golden.json`, `test/goldens`, `test/personas`, `test/memory`.
 *
 * - **A project of several agents** — `agents/<name>.tsx` at the root, and every folder shared by
 *   name: `knowledge/<name>/` (the documents pushed to the index), `knowledge/<name>.golden.json`,
 *   `memory/<name>.golden.json`, `test/goldens/<name>/`, `test/personas/<name>/`,
 *   `test/memory/<name>/`. The class names its by-heart file itself, relative to its own file:
 *   `knowledge = "../knowledge/<name>.md"`.
 *
 * A verb never computes a path of its own: it asks for the agent's home.
 */
export interface Home {
  /** The class's file, absolute. */
  file: string;
  /** The agent's name in the project: the file's name, or the folder's for one agent alone. */
  name: string;
  /** Where the verbs run from: the project's root, or the agent's folder. */
  root: string;
  goldens: string;
  personas: string;
  docs: string;
  knowledgeGolden: string;
  memoryGolden: string;
  memoryCases: string;
}

/** The home of the class in this file, by which layout the file sits in. */
export function homeOf(file: string): Home {
  const path = resolve(file);
  const folder = dirname(path);
  if (basename(folder) === PROJECT_AGENTS) {
    const root = dirname(folder);
    const name = basename(path, extname(path));
    return {
      file: path,
      name,
      root,
      goldens: join(root, "test", "goldens", name),
      personas: join(root, "test", "personas", name),
      docs: join(root, "knowledge", name),
      knowledgeGolden: join(root, "knowledge", `${name}.golden.json`),
      memoryGolden: join(root, "memory", `${name}.golden.json`),
      memoryCases: join(root, "test", "memory", name),
    };
  }
  return {
    file: path,
    name: basename(folder),
    root: folder,
    goldens: join(folder, "test", "goldens"),
    personas: join(folder, "test", "personas"),
    docs: join(folder, "knowledge", "docs"),
    knowledgeGolden: join(folder, "knowledge", "golden.json"),
    memoryGolden: join(folder, "memory", "golden.json"),
    memoryCases: join(folder, "test", "memory"),
  };
}

/** Whether a home's folder of that kind is there to read. */
export function hasDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * The agents a verb acts on, from what was typed.
 *
 * `file` — that class. Otherwise the `agent.tsx` of this directory. Otherwise, at a project's root,
 * every `agents/*.tsx`, or the one `agent` names — by its name in the project (`sales`) or by its
 * slug (`bidfire-sales`).
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
