/** Load a tenant's agent file: register the TypeScript loader, import the class, read its source. */

import { cannotRun } from "./cannot-run.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { type Medium } from "../wire/defs.js";

import { Agent, setCall } from "../agent/agent.js";
import { describe } from "../agent/docstrings.js";
import { CallWorld } from "../call/call.js";
import { type MountOptions, slugOf } from "../runtime/connect.js";
import { refuseTheEnvironment } from "../runtime/environment.js";

/** A loaded agent class with its file path and source text. */
export interface Loaded {
  ctor: new () => Agent;
  file: string;
  source: string;
}

/** Accepted agent file names, in lookup order; the first that exists wins. */
export const AGENT_FILES = ["agent.tsx", "agent.ts"] as const;

let registered = false;

/** Register tsx once per process, lazily, so tenant .ts/.tsx files load without a build step. */
export async function useTypeScript(): Promise<void> {
  if (registered) return;
  const { register } = await import("tsx/esm/api");
  register();
  registered = true;
}

/**
 * Load an agent file and pass its source to `describe`. The source is required: the class
 * docstring and tool parameter types are not recoverable from the compiled module.
 */
export async function load(file?: string): Promise<Loaded> {
  const path = file === undefined ? theAgentHere() : resolve(file);
  if (!existsSync(path)) throw cannotRun(`no agent at ${path}`);
  await useTypeScript();
  const module_ = (await import(pathToFileURL(path).href)) as { default?: unknown };
  const ctor = module_.default;
  if (typeof ctor !== "function") throw cannotRun(`${path} has no default-exported Agent class`);
  const source = readFileSync(path, "utf8");
  describe(ctor, source, path);
  // Refuse environment-owned fields (voice, model, ...) here, since `pinecall prompt` never mounts.
  refuseTheEnvironment(new (ctor as new () => Agent)());
  return { ctor: ctor as new () => Agent, file: path, source };
}

/**
 * Instantiate the class with a stub call, since `render()` may read `this.call`. Without a
 * medium, the call's is the one its channel implies.
 */
export function instanceFor(loaded: Loaded, channel = "web", medium?: Medium): Agent {
  const agent = new loaded.ctor();
  const line = medium === undefined ? { id: "", contact: "", channel } : { id: "", contact: "", channel, medium };
  setCall(agent, new CallWorld(line, () => undefined));
  return agent;
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
