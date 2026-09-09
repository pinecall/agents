/** Rendering the prompt: the three regions for the runtime, and the same three for a human to read. */

import { dirname, join } from "node:path";

import { layout, type Regions, type View, type ViewContext } from "./layout.js";

/** The prompt of this agent right now, cut into the three regions the runtime sends. */
export function render(agent: object, view?: View, context: ViewContext = {}): Regions {
  return layout(agent, view, context);
}

/**
 * The header a section of the printed page carries: the three region names the design uses, and
 * the `tools` page the CLI prints under them. One definition, so every page is ruled the same way.
 */
export function headerFor(section: keyof Regions | "tools"): string {
  return `── ${section} ──`;
}

/**
 * The three regions as one page, each under its header, in order. What `pinecall run --show-prompt`
 * prints: the headers make it obvious at a glance which half of the prompt is cached.
 */
export function showPrompt(agent: object, view?: View, context: ViewContext = {}): string {
  const regions = render(agent, view, context);
  return (["static", "history", "dynamic"] as const)
    .map((region) => `${headerFor(region)}\n${regions[region]}`.trimEnd())
    .join("\n\n");
}

/**
 * Where an agent's default view lives: `views/agent.tsx` beside the agent file. Resolving the path
 * is the framework's job; importing it is the runtime's, which is the half that knows the loader.
 */
export function viewFor(agentFile: string): string {
  return join(dirname(agentFile), "views", "agent.tsx");
}
