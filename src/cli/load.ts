/** Loading a tenant's agent.ts from the CLI: the TypeScript loader, the class, its source, its view. */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Agent } from "../agent/agent.js";
import { describe } from "../agent/docstrings.js";
import { viewFor } from "../views/render.js";
import type { View } from "../views/layout.js";
import type { MountOptions } from "../runtime/connect.js";

/** What the CLI needs to mount or render an agent: the class, the file it came from, its view. */
export interface Loaded {
  ctor: new () => Agent;
  file: string;
  source: string;
  view?: View;
}

/** Where an agent lives when nobody said: the file `pinecall new` writes, in the current directory. */
export const DEFAULT_AGENT = "agent.ts";

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
 * Load an agent file: import its default export, hand the class its own source, and bring the view
 * next to it if there is one.
 *
 * The source is not a nicety. A class docstring sits ABOVE the class, where `Ctor.toString()`
 * cannot see it, and the parameter types are gone by the time the file is a module — so the static
 * region would open without its first line and the tools would carry untyped arguments. `describe`
 * is the one call that puts both back, and this is the only place that has the text to give it.
 */
export async function load(file: string = DEFAULT_AGENT): Promise<Loaded> {
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`no agent at ${path}`);
  await useTypeScript();
  const module_ = (await import(pathToFileURL(path).href)) as { default?: unknown };
  const ctor = module_.default;
  if (typeof ctor !== "function") throw new Error(`${file} has no default-exported Agent class`);
  const source = readFileSync(path, "utf8");
  describe(ctor, source);
  const loaded: Loaded = { ctor: ctor as new () => Agent, file: path, source };
  const view = await loadView(path);
  if (view !== undefined) loaded.view = view;
  return loaded;
}

// A view is optional: an agent whose prompt is only its docstring and its tools renders fine.
async function loadView(agentFile: string): Promise<View | undefined> {
  const path = viewFor(agentFile);
  if (!existsSync(path)) return undefined;
  await useTypeScript();
  const module_ = (await import(pathToFileURL(path).href)) as { default?: unknown };
  return typeof module_.default === "function" ? (module_.default as View) : undefined;
}

/** What `mount` is given for a loaded agent: an absent view is left out, never passed as undefined. */
export function mountOptions(loaded: Loaded, pc: MountOptions["pc"]): MountOptions {
  const options: MountOptions = { pc, source: loaded.source };
  if (loaded.view !== undefined) options.view = loaded.view;
  return options;
}
