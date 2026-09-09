/** Loading a tenant's agent.ts from the CLI: the TypeScript loader, the class, its source, its view. */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Agent } from "../agent/agent.js";
import { describe } from "../agent/docstrings.js";
import { viewFor } from "../views/render.js";
import { declaredBlocksOf, type View, type Views } from "../views/layout.js";
import type { MountOptions } from "../runtime/connect.js";
import { groundingOf } from "../runtime/grounding.js";

/** What the CLI needs to mount or render an agent: the class, the file it came from, its views. */
export interface Loaded {
  ctor: new () => Agent;
  file: string;
  source: string;
  /** `view` when `views/agent.tsx` is there, and one function per block the class declared. */
  views: Views;
}

/** Where an agent lives when nobody said: `agent.ts` in the current directory, as every example has it. */
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
 * Load an agent file: import its default export, hand the class its own source, and bring the
 * views next to it — the view if there is one, and every block the class declared.
 *
 * The source is not a nicety. A class docstring sits ABOVE the class, where `Ctor.toString()`
 * cannot see it, and the parameter types are gone by the time the file is a module — so the identity
 * block would open without its first line and the tools would carry untyped arguments. `describe`
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
  // What the class says it knows is checked here, where its path is in hand: a knowledge file that
  // is not there, or `docs` still written as a glob, is refused before a prompt is printed or a
  // gateway is knocked at — `pinecall prompt` never mounts, and it must say so too.
  groundingOf(new (ctor as new () => Agent)(), path);
  return { ctor: ctor as new () => Agent, file: path, source, views: await loadViews(path, ctor) };
}

// The view is optional: an agent whose prompt is only its docstring and its tools renders fine. A
// declared block is not: the class named it, so a file that is not there is a typo to say out loud.
async function loadViews(agentFile: string, ctor: Function): Promise<Views> {
  const views: Views = {};
  const view = await loadView(viewFor(agentFile));
  if (view !== undefined) views["view"] = view;
  for (const block of declaredBlocksOf(ctor)) {
    const path = viewFor(agentFile, block.name);
    const rendered = await loadView(path);
    if (rendered === undefined) throw new Error(`prompt block ${block.name}: ${ctor.name} declares it and ${path} is not there`);
    views[block.name] = rendered;
  }
  return views;
}

async function loadView(path: string): Promise<View | undefined> {
  if (!existsSync(path)) return undefined;
  await useTypeScript();
  const module_ = (await import(pathToFileURL(path).href)) as { default?: unknown };
  return typeof module_.default === "function" ? (module_.default as View) : undefined;
}

/** What `mount` is given for a loaded agent: the client, the source, its file, and the views by block name. */
export function mountOptions(loaded: Loaded, pc: MountOptions["pc"]): MountOptions {
  return { pc, source: loaded.source, file: loaded.file, views: loaded.views };
}
