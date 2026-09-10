/** The prompt as named blocks in two regions, in the one order they are sent: static · the history · dynamic. */

import { PromptBlockSpecSchema, type PromptBlockSpec } from "@pinecall/protocol";

import { changes, type MemoryDeclaration, type PromptDeclaration } from "../agent/agent.js";
import { snapshot, type Snapshot } from "../agent/state.js";
import { docOf, toolsOf } from "../agent/tools.js";
import { marker, tagged, withFills, type Fills } from "./components.js";
import { wordsFor } from "./lang.js";
import { renderToText, type Child } from "./jsx-runtime.js";

/** One block of the prompt as this render produced it: its name, its region, and its text. */
export interface Block extends PromptBlockSpec {
  text: string;
}

/** The prompt, cut where the cache is cut: only a `dynamic` block may differ between two turns. */
export interface Blocks {
  /** Every block, in send order: the static ones, then — after the history — the dynamic ones. */
  blocks: Block[];
  /** The history is the runtime's. This is only what a `collapse()` left in it, for the printed page. */
  history: string;
  /** The render props THIS render left in its markers. The gateway fills against these. */
  fills: Fills;
}

/** What the caller is calling from — the view asks about it, the state never stores it. */
export interface CallInfo {
  channel: string;
  from?: string;
}

/** What the agent already knows about this caller; the real one arrives with the memory card. */
export interface MemoryHandle {
  has(text: string): boolean;
}

/** Everything a view is given beyond the state itself. */
export interface ViewContext {
  call?: CallInfo;
  resumed?: boolean;
  memory?: MemoryHandle;
}

/** What a view is called with: the state and its getters, plus what surrounds the call. */
export type ViewProps<T = unknown> = Snapshot<T> & {
  memory: MemoryHandle;
  resumed: boolean;
  call: CallInfo;
};

// Bivariant on purpose: every tenant writes its view against its own class, and the framework
// holds them all in one `View`. The method-shorthand indirection is what keeps the parameter
// position bivariant, so a `View<ClinicaNorte>` is a `View`.
type Bivariant<P, R> = { view(props: P): R }["view"];

/** A view: the state in, one block's text out. Written as JSX, called as a function. */
export type View<T = unknown> = Bivariant<ViewProps<T>, Child>;

/** The functions a tenant wrote in `views/`, by block name: `view` is `views/agent.tsx`, the rest are declared blocks. */
export type Views = Record<string, View>;

// The four blocks the framework writes, in send order. Everything the class says about itself is
// static and cached; the view is dynamic and the LAST thing the model reads, so what the state
// says about this turn is never buried under the history.
const IDENTITY = "identity";
const KNOWLEDGE = "knowledge";
const TOOLS = "tools";
const VIEW = "view";
const FRAMEWORK_STATIC: readonly PromptBlockSpec[] = [
  { name: IDENTITY, region: "static" },
  { name: KNOWLEDGE, region: "static" },
  { name: TOOLS, region: "static" },
];
const FRAMEWORK_VIEW: PromptBlockSpec = { name: VIEW, region: "dynamic" };

// A tenant block is `views/<name>.tsx`, and `views/agent.tsx` is already the view: a block called
// `agent` would be the same function rendered twice under two names.
const RESERVED = new Set([IDENTITY, KNOWLEDGE, TOOLS, VIEW, "agent"]);

/** The props a view is called with: the state, its derived getters, and the call around it. */
export function propsFor(agent: object, context: ViewContext = {}): ViewProps {
  const state: Snapshot = snapshot(agent);
  return {
    ...state,
    memory: context.memory ?? { has: () => false },
    resumed: context.resumed ?? false,
    call: context.call ?? { channel: "web" },
  };
}

/** The blocks a class declares under `static prompt`, checked: named like the wire wants, and none of the framework's. */
export function declaredBlocksOf(ctor: Function): PromptBlockSpec[] {
  const declared = (ctor as { prompt?: PromptDeclaration }).prompt ?? {};
  const own = [
    ...(declared.static ?? []).map((name) => ({ name, region: "static" as const })),
    ...(declared.dynamic ?? []).map((name) => ({ name, region: "dynamic" as const })),
  ];
  const seen = new Set<string>();
  for (const block of own) {
    if (RESERVED.has(block.name)) {
      throw new Error(
        `prompt block ${block.name}: that name is the framework's ` +
          `(identity · knowledge · tools · view, and agent is the view's file); pick another`,
      );
    }
    if (seen.has(block.name)) throw new Error(`prompt block ${block.name}: declared twice`);
    if (!PromptBlockSpecSchema.safeParse(block).success) {
      throw new Error(`prompt block ${block.name}: a name is lowercase words, a-z 0-9 _, starting with a letter`);
    }
    seen.add(block.name);
  }
  return own;
}

/**
 * The layout a class sends: the framework's static blocks, the tenant's static blocks, then — after
 * the history — the tenant's dynamic blocks and the view, LAST. The order is the framework's, not
 * the tenant's, because the cut between the regions is where the cache is.
 */
export function layoutOf(ctor: Function): PromptBlockSpec[] {
  const own = declaredBlocksOf(ctor);
  const statics = own.filter((block) => block.region === "static");
  const dynamics = own.filter((block) => block.region === "dynamic");
  return [...FRAMEWORK_STATIC, ...statics, ...dynamics, FRAMEWORK_VIEW];
}

/** Refuse a declared block that has no function in `views`: a block nobody wrote is a typo, not an empty block. */
export function checkViews(ctor: Function, views: Views): void {
  const missing = declaredBlocksOf(ctor).filter((block) => views[block.name] === undefined);
  if (missing.length > 0) {
    const names = missing.map((block) => block.name).join(", ");
    throw new Error(`prompt block ${names}: ${ctor.name} declares it and no view was given for it`);
  }
}

/** The whole prompt, block by block in send order: this is what `render(agent, views)` is. */
export function layout(agent: object, views: Views = {}, context: ViewContext = {}): Blocks {
  const ctor = (agent as { constructor: Function }).constructor;
  checkViews(ctor, views);
  // Only a rendered function can leave a render prop behind, so the registry is made around the
  // whole render and handed out with the texts it belongs to. The words the class remembers travel
  // with it, because a `<Memory kinds>` naming any other word is refused as it is written.
  const rendered = withFills(
    () => layoutOf(ctor).map((spec) => ({ ...spec, text: textOf(agent, spec, views, context) })),
    remembersOf(agent),
  );
  return { blocks: rendered.rendered, history: collapsedHistory(agent), fills: rendered.fills };
}

/** The words a class said it remembers about a caller: the only categories a view may ask for by name. */
function remembersOf(agent: object): readonly string[] {
  const configured = agent as { memory?: MemoryDeclaration };
  return configured.memory?.remember ?? [];
}

// The text of one block: the framework's four are written here; a tenant's is its own function,
// called like the view when it is dynamic, and against nothing at all when it is static.
function textOf(agent: object, spec: PromptBlockSpec, views: Views, context: ViewContext): string {
  switch (spec.name) {
    case IDENTITY:
      return identityBlock(agent);
    case KNOWLEDGE:
      return knowledgeBlock(agent);
    case TOOLS:
      return toolsBlock(agent);
    case VIEW:
      return viewBlock(agent, views[VIEW], context);
    default: {
      const block = views[spec.name] as View;
      if (spec.region === "dynamic") return renderToText(block(propsFor(agent, context)));
      return renderToText(block(nothingReadable(spec.name)));
    }
  }
}

/** Who the agent is: the class docstring, the standing rules and the protocols. Cached; reads no state. */
function identityBlock(agent: object): string {
  const words = wordsFor(agent);
  return paragraphs([docOf(agent) ?? "", tagged("rules", words.rules), tagged("protocols", words.protocols)]);
}

/** The knowledge marker, when the class named a file. The gateway replaces the line with the text. */
function knowledgeBlock(agent: object): string {
  const configured = agent as { knowledge?: string };
  return configured.knowledge ? marker("knowledge", configured.knowledge) : "";
}

// Every tool the class declares, visible right now or not: see docs/decisions/views.md. The model
// reads the docstring, never the JSON schema — the schema is what the wire carries.
function toolsBlock(agent: object): string {
  const docs = toolsOf(agent)
    .map((declared) => `- ${declared.name}: ${declared.spec.description}`)
    .join("\n");
  return tagged("tools", docs);
}

/** The view: the memory marker, the retrieval marker, and whatever the view says about now. */
function viewBlock(agent: object, view: View | undefined, context: ViewContext): string {
  const text = view ? renderToText(view(propsFor(agent, context))) : "";
  const configured = agent as { memory?: unknown };
  // A view that asks for memory itself decides where it goes; one that does not still gets it,
  // because an agent configured with `memory` expects the caller to be remembered.
  if (configured.memory && !text.includes("<!-- memory:")) {
    return paragraphs([marker("memory", "{}"), text]);
  }
  return text;
}

/**
 * What the framework knows of the history: the runtime owns the turns, so this is only the
 * summaries a `collapse()` left where a stretch of the call used to be.
 */
function collapsedHistory(agent: object): string {
  const summaries = changes(agent).filter((change) => change.field === "@summary");
  return summaries
    .map((change) => `${marker("collapsed", JSON.stringify({ seq: change.seq }))}\n${String(change.next)}`)
    .join("\n\n");
}

// The law "nothing in a static block reads the state", as an exception: the props a static block
// is called with throw on the first property it reads, naming the block and the field.
function nothingReadable(name: string): ViewProps {
  return new Proxy({} as ViewProps, {
    get(_target, key) {
      throw new Error(`a static block cannot read the state: ${name}.tsx reads ${String(key)}`);
    },
  });
}

function paragraphs(parts: string[]): string {
  return parts.filter((part) => part.trim()).join("\n\n");
}
