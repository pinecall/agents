/** The panel an agent draws beside a conversation: `@view(Customer)` on the class, and what it declares. */

import type { Child } from "../views/jsx-runtime.js";
import { DeclarationRefused } from "./tools.js";

/**
 * Who a panel is being drawn about: the conversation the console has open, as the log names it.
 *
 * It is the CONVERSATION and not the call's state: a panel is read beside threads that ended
 * weeks ago, when no instance of the class is serving anybody. Whatever it shows, the view fetches
 * — from the tenant's own systems, in the tenant's own process, where the credentials for them are.
 */
export interface Who {
  /** The agent whose thread is open. */
  agent: string;
  /** Who the thread is with: their number, their contact id, or a web visitor's id. */
  contact: string;
  /** The newest call of that thread, for a view that wants to read the call itself. */
  call: string;
}

/**
 * A view: what the agent draws for one conversation, in the tags of `pinecall/panels`.
 *
 * It may be async — it is awaited before the tree is rendered — which is the point: a view is
 * where a CRM, an order book or a patient record is read.
 */
export type View = (who: Who) => Child | Promise<Child>;

/** What a class declared: the panel's name, and the function that draws it. */
export interface DeclaredView {
  name: string;
  draw: View;
}

// Kept beside the class rather than on it: a subclass inherits nothing it did not declare, and
// nothing a tenant can collide with is added to their own object.
const VIEWS = new WeakMap<object, DeclaredView>();

/**
 * The class's panel, as a function beside it. `@view(Customer)` names it after the function —
 * `CustomerCard` reads as "Customer card" — and `@view(Customer, "Cliente")` names it outright,
 * because the name is a word a person reads over the panel and so is the business's to choose.
 */
export function view(draw: View, name?: string) {
  return function decorate(ctor: new (...args: never[]) => object): void {
    const standing = VIEWS.get(ctor);
    if (standing !== undefined) {
      throw new DeclarationRefused(`${ctor.name} declares two views (${standing.name} and ${name ?? nameOf(draw)}); a class draws one panel`);
    }
    VIEWS.set(ctor, { name: name ?? nameOf(draw), draw });
  };
}

/** What this class declared, or undefined for a class that draws no panel of its own. */
export function viewOf(ctor: object): DeclaredView | undefined {
  return VIEWS.get(ctor);
}

// `CustomerCard` -> `Customer Card`: the function's own name, spaced, an acronym left alone.
function nameOf(draw: View): string {
  const written = draw.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  if (written === "") return "View";
  return written.charAt(0).toUpperCase() + written.slice(1);
}
