/** What a screen says when it has nothing to show: a sentence, never a spinner. */

import type { ReactNode } from "react";

import "./nothing.css";

export function Nothing({ children }: { children: ReactNode }): ReactNode {
  return <p className="nothing">{children}</p>;
}
