/** Which world this tab looks at, and how it turns to the other one: one context the toggle drives. */

import { createContext, useContext, type ReactNode } from "react";

import type { World } from "./session-key";

/** The world on screen, and the one move that changes it. */
export interface Worlds {
  world: World;
  /** Turn to the other world: a kept key, or one minted for the same person. Rejects with the refusal. */
  turnTo: (world: World) => Promise<void>;
}

const Held = createContext<Worlds | null>(null);

export function WorldProvider({ value, children }: { value: Worlds; children: ReactNode }): ReactNode {
  return <Held value={value}>{children}</Held>;
}

/** The world and the turn. Mounting without them is a bug, not a state. */
export function useWorld(): Worlds {
  const held = useContext(Held);
  if (held === null) throw new Error("the console was mounted without a world");
  return held;
}
