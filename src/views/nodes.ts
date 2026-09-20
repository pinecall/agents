/** The other end of the JSX runtime: the same tags rendered to a TREE a console draws, never to DOM. */

import { Fragment, type Child, type Component, type Element, type Props } from "./jsx-runtime.js";

/** How a badge reads. The console owns the colours; a view says what it means, not what it is. */
export type Tone = "neutral" | "good" | "warn" | "bad";

/**
 * One node of a view. The vocabulary is CLOSED: a console draws these seven with its own
 * components, in its own theme, so a panel written by a tenant cannot lay a colour, a font or a
 * script on the page it is drawn in. Nothing here is HTML and nothing here is React.
 */
export type ViewNode =
  | { tag: "panel"; title: string | null; children: ViewNode[] }
  | { tag: "rows"; children: ViewNode[] }
  | { tag: "row"; label: string; value: string }
  | { tag: "stat"; label: string; value: string }
  | { tag: "table"; columns: string[]; rows: string[][] }
  | { tag: "badge"; tone: Tone; text: string }
  | { tag: "text"; text: string };

/** What a component of the catalogue carries: how to build its node once its children are read. */
export interface Panels extends Component {
  /** Set on the catalogue's tags. A tag without it is a plain function and is simply called. */
  node?: (props: Props, children: ViewNode[]) => ViewNode | null;
}

/** A value as a view shows it: a number is written out, and nothing at all is an empty string. */
export function said(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * The tree one child renders to. A tag of the catalogue becomes its node; any other function is
 * called and its answer rendered, so a view may be composed of the tenant's own components; a
 * string or a number is a line of text.
 *
 * A component that returns a promise is NOT awaited: a view's own function may be async — it is
 * awaited before this is called — but a tag inside one may not, because a tree half resolved is a
 * panel that draws half of itself.
 */
export function renderToNodes(child: Child): ViewNode[] {
  if (child === null || child === undefined || typeof child === "boolean") return [];
  if (typeof child === "string") return child.trim() === "" ? [] : [{ tag: "text", text: child.trim() }];
  if (typeof child === "number") return [{ tag: "text", text: String(child) }];
  if (Array.isArray(child)) return child.flatMap(renderToNodes);
  return nodesOfElement(child);
}

function nodesOfElement(element: Element): ViewNode[] {
  const { type, props } = element;
  if (type === Fragment) return renderToNodes(childrenOf(props));
  if (typeof type === "function") {
    const tag = type as Panels;
    if (tag.node === undefined) return renderToNodes(tag(props));
    const node = tag.node(props, renderToNodes(childrenOf(props)));
    return node === null ? [] : [node];
  }
  // A lowercase tag belongs to the prompt's runtime, where `<p>` is a paragraph. In a view it is
  // its children and nothing else: a view has no intrinsic tags of its own by design.
  return renderToNodes(childrenOf(props));
}

function childrenOf(props: Props): Child {
  return (props["children"] ?? null) as Child;
}
