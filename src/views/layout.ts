/** The three regions a prompt is made of, in the one order they are ever sent: static, history, dynamic. */

import { changes } from "../agent/agent.js";
import { snapshot, type Snapshot } from "../agent/state.js";
import { docOf, toolsOf } from "../agent/tools.js";
import { marker, withFills, type Fills } from "./components.js";
import { wordsFor } from "./lang.js";
import { renderToText, type Child } from "./jsx-runtime.js";

/** The prompt, cut where the cache is cut: only `dynamic` may differ between two turns of a call. */
export interface Regions {
  static: string;
  history: string;
  dynamic: string;
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

/** A view: the state in, the dynamic region out. Written as JSX, called as a function. */
export type View<T = unknown> = Bivariant<ViewProps<T>, Child>;

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

/**
 * The cached prefix: the class docstring, the knowledge marker, the rules, the protocols and the
 * tool docs. Nothing here may read the state — that is the whole point of the region.
 */
export function staticRegion(agent: object): string {
  const configured = agent as { knowledge?: string };
  const words = wordsFor(agent);
  const parts = [
    docOf(agent) ?? "",
    configured.knowledge ? marker("knowledge", configured.knowledge) : "",
    block("rules", words.rules),
    block("protocols", words.protocols),
    block("tools", toolDocs(agent)),
  ];
  return parts.filter((part) => part.trim()).join("\n\n");
}

/**
 * The history region: the runtime owns the turns, so the framework contributes only what it knows
 * about them — the summaries a `collapse()` left where a stretch of the call used to be.
 */
export function historyRegion(agent: object): string {
  const summaries = changes(agent).filter((change) => change.field === "@summary");
  return summaries
    .map((change) => `${marker("collapsed", JSON.stringify({ seq: change.seq }))}\n${String(change.next)}`)
    .join("\n\n");
}

/** The tail: the memory marker, the retrieval marker, and whatever the view says about now. */
export function dynamicRegion(agent: object, view?: View, context: ViewContext = {}): string {
  const text = view ? renderToText(view(propsFor(agent, context))) : "";
  const configured = agent as { memory?: unknown };
  // A view that asks for memory itself decides where it goes; one that does not still gets it,
  // because an agent configured with `memory` expects the caller to be remembered.
  if (configured.memory && !text.includes("<!-- memory:")) {
    return [marker("memory", "{}"), text].filter(Boolean).join("\n\n");
  }
  return text;
}

/** The whole prompt, region by region: this is what `render(agent, view)` is. */
export function layout(agent: object, view?: View, context: ViewContext = {}): Regions {
  // The dynamic region is the only one a view writes, so it is the only one that can leave a
  // render prop behind. The registry is made here and handed out with the text it belongs to.
  const rendered = withFills(() => dynamicRegion(agent, view, context));
  return {
    static: staticRegion(agent),
    history: historyRegion(agent),
    dynamic: rendered.rendered,
    fills: rendered.fills,
  };
}

// Every tool the class declares, visible right now or not: see docs/decisions/views.md. The model
// reads the docstring, never the JSON schema — the schema is what the wire carries.
function toolDocs(agent: object): string {
  return toolsOf(agent)
    .map((declared) => `- ${declared.name}: ${declared.spec.description}`)
    .join("\n");
}

function block(name: string, body: string): string {
  return body ? `<${name}>\n${body}\n</${name}>` : "";
}
