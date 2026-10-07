/** Find a tenant's agent file in the project, and load it through the serve entry's loader. */

import { cannotRun } from "./cannot-run.js";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { type MountOptions, slugOf } from "../runtime/connect.js";
import { CannotServe, loadAgent, type Loaded } from "../serve/load.js";

/** Accepted agent file names, in lookup order; the first that exists wins. */
export const AGENT_FILES = ["agent.tsx", "agent.ts"] as const;

/** Load the agent file named, or this directory's one. A file that cannot be served cannot run. */
export async function load(file?: string): Promise<Loaded> {
  try {
    return await loadAgent(file ?? theAgentHere());
  } catch (failed) {
    throw failed instanceof CannotServe ? cannotRun(failed.message) : failed;
  }
}

/** Build `mount` options for a loaded agent. */
export function mountOptions(loaded: Loaded, pc: MountOptions["pc"]): MountOptions {
  return { pc, source: loaded.source, file: loaded.file };
}

/** Project folder holding one subfolder per agent. */
export const PROJECT_AGENTS = "agents";

/** Agent files of the project at `root`, sorted; folders without an agent file are skipped. */
export function agentFilesOfTheProject(root: string = process.cwd()): string[] {
  const folder = resolve(root, PROJECT_AGENTS);
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => AGENT_FILES.map((name) => resolve(folder, entry.name, name)).find((path) => existsSync(path)))
    .filter((path): path is string => path !== undefined)
    .sort();
}

// The project's only agent; several must be named, none is an error naming where it looked.
function theAgentHere(): string {
  const project = agentFilesOfTheProject();
  if (project.length === 1) return project[0]!;
  if (project.length > 1) {
    const names = project.map((file) => `--agent ${basename(dirname(file))}`).join(" or ");
    throw cannotRun(`this project has ${project.length} agents: name one with ${names}`);
  }
  throw cannotRun(`no agent here: looked for ${PROJECT_AGENTS}/<name>/${AGENT_FILES.join(" or ")} in ${process.cwd()}`);
}

// `--agent` takes a slug and `--file` a path; a path passed to `--agent` gets a pointer to `--file`.
const A_PATH = /\.tsx?$|[/\\]/;

/** Error message when a path was given where a slug is expected, else undefined. */
export function notASlug(said: string | undefined): string | undefined {
  if (said === undefined || !A_PATH.test(said)) return undefined;
  return `an agent is named by its slug, not a file: \`--file ${said}\` names the class to load.`;
}

/** The agent's gateway slug, read from the class (not the folder name). */
export async function slugOfAgentFile(file?: string): Promise<string> {
  return slugOf((await load(file)).ctor);
}

/** Slug of the agent in the current directory, or null when there is none. */
export async function agentOfThisDirectory(): Promise<string | null> {
  try {
    return await slugOfAgentFile();
  } catch {
    return null;
  }
}
