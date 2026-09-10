/** The tags a view is written in: prose blocks and standing rules, rendered to text and to nothing else. */

import { blocks, renderInline, renderToText, type Child, type Component, type Props } from "./jsx-runtime.js";

/** The whole prompt of a view, its children one paragraph apart. */
export const Prompt: Component = (props) => renderToText(children(props));

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

/** A body wrapped in the tag the model reads it under, or nothing at all when the body is empty. */
export function tagged(name: string, body: string): string {
  return body ? `<${name}>\n${body}\n</${name}>` : "";
}

function children(props: Props): Child {
  return (props["children"] ?? null) as Child;
}

function lines(props: Props): string {
  return blocks(children(props)).join("\n");
}
