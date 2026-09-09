/** Rendering the prompt: the blocks for the runtime, and the same blocks as a page a human reads. */

import { dirname, join } from "node:path";

import type { PromptRegion } from "@pinecall/protocol";

import { layout, type Blocks, type ViewContext, type Views } from "./layout.js";

/** The prompt of this agent right now, block by block, in the order the runtime sends them. */
export function render(agent: object, views: Views = {}, context: ViewContext = {}): Blocks {
  return layout(agent, views, context);
}

/**
 * The header a section of the printed page carries: a block's name with its region beside it, or a
 * bare name for the history and for the `tools` page the CLI prints under the prompt. One
 * definition, so every page is ruled the same way.
 */
export function headerFor(name: string, region?: PromptRegion): string {
  return region === undefined ? `── ${name} ──` : `── ${name} (${region}) ──`;
}

/**
 * The whole prompt as one page: every static block under its header, then the history, then every
 * dynamic block, in send order. What `pinecall run --show-prompt` prints: the headers make it
 * obvious at a glance which blocks are cached and which are rewritten every turn.
 */
export function showPrompt(agent: object, views: Views = {}, context: ViewContext = {}): string {
  const { blocks, history } = render(agent, views, context);
  const section = (name: string, text: string, region?: PromptRegion): string =>
    `${headerFor(name, region)}\n${text}`.trimEnd();
  const of = (region: PromptRegion): string[] =>
    blocks.filter((block) => block.region === region).map((block) => section(block.name, block.text, region));
  return [...of("static"), section("history", history), ...of("dynamic")].join("\n\n");
}

/**
 * Where a block's function lives: `views/agent.tsx` beside the agent file for the view, and
 * `views/<name>.tsx` for a block the class declared. Resolving the path is the framework's job;
 * importing it is the runtime's, which is the half that knows the loader.
 */
export function viewFor(agentFile: string, block = "view"): string {
  return join(dirname(agentFile), "views", `${block === "view" ? "agent" : block}.tsx`);
}
