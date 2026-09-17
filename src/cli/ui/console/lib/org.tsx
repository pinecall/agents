/** The org as every screen shares it: its floor, the agents it holds, and the person's orgs — read once, by the shell. */

import type { HeldAgent, SessionLine } from "@pinecall/protocol";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useCredentials } from "../../shared/credentials";
import { bySlug, meIn } from "./corners";
import { orgsOf, type OrgOf } from "./login";
import type { Connection } from "./stream";
import { useFloor } from "./use-floor";
import { useHeldAgents } from "./use-held-agents";
import { useWhoami } from "./whoami";

// As many rows as the sessions door gives in one page: the sidebar's count, the home's day and the
// floor are all read off it, so one subscription serves them all instead of one per screen.
const ROWS = 200;

export interface Org {
  /** Every call the door lists, newest first, and the live ones among them. */
  lines: SessionLine[];
  live: SessionLine[];
  connection: Connection;
  floorError: string | null;
  /** Every copy the gateway holds, and one row per slug with the reader's own winning. */
  held: HeldAgent[];
  agents: HeldAgent[];
  agentsLoaded: boolean;
  agentsError: string | null;
  /** The person's orgs, or null for a key that names nobody (or before the door answers). */
  orgs: OrgOf[] | null;
  /** The org this key opens, as the person's list names it. */
  here: OrgOf | null;
}

const Held = createContext<Org | null>(null);

export function OrgProvider({ children }: { children: ReactNode }): ReactNode {
  const credentials = useCredentials();
  const whose = useWhoami();
  const floor = useFloor(ROWS);
  const held = useHeldAgents(floor.agentsChanged);
  const [orgs, setOrgs] = useState<OrgOf[] | null>(null);

  useEffect(() => {
    let gone = false;
    orgsOf(credentials).then(
      (listed) => {
        if (!gone) setOrgs(listed);
      },
      () => {
        if (!gone) setOrgs(null);
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const me = meIn(whose);
  const value = useMemo<Org>(
    () => ({
      lines: floor.lines,
      live: floor.lines.filter((line) => line.live),
      connection: floor.connection,
      floorError: floor.error,
      held: held.agents,
      agents: bySlug(held.agents, me),
      agentsLoaded: held.loaded,
      agentsError: held.error,
      orgs,
      here: orgs?.find((one) => one.here) ?? null,
    }),
    [floor.lines, floor.connection, floor.error, held.agents, held.loaded, held.error, orgs, me],
  );
  return <Held value={value}>{children}</Held>;
}

/** The shared org. Mounting a screen outside the shell is a bug, not a state. */
export function useOrg(): Org {
  const held = useContext(Held);
  if (held === null) throw new Error("a screen was mounted outside the shell's org");
  return held;
}
