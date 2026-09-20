/** The tags a view is written in: a panel beside a conversation, drawn by the console in its own theme. */

import type { Props } from "./jsx-runtime.js";
import { said, type Panels, type Tone, type ViewNode } from "./nodes.js";

// A tag of this catalogue in a PROMPT would render as the text of its children and say nothing
// about what it meant, which is a panel silently leaking into what the model reads. Both runtimes
// call the function body, so refusing here is refusing in the one place both of them pass.
const NOT_A_PROMPT = (tag: string): string => `<${tag}> belongs to a view, not to a prompt: render() writes text, view() draws a panel`;

function tag(name: string, node: (props: Props, children: ViewNode[]) => ViewNode | null): Panels {
  const component: Panels = () => {
    throw new TypeError(NOT_A_PROMPT(name));
  };
  component.node = node;
  return component;
}

/** A titled block of the panel. Several in one view are drawn one under the other. */
export const Panel = tag("Panel", (props, children) => ({
  tag: "panel",
  title: props["title"] === undefined ? null : said(props["title"]),
  children,
}));

/** A run of labelled lines: the facts of the thing the panel is about. */
export const Rows = tag("Rows", (_props, children) => ({ tag: "rows", children }));

/** One labelled line: `Alta · 12 Mar 2024`. */
export const Row = tag("Row", (props, children) => ({
  tag: "row",
  label: said(props["label"]),
  value: props["value"] === undefined ? textOf(children) : said(props["value"]),
}));

/** One number, drawn big: how many, how much, how long. */
export const Stat = tag("Stat", (props) => ({ tag: "stat", label: said(props["label"]), value: said(props["value"]) }));

/**
 * A small table. `columns` names the headings and `rows` is a row per line — each an array in the
 * columns' order, or an object read by the columns' own names.
 */
export const Table = tag("Table", (props) => {
  const columns = Array.isArray(props["columns"]) ? props["columns"].map(said) : [];
  const given = Array.isArray(props["rows"]) ? props["rows"] : [];
  return { tag: "table", columns, rows: given.map((row) => cells(row, columns)) };
});

/** A word about how something stands, in the console's own colours: neutral, good, warn, bad. */
export const Badge = tag("Badge", (props, children) => ({
  tag: "badge",
  tone: toneOf(props["tone"]),
  text: props["text"] === undefined ? textOf(children) : said(props["text"]),
}));

/** A line of prose, for what no row or number says. */
export const Text = tag("Text", (_props, children) => {
  const text = textOf(children);
  return text === "" ? null : { tag: "text", text };
});

const TONES: readonly Tone[] = ["neutral", "good", "warn", "bad"];

function toneOf(given: unknown): Tone {
  return typeof given === "string" && (TONES as readonly string[]).includes(given) ? (given as Tone) : "neutral";
}

// One row of a table, whichever way the tenant holds their data: the columns' order, or the
// columns' names read off an object.
function cells(row: unknown, columns: string[]): string[] {
  if (Array.isArray(row)) return row.map(said);
  if (row !== null && typeof row === "object") return columns.map((column) => said((row as Record<string, unknown>)[column]));
  return [said(row)];
}

// What the children of a tag that carries text say, joined as one line.
function textOf(children: ViewNode[]): string {
  return children
    .map((node) => (node.tag === "text" ? node.text : ""))
    .filter((text) => text !== "")
    .join(" ");
}
