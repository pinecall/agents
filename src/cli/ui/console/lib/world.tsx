/** Which world this tab looks at, and how it turns to the other one: one context the toggle drives. */

import { createContext, useContext, type ReactNode } from "react";

import type { World } from "./session-key";

/** The world on screen, the one move that changes it, and the move to another org of the person's. */
export interface Worlds {
  world: World;
  /** Turn to the other world: a kept key, or one minted for the same person. Rejects with the refusal. */
  turnTo: (world: World) => Promise<void>;
  /** Move to another org the person belongs to: a key minted for them there, and the console reopened on it. */
  moveTo: (org: string) => Promise<void>;
  /** Whose sandbox copy the doors answer for: a colleague's member id, or null for one's own. */
  corner: string | null;
  /** Open a colleague's copy (an admin, in the sandbox), or null to come back to one's own. */
  lookInto: (corner: string | null) => void;
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
