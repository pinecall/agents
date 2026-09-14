/** Whose console this is: the person, or the org, on the key this tab holds, and the key's id. */

import type { ReactNode } from "react";

import { orgOf, useWhoami } from "../lib/whoami";

/**
 * The header's right-hand end. A person looking at a screen of calls should be able to see whose
 * console it is without grepping for anything — the question `whoami` was written to answer: the
 * org, the key's id, and the label or the person. Never the key, never its hash.
 *
 * The org by its SLUG: `org` is the id every door takes, and a header reading `org_98889a61509c`
 * tells a person nothing at all. It showed that for as long as this page has existed.
 */
export function Whose(): ReactNode {
  const whose = useWhoami();
  if (whose === null) return null;
  const who = whose.name ?? whose.label;
  return (
    <span className="head-whose fixed">
      {orgOf(whose)}
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
