/** Whose console this is: the person, or the org, on the key this tab holds, and the key's id. */

import type { ReactNode } from "react";

import { useWhoami } from "../lib/whoami";

/**
 * The header's right-hand end. A person looking at a screen of calls should be able to see whose
 * console it is without grepping for anything — the question `whoami` was written to answer: the
 * org, the key's id, and the label or the person. Never the key, never its hash.
 */
export function Whose(): ReactNode {
  const whose = useWhoami();
  if (whose === null) return null;
  const who = whose.name ?? whose.label;
  return (
    <span className="head-whose fixed">
      {whose.org}
      <span className="head-sep"> · </span>
      {whose.key_id}
      {who !== null && who !== undefined && (
        <>
          <span className="head-sep"> · </span>
          {who}
        </>
      )}
    </span>
  );
}
