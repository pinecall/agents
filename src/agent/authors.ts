/** Who is writing the state right now: the author every change carries, and the write that has none. */

import { AsyncLocalStorage } from "node:async_hooks";

// Who is writing right now, carried by the async context and not by a module-level stack: one
// process runs many calls at once, and a tool that awaits its agenda while another tool runs would
// otherwise read the other tool's name off the top of a shared stack. AsyncLocalStorage follows
// each tool's own chain of awaits, so a write inside it is authored by it and by nothing else.
const author = new AsyncLocalStorage<string>();

/** The name of whoever is writing state right now, or null when nobody claimed the write. */
export function currentAuthor(): string | null {
  return author.getStore() ?? null;
}

/** Run `body` with every state write inside it attributed to `author`. */
export function withAuthor<T>(name: string, body: () => T): T {
  return author.run(name, body);
}

/** Like withAuthor, for a tool or a hook that returns a promise: the awaits inside keep the name. */
export function withAuthorAsync<T>(name: string, body: () => Promise<T> | T): Promise<T> {
  return author.run(name, async () => await body());
}

/** A field assigned with no tool and no hook running: the framework refuses it by design. */
export class UnauthoredWrite extends Error {
  constructor(field: string) {
    super(
      `state field ${field} was assigned outside a tool and outside a lifecycle hook; ` +
        `tools are the only writers of state`,
    );
    this.name = "UnauthoredWrite";
  }
}
