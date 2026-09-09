/** An outside fact off the wire, dispatched to the instance serving that call — or dropped. */

import { emitEvent, withAuthorAsync, type EventHeard } from "../agent/agent.js";
import { accepts, type EventMeta, type EventSource } from "../agent/accepts.js";
import type { CallWorld } from "../call/call.js";

/** One event.received entry, in the shape the wire carries it. */
export interface Received {
  name: string;
  data: Record<string, unknown>;
  source: EventSource;
  identity?: string;
  seq: number;
}

/** What the dispatcher needs of the live instance: the class it is, and the call it is serving. */
export interface Serving {
  agent: object;
  ctor: Function;
  call: CallWorld;
  /** The (call, name) pairs already warned about, so a chatty sender warns once and not once a second. */
  warned: Set<string>;
  /** The events of this call, one after another: the cause a write names is the event running. */
  queue: Promise<unknown>;
}

/**
 * Dispatch after every event before it has finished. The cause lives on the call while a hook runs,
 * so two hooks awaiting at once would name each other's event; one at a time, in the order the wire
 * delivered them, is also the only order a tenant can reason about.
 */
export function inOrder(serving: Serving, received: Received): Promise<boolean> {
  const next = serving.queue.then(() => dispatch(serving, received));
  // A hook that threw must not jam every later event behind it; the rejection is the caller's.
  serving.queue = next.catch(() => undefined);
  return next;
}

/**
 * Hand the event to `onEvent`, or drop it. The gate is the pair, not the name: an event declared
 * `from: ["app"]` that arrives from a participant's browser is somebody else's event with our
 * name on it, and the hook never sees it.
 *
 * A write inside the hook is authored `event:<name>`, and the call carries the cause while the
 * hook runs so the bridge can say in the log which event moved the field.
 */
export async function dispatch(serving: Serving, received: Received): Promise<boolean> {
  const { name, data, source, seq } = received;
  if (!accepts(serving.ctor, name, source)) {
    warn(serving, name, source);
    return false;
  }
  const meta: EventMeta = { source, seq, ...(received.identity === undefined ? {} : { identity: received.identity }) };
  const hook = (serving.agent as { onEvent: (n: string, d: Record<string, unknown>, m: EventMeta) => unknown }).onEvent;
  serving.call.cause = { name, seq };
  try {
    await withAuthorAsync(`event:${name}`, () => hook.call(serving.agent, name, data, meta));
  } finally {
    serving.call.cause = null;
  }
  const heard: EventHeard = { name, data, meta };
  emitEvent(serving.agent, heard);
  return true;
}

// One line per (call, name): a backend that sends an undeclared event sends it every time, and a
// log that repeats itself is a log nobody reads.
function warn(serving: Serving, name: string, source: EventSource): void {
  const key = `${serving.call.id}:${name}`;
  if (serving.warned.has(key)) return;
  serving.warned.add(key);
  console.warn(`pinecall: event ${name} from ${source} is not declared by this agent; dropped`);
}
