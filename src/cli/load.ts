/** Loading a tenant's agent file from the CLI: the TypeScript loader, the class, and its own source. */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Agent, setCall } from "../agent/agent.js";
import { describe } from "../agent/docstrings.js";
import { CallWorld } from "../call/call.js";
import type { MountOptions } from "../runtime/connect.js";
import { groundingOf } from "../runtime/grounding.js";

/** What the CLI needs to mount or render an agent: the class, and the file it came from. */
export interface Loaded {
  ctor: new () => Agent;
  file: string;
  source: string;
}

/**
 * Where an agent lives when nobody said. A class whose `render()` returns JSX is written in
 * `agent.tsx`, which is what every example and every generator writes; `agent.ts` still loads, for
 * a class that renders nothing. The first that is there wins, and a usage line names the first.
 */
export const DEFAULT_AGENTS = ["agent.tsx", "agent.ts"] as const;

let registered = false;

/** Register tsx, once per process: the tenant writes .ts and .tsx and never a build step. */
// `pinecall run` on a fresh clone must work with `pnpm i` and nothing else. Registering is done
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
  // What the class says it knows is checked here, where its path is in hand: a knowledge file that
  // is not there, or `docs` still written as a glob, is refused before a prompt is printed or a
  // gateway is knocked at — `pinecall prompt` never mounts, and it must say so too.
  groundingOf(new (ctor as new () => Agent)(), path);
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

// Nobody named a file. Looking for both names and saying so is the whole of it: a directory with
// neither is a directory somebody typed the verb in by mistake, and the refusal has to say where
// it looked rather than "no agent at /…/agent.tsx" for a project written in .ts.
function theAgentHere(): string {
  const found = DEFAULT_AGENTS.map((name) => resolve(name)).find((path) => existsSync(path));
  if (found !== undefined) return found;
  throw new Error(`no agent here: looked for ${DEFAULT_AGENTS.join(" and ")} in ${process.cwd()}`);
}
