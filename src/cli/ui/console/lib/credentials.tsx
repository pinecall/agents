/** Who the console is, for as long as the page is open: the base and the tab's own key, one context, never a global. */

import { createContext, useContext, type ReactNode } from "react";

import type { Credentials } from "./api";

const Held = createContext<Credentials | null>(null);

/** Hand the whole tree the one set of credentials the page was mounted with. */
export function CredentialsProvider({
  value,
  children,
}: {
  value: Credentials;
  children: ReactNode;
}): ReactNode {
  return <Held value={value}>{children}</Held>;
}

/** The credentials every door is opened with. Mounting without them is a bug, not a state. */
export function useCredentials(): Credentials {
  const held = useContext(Held);
  if (held === null) {
    throw new Error("the console was mounted without credentials");
  }
  return held;
}
