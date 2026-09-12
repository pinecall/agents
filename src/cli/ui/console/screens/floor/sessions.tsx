/** Sessions across the floor: every agent's finished calls in one table, newest first, each naming its agent. */

import type { ReactNode } from "react";

import { useFloor } from "../../lib/use-floor";
import { useScores } from "../../lib/use-scores";
import { SessionTable } from "../sessions/finished-calls";
import "./floor.css";

/** The org's table: the very rows an agent's Sessions draws, plus the agent's column. */
export function FloorSessions(): ReactNode {
  const { lines, error } = useFloor();
  const rows = useScores(lines);
  return (
    <div className="floor floor-wide">
      <div className="floor-head">
        <div>
          <h1 className="floor-title">Sessions</h1>
          <p className="floor-lede">Every conversation the org has had, newest first, whichever agent handled it.</p>
        </div>
      </div>
      {error !== null && <p className="floor-empty fixed">{error}</p>}
      <SessionTable rows={rows} withAgent />
    </div>
  );
}
