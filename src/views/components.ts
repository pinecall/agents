/** The tags a view is written in: prose blocks, standing rules, and the markers the gateway fills. */

import { AsyncLocalStorage } from "node:async_hooks";
import { blocks, renderInline, renderToText, type Child, type Component, type Props } from "./jsx-runtime.js";

/**
 * A placeholder the framework writes and never resolves: the gateway reads the marker, does the
 * work (open the file, search the memory, retrieve the passages) and replaces the line with text.
 * One syntax for all of them, on its own line, so a filler is a line-by-line pass over a block.
 */
export function marker(name: string, payload: string): string {
  return `<!-- ${name}: ${payload} -->`;
}

/** The whole prompt of a view, its children one paragraph apart. */
export const Prompt: Component = (props) => renderToText(children(props));

/** The knowledge file the agent answers from; the framework never opens the disk itself. */
export const Knowledge: Component = (props) => marker("knowledge", String(props["file"] ?? ""));

/** One standing rule, on its own line, as a bullet. */
export const Rule: Component = (props) => `- ${renderInline(children(props)).trim()}`;
Rule.inline = true;

/** The rules block: every child on its own line, wrapped so the model can see where it ends. */
export const Rules: Component = (props) => tagged("rules", lines(props));

/** The protocols block: how the agent behaves whatever the state says. */
export const Protocols: Component = (props) => tagged("protocols", lines(props));

/** A titled part of the prompt: the title as a heading, then the children as paragraphs. */
export const Section: Component = (props) => {
  const body = renderToText(children(props));
  const title = String(props["title"] ?? "").trim();
  if (!title) return body;
  return body ? `## ${title}\n\n${body}` : `## ${title}`;
};

/** A worked example, wrapped so the model reads it as an example and not as an instruction. */
export const Example: Component = (props) => tagged("example", renderToText(children(props)));

/** A paragraph, for a view that prefers the component to the lowercase tag. */
export const p: Component = (props) => renderInline(children(props));
p.inline = true;

/** What the agent remembers about this caller: a marker the memory service fills at send time. */
export const Memory: Component = (props) => placeholder("memory", props, { kinds: "kinds", limit: "limit" });

/** The passages retrieved for this turn: a marker the retriever fills at send time. */
export const Retrieved: Component = (props) => placeholder("retrieved", props, { k: "k", minScore: "min_score" });

// A render prop is a function the view left behind to shape whatever the gateway finds. It cannot
// travel inside a marker, so it stays behind under an id and the filler asks for it by that id.

/** The render props ONE render left behind. It is handed back with that render's blocks. */
export interface Fills {
  /** Keep a render prop until the gateway comes back with its data; the id goes in the marker. */
  keep(render: (data: unknown) => Child): string;
  /** Render one kept render prop against what the gateway found. */
  fill(id: string, data: unknown): string;
  /** Whether an id is still fillable — what a runtime checks before it walks a block's markers. */
  has(id: string): boolean;
}

/** A registry of render props, belonging to one render and to nothing else. */
export function fills(): Fills {
  const kept = new Map<string, (data: unknown) => Child>();
  let next = 0;
  return {
    keep(render) {
      const id = `fill-${++next}`;
      kept.set(id, render);
      return id;
    },
    fill(id, data) {
      const render = kept.get(id);
      if (!render) throw new Error(`no render prop is kept as ${id}`);
      return renderToText(render(data));
    },
    has: (id) => kept.has(id),
  };
}

// Which registry a placeholder writes into, for as long as one render lasts. It rides the async
// context rather than a module variable: two renders in one process each see their own, and so
// will a render that one day awaits in the middle.
const rendering = new AsyncLocalStorage<Fills>();

/** Render `body` against a registry of its own, and hand back both. Never overlaps another. */
export function withFills<T>(body: () => T): { rendered: T; fills: Fills } {
  const mine = fills();
  return { rendered: rendering.run(mine, body), fills: mine };
}

function children(props: Props): Child {
  return (props["children"] ?? null) as Child;
}

/** A body wrapped in the tag the model reads it under, or nothing at all when the body is empty. */
export function tagged(name: string, body: string): string {
  return body ? `<${name}>\n${body}\n</${name}>` : "";
}

function lines(props: Props): string {
  return blocks(children(props)).join("\n");
}

// The marker carries the props the server needs and, when the view wrote `{facts => …}`, the id of
// the function that will shape the answer. JSON keeps the props readable and unambiguous. The
// payload is read by the runtime and never by JavaScript, so its keys are the wire's snake_case:
// the view writes `minScore` and the marker carries `min_score`.
function placeholder(name: string, props: Props, keys: Record<string, string>): string {
  const payload: Record<string, unknown> = {};
  for (const [prop, key] of Object.entries(keys)) {
    if (props[prop] !== undefined) payload[key] = props[prop];
  }
  const child = props["children"];
  if (typeof child === "function") {
    const current = rendering.getStore();
    if (current === undefined) {
      throw new Error(`<${name}> was given a render prop outside a render; call render() or withFills()`);
    }
    payload["fill"] = current.keep(child as (data: unknown) => Child);
  }
  return marker(name, JSON.stringify(payload));
}
