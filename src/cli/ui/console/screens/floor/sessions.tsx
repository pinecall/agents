/** Sessions across the floor: every agent's calls in one table, newest first, each naming its agent. */

import type { ReactNode } from "react";

import { useOrg } from "../../lib/org";
import { Page, PageHead } from "../../ui";
import { SessionList } from "../sessions/list";
import "../sessions/sessions.css";

/** The org's table: the very rows an agent's Sessions draws, plus the agent's column and the filters. */
export function FloorSessions(): ReactNode {
  const { lines, floorError, agents } = useOrg();
  // The agents a call names, and the ones held now: a call from an agent gone since is still filterable.
  const slugs = [...new Set([...agents.map((one) => one.slug), ...lines.map((line) => line.agent)])].sort();
  return (
    <Page tight>
      <PageHead title="Sessions" lede="Every conversation the org has had, newest first, whichever agent handled it." />
      <SessionList lines={lines} error={floorError} agent="" agents={slugs} />
    </Page>
  );
}
