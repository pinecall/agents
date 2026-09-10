/** The three hooks: what happens when a call starts, when it ends, and when memory is written. */

import { withAuthorAsync } from "./authors.js";
import type { EventMeta } from "./accepts.js";

/** The call an agent is answering, as much of it as this seam needs to name. */
export interface Call {
  id: string;
  contact: string;
  from?: string;
  channel?: string;
}

/** One thing the agent decided to remember or to forget about this contact. */
export interface MemoryOp {
  op: "remember" | "forget";
  key: string;
  value?: unknown;
}

/** The hooks an app may override. All four are no-ops until the app says otherwise. */
export interface Lifecycle {
  onCall(call: Call): unknown;
  onEnd(call: Call): unknown;
  onMemory(ops: MemoryOp[], call: Call): unknown;
  onEvent(name: string, data: Record<string, unknown>, meta: EventMeta): unknown;
}

export type HookName = keyof Lifecycle;

/**
 * Run one hook with its writes authored by it. A hook is the one other place besides a tool where
 * assigning state is legal — `onCall` restoring the last conversation is the reason it exists.
 */
export function runHook<K extends HookName>(
  agent: Lifecycle,
  hook: K,
  ...args: Parameters<Lifecycle[K]>
): Promise<unknown> {
  const method = agent[hook] as (...rest: unknown[]) => unknown;
  return withAuthorAsync(`hook:${hook}`, () => method.apply(agent, args));
}
