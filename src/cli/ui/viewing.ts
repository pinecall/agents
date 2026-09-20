/** The console's panel, drawn by this process: the class's own view, rendered for one conversation. */

import { viewOf, type Who } from "../../agent/view.js";
import { renderToNodes, type ViewNode } from "../../views/nodes.js";
import { anObject, aString } from "./asked.js";
import { Refusal } from "./refusal.js";

// A panel is asked for by a console that already knows the agent declares one — the declaration
// says so (AgentConfig.view). Asked of a process whose class declares none, the answer is not an
// error: it is a panel with nothing in it, and the console draws its own about the contact.
const DRAWS_NONE = (agent: string): string => `${agent} declares no view: nothing in this directory draws a panel`;

/** What the page asks for: whose thread is open, and which conversation it is. */
export interface Asked {
  agent: string;
  contact: string;
  call: string;
}

/** What goes back: the tree, and the name the panel is titled with. */
export interface Drawn {
  name: string;
  nodes: ViewNode[];
}

/** This process's answer to `view.render`, for the class mounted in this directory. */
export interface Viewing {
  render(asked: unknown): Promise<Drawn>;
}

/**
 * The verb, bound to one mounted class. The view is the tenant's own function: it is awaited —
 * that is where a CRM is read — and whatever it returns is rendered to the closed vocabulary of
 * `pinecall/panels`, so what crosses to the browser is data and never code.
 */
export function viewingFrom(ctor: object, slug: string): Viewing {
  return {
    async render(asked: unknown): Promise<Drawn> {
      const said = anObject(asked, "a panel");
      const who: Who = { agent: slug, contact: aString(said, "contact"), call: aString(said, "call") };
      const declared = viewOf(ctor);
      if (declared === undefined) throw new Refusal(404, DRAWS_NONE(slug));
      // A view that throws is the tenant's bug in the tenant's own code: it is refused in its own
      // words, in the pane, rather than taking the conversation's screen down with it.
      try {
        return { name: declared.name, nodes: renderToNodes(await declared.draw(who)) };
      } catch (failed) {
        throw new Refusal(502, `${slug}'s view failed: ${failed instanceof Error ? failed.message : String(failed)}`);
      }
    },
  };
}
