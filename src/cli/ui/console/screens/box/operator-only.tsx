/** The gate in front of every screen of the box's: drawn for an operator, and for nobody else. */

import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useOrg } from "../../lib/org";

/**
 * Nothing until the box has said who is asking, then the screen or the front page. It is what
 * keeps a path typed by hand from knocking at the operator's doors with a key they refuse — a 401
 * there would read as a dead key and sign the person out.
 */
export function OperatorOnly({ children }: { children: ReactNode }): ReactNode {
  const { operator } = useOrg();
  if (operator === null) return null;
  return operator ? children : <Navigate to="/" replace />;
}
