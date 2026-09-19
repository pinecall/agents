/** Loading a tenant's agent file from the CLI: the TypeScript loader, the class, and its own source. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Agent, setCall } from "../agent/agent.js";
import { describe } from "../agent/docstrings.js";
import { CallWorld } from "../call/call.js";
import { type MountOptions, slugOf } from "../runtime/connect.js";
import { refuseTheEnvironment } from "../runtime/environment.js";

/** What the CLI needs to mount or render an agent: the class, and the file it came from. */
export interface Loaded {
  ctor: new () => Agent;
  file: string;
  source: string;
}

/**
 * The class's file inside its folder. A class whose `render()` returns JSX is written in
 * `agent.tsx`, which is what every example and every generator writes; `agent.ts` still loads, for
 * a class that renders nothing. The first that is there wins, and a usage line names the first.
 */
export const AGENT_FILES = ["agent.tsx", "agent.ts"] as const;

let registered = false;

/** Register tsx, once per process: the tenant writes .ts and .tsx and never a build step. */
// `pinecall start` on a fresh clone must work with `pnpm i` and nothing else. Registering is done
// once per process and only when a tenant's file is actually loaded, so `pinecall <planned group>`
// pays nothing for it. Exported because a persona is a tenant's .ts file too — cli/testing/caller.ts.
export async function useTypeScript(): Promise<void> {
  if (registered) return;
  const { register } = await import("tsx/esm/api");
  register();
  registered = true;
}

/**
 * Load an agent file: import its default export and hand the class its own source.
 *
 * The source is not a nicety. A class docstring sits ABOVE the class, where `Ctor.toString()`
 * cannot see it, and the parameter types are gone by the time the file is a module — so the identity
 * block would open without its first line and the tools would carry untyped arguments. `describe`
 * is the one call that puts both back, and this is the only place that has the text to give it.
 */
export async function load(file?: string): Promise<Loaded> {
  const path = file === undefined ? theAgentHere() : resolve(file);
  if (!existsSync(path)) throw new Error(`no agent at ${path}`);
  await useTypeScript();
  const module_ = (await import(pathToFileURL(path).href)) as { default?: unknown };
  const ctor = module_.default;
  if (typeof ctor !== "function") throw new Error(`${path} has no default-exported Agent class`);
  const source = readFileSync(path, "utf8");
  describe(ctor, source, path);
  // A class still carrying a field of the world's — a voice, a model, an opening, a base — is
  // refused here, before a prompt is printed or a gateway is knocked at: `pinecall prompt` never
  // mounts, and it must say so too.
  refuseTheEnvironment(new (ctor as new () => Agent)());
  return { ctor: ctor as new () => Agent, file: path, source };
}

/**
 * One instance of the loaded class with a line to answer on: what the pages that print a prompt
 * render. A `render()` may read `this.call`, and a page that could not answer that question would
 * be a page about a call that cannot happen.
 */
export function instanceFor(loaded: Loaded, channel = "web"): Agent {
  const agent = new loaded.ctor();
  setCall(agent, new CallWorld({ id: "", contact: "", channel }, () => undefined));
  return agent;
}

/** What `mount` is given for a loaded agent: the client, the source and the file it came from. */
export function mountOptions(loaded: Loaded, pc: MountOptions["pc"]): MountOptions {
  return { pc, source: loaded.source, file: loaded.file };
}

/** The folder a project keeps its agents in, one folder each: `agents/<name>/agent.ts`. */
export const PROJECT_AGENTS = "agents";

/**
 * The agents of the project rooted here: every `agents/<name>/` that holds an `agent.tsx` (or
 * `.ts`), sorted by name. A folder under agents/ with no class in it is not an agent.
 */
export function agentFilesOfTheProject(root: string = process.cwd()): string[] {
  const folder = resolve(root, PROJECT_AGENTS);
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => AGENT_FILES.map((name) => resolve(folder, entry.name, name)).find((path) => existsSync(path)))
    .filter((path): path is string => path !== undefined)
    .sort();
}

// Nobody named a file: the one agent of the project this terminal stands in is that agent, and
// several have to be named. A directory with none is a directory somebody typed the verb in by
// mistake, and the refusal says where it looked.
function theAgentHere(): string {
  const project = agentFilesOfTheProject();
  if (project.length === 1) return project[0]!;
  if (project.length > 1) {
    const names = project.map((file) => `--agent ${basename(dirname(file))}`).join(" or ");
    throw new Error(`this project has ${project.length} agents: name one with ${names}`);
  }
  throw new Error(`no agent here: looked for ${PROJECT_AGENTS}/<name>/${AGENT_FILES.join(" or ")} in ${process.cwd()}`);
}

// The slug of the agent this terminal is standing in, read the way `run` reads it, so no two verbs
// disagree about whose directory this is. No file here is not an error: it is a terminal outside
// any agent's directory, and the verb that asked says what it needs instead.
// `--agent` used to mean a SLUG in three verbs and a FILE in six, which is a flag with two
// meanings and no way to tell which one you got. It names a slug everywhere now, and `--file` is
// the file — so a path typed where a slug is taken is a person who learnt the old spelling, and
// they are told the new one rather than being sent to look for an agent called "agent.tsx".
const A_PATH = /\.tsx?$|[/\\]/;

/** The refusal for a file typed where a slug is taken, or undefined when it is a slug. */
export function notASlug(said: string | undefined): string | undefined {
  if (said === undefined || !A_PATH.test(said)) return undefined;
  return `an agent is named by its slug, not a file: \`--file ${said}\` names the class to load.`;
}

export async function agentOfThisDirectory(): Promise<string | null> {
  try {
    const loaded = await load();
    return slugOf(loaded.ctor);
  } catch {
    return null;
  }
}
