/** The JSX runtime: elements become a small tree and the tree renders to TEXT, never to DOM. */

/** Anything a component may hand back; arrays and falsy values are part of the language. */
export type Child = Element | string | number | boolean | null | undefined | Child[];

export type Props = Record<string, unknown>;

/** A component is a function from props to text — the only kind of tag that carries behaviour. */
export interface Component {
  (props: Props): Child;
  /** Rendered on one line inside its parent instead of as its own paragraph. */
  inline?: boolean;
}

/** The whole tree: a tag and its props. `children` lives in props, as the automatic runtime says. */
export interface Element {
  readonly kind: "element";
  readonly type: string | Component | typeof Fragment;
  readonly props: Props;
}

/** The empty tag: `<>…</>` groups siblings without adding anything of its own to the text. */
export const Fragment = Symbol.for("pinecall.views.fragment");

/** The automatic runtime's element factory; `jsxs` is the same function with many children. */
export function jsx(type: Element["type"], props: Props): Element {
  return { kind: "element", type, props: props ?? {} };
}

export { jsx as jsxs, jsx as jsxDEV };

function childrenOf(props: Props): Child {
  return (props["children"] ?? null) as Child;
}

// A paragraph is one line of prose: the newlines and indentation JSX left in the source are not
// content, so they collapse to single spaces, and the whole thing is trimmed at both ends.
function paragraph(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * One child rendered inline: strings keep their inner spacing exactly as written, because
 * `{name} tiene cita el {day}` is a sentence whose spaces are the author's.
 */
export function renderInline(child: Child): string {
  if (child === null || child === undefined || typeof child === "boolean") return "";
  if (typeof child === "string") return child;
  if (typeof child === "number") return String(child);
  if (Array.isArray(child)) return child.map(renderInline).join("");
  const { type, props } = child;
  if (typeof type === "function") return renderInline(type(props));
  return renderInline(childrenOf(props));
}

/**
 * One child rendered as a block: siblings become paragraphs separated by one blank line,
 * `null`/`false`/`undefined` render nothing at all, and a bare string is trimmed at its ends.
 */
export function renderToText(child: Child): string {
  return blocks(child).join("\n\n");
}

/** Each child as its own block, empties dropped — what a component needs to join them its own way. */
export function blocks(child: Child): string[] {
  if (child === null || child === undefined || typeof child === "boolean") return [];
  if (typeof child === "string") return child.trim() ? [child.trim()] : [];
  if (typeof child === "number") return [String(child)];
  if (Array.isArray(child)) return child.flatMap(blocks);
  const { type, props } = child;
  if (typeof type === "function") {
    if (type.inline) {
      const line = paragraph(renderInline(child));
      return line ? [line] : [];
    }
    return blocks(type(props));
  }
  // The one intrinsic tag: `<p>` is a paragraph. Every other lowercase tag is its children.
  if (type === "p") {
    const line = paragraph(renderInline(childrenOf(props)));
    return line ? [line] : [];
  }
  return blocks(childrenOf(props));
}

/** The type-level half of the runtime: what TypeScript looks for behind `jsxImportSource`. */
type TextElement = Element;

export declare namespace JSX {
  type Element = TextElement;
  /** A tag is a lowercase intrinsic or any function that returns text — never a class. */
  type ElementType = string | ((props: never) => Child) | Component;
  interface ElementChildrenAttribute {
    children: object;
  }
  interface IntrinsicElements {
    p: { children?: Child };
  }
}
