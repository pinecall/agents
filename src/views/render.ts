/** Rendering the prompt: the blocks for the runtime, and the same blocks as a page a human reads. */

import type { PromptRegion } from "@pinecall/protocol";

import type { Agent } from "../agent/agent.js";
import { layout, type Blocks } from "./layout.js";

/** The prompt of this agent right now, block by block, in the order the runtime sends them. */
export function promptOf(agent: Agent): Blocks {
  return layout(agent);
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
 * The whole prompt as one page: every static block under its header, then the history, then the
 * view. What `pinecall run --show-prompt` prints: the headers make it obvious at a glance which
 * blocks are cached and which one is rewritten every turn.
 */
export function showPrompt(agent: Agent): string {
  const { blocks, history } = promptOf(agent);
  const section = (name: string, text: string, region?: PromptRegion): string =>
    `${headerFor(name, region)}\n${text}`.trimEnd();
  const of = (region: PromptRegion): string[] =>
    blocks.filter((block) => block.region === region).map((block) => section(block.name, block.text, region));
  return [...of("static"), section("history", history), ...of("dynamic")].join("\n\n");
}
