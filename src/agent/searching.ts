/** Whether a class searches the knowledge base itself: its source, read by oxc's parser for `this.knowledge`. */

import { parseSync } from "oxc-parser";

// Why the parser and not a regex: `this.knowledge` inside a string, a comment or a template is not
// a search, and a regex cannot tell. The AST can. What is looked for is one shape — a member
// expression whose object is `this` and whose property is the word — anywhere in the file, so a
// helper method that searches on the class's behalf counts as much as a tool that does.
const THE_WORD = "knowledge";

/** A node of the tree as the walk sees it: a type, and children under any key. */
interface Node {
  type?: string;
  [key: string]: unknown;
}

/**
 * Whether this source reaches `this.knowledge`. The gateway is told so at registration
 * (`uses_knowledge`), and refuses a world that attaches the class no base — at boot, not in a call
 * where the search would find nothing.
 */
export function searchesKnowledge(source: string, file = "agent.tsx"): boolean {
  const parsed = parseSync(file, source, { sourceType: "module" });
  return reaches(parsed.program as unknown as Node);
}

function reaches(node: Node): boolean {
  if (node.type === "MemberExpression") {
    const object = node["object"] as Node;
    const property = node["property"] as Node;
    if (object.type === "ThisExpression" && property.type === "Identifier" && property["name"] === THE_WORD) return true;
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      if (child.some((one) => isNode(one) && reaches(one))) return true;
    } else if (isNode(child) && reaches(child)) {
      return true;
    }
  }
  return false;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
