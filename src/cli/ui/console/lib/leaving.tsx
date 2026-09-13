/** How a person leaves: one function, called by the header and honoured by main.tsx. */

import { createContext, useContext, type ReactNode } from "react";

const Held = createContext<(() => void) | null>(null);

export function LeavingProvider({ value, children }: { value: () => void; children: ReactNode }): ReactNode {
  return <Held value={value}>{children}</Held>;
}

/** The one move that ends a session. Mounting without it is a bug, not a state. */
export function useLeaving(): () => void {
  const held = useContext(Held);
  if (held === null) throw new Error("the console was mounted without a way out");
  return held;
}
