/** The prompt as named blocks in two regions, in the one order they are sent: static · the history · dynamic. */

import type { PromptBlockSpec } from "@pinecall/protocol";

import { changes, type Agent } from "../agent/agent.js";
import { docOf, toolsOf } from "../agent/tools.js";
import { tagged } from "./components.js";
import { wordsFor } from "./lang.js";
import { renderToText } from "./jsx-runtime.js";

/** One block of the prompt as this render produced it: its name, its region, and its text. */
export interface Block extends PromptBlockSpec {
  text: string;
}

/** The prompt, cut where the cache is cut: only a `dynamic` block may differ between two turns. */
export interface Blocks {
  /** Every block, in send order: the static ones, then — after the history — the dynamic one. */
  blocks: Block[];
  /** The history is the runtime's. This is only what a `collapse()` left in it, for the printed page. */
  history: string;
}

// The whole prompt, in the one order it is sent, each block beside whoever writes it. Everything
// the class says about itself is static and cached; the view is the whole dynamic region and the
// LAST thing the model reads, so what the state says about this turn is never buried under the
// history. The layout is the framework's: a class contributes the view and nothing else.
const BLOCKS = [
  { name: "identity", region: "static", text: identityBlock },
  // The knowledge file travels whole in the declaration — `runtime/grounding.ts` reads it beside
  // the class and sends `{path, text}` — and the runtime writes its text into this block, once per
  // call, where it is the operator's own words in the cached prefix. The app sends nothing for it:
  // this package never opens the file on a render, and the same file twice is a worse bug than an
  // empty block.
  { name: "knowledge", region: "static", text: () => "" },
  { name: "tools", region: "static", text: toolsBlock },
  { name: "view", region: "dynamic", text: viewBlock },
] as const satisfies readonly (PromptBlockSpec & { text: (agent: Agent) => string })[];

/** Every block of the prompt, by name and region, in the one order they are sent. */
export const PROMPT_BLOCKS: readonly PromptBlockSpec[] = BLOCKS.map(({ name, region }) => ({ name, region }));

/** The whole prompt, block by block in send order: this is what `render(agent)` is. */
export function layout(agent: Agent): Blocks {
  const blocks = BLOCKS.map(({ name, region, text }) => ({ name, region, text: text(agent) }));
  return { blocks, history: collapsedHistory(agent) };
}

/** Who the agent is: the class docstring, the standing rules and the protocols. Cached; reads no state. */
function identityBlock(agent: Agent): string {
  const words = wordsFor(agent);
  return paragraphs([docOf(agent) ?? "", tagged("rules", words.rules), tagged("protocols", words.protocols)]);
}

// Every tool the class declares, visible right now or not: see docs/decisions/views.md. The model
// reads the docstring, never the JSON schema — the schema is what the wire carries.
function toolsBlock(agent: Agent): string {
  const docs = toolsOf(agent)
    .map((declared) => `- ${declared.name}: ${declared.spec.description}`)
    .join("\n");
  return tagged("tools", docs);
}

// The view: what the class's own `render()` says about this turn, and nothing else. All of it is
// the tenant's words, which is why nothing that came from outside the conversation is spliced into
// it — a recalled fact and a retrieved chunk reach the model as tool results, where they belong
// (the runtime's docs/security/prompt-injection.md).
function viewBlock(agent: Agent): string {
  return renderToText(agent.render());
}

/**
 * What the framework knows of the history: the runtime owns the turns, so this is only the
 * summaries a `collapse()` left where a stretch of the call used to be.
 */
function collapsedHistory(agent: Agent): string {
  return changes(agent)
    .filter((change) => change.field === "@summary")
    .map((change) => String(change.next))
    .join("\n\n");
}

function paragraphs(parts: string[]): string {
  return parts.filter((part) => part.trim()).join("\n\n");
}
