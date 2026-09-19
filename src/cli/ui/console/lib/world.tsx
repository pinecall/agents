/** Which world this console looks at, whose copy, and the move to another org: one context the header reads. */

import { createContext, useContext, type ReactNode } from "react";

import type { World } from "./mode";

/** The world on screen — the console's mode decides it (lib/mode.ts) — and the move to another org of the person's. */
export interface Worlds {
  world: World;
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
