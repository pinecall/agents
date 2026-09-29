/** Render the agent class's view as the console panel for one conversation. */

import { viewOf, type Who } from "../../agent/view.js";
import { renderToNodes, type ViewNode } from "../../views/nodes.js";
import { anObject, aString } from "./asked.js";
import { Refusal } from "./refusal.js";

// The console falls back to its own contact panel on this 404.
const DRAWS_NONE = (agent: string): string => `${agent} declares no view: nothing in this directory draws a panel`;

/** Request body for `view.render`. */
export interface Asked {
  agent: string;
  contact: string;
  call: string;
}

/** Rendered panel: its title and node tree. */
export interface Drawn {
  name: string;
  nodes: ViewNode[];
}

/** This process's answer to `view.render`, for the class mounted in this directory. */
export interface Viewing {
  render(asked: unknown): Promise<Drawn>;
}

/**
 * Bind `view.render` to a mounted class. The view may be async; its output is rendered to
 * `pinecall/panels` nodes, so only data reaches the browser.
 */
export function viewingFrom(ctor: object, slug: string): Viewing {
  return {
    async render(asked: unknown): Promise<Drawn> {
      const said = anObject(asked, "a panel");
      const who: Who = { agent: slug, contact: aString(said, "contact"), call: aString(said, "call") };
      const declared = viewOf(ctor);
      if (declared === undefined) throw new Refusal(404, DRAWS_NONE(slug));
      // Report a throwing view in the pane instead of breaking the conversation screen.
      try {
        return { name: declared.name, nodes: renderToNodes(await declared.draw(who)) };
      } catch (failed) {
        throw new Refusal(502, `${slug}'s view failed: ${failed instanceof Error ? failed.message : String(failed)}`);
      }
    },
  };
}
