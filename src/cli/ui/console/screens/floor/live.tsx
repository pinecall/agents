/** Live: every call up on the floor right now, across every agent, each a link into its own Calls screen. */

import type { SessionLine } from "@pinecall/protocol";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { isLive } from "../../lib/use-agent-sessions";
import { useFloor } from "../../lib/use-floor";
import { glyphOf } from "../calls/channel-glyph";
import "./floor.css";

/**
 * The floor. The rows are the org's sessions door filtered to the calls still going; the stream
 * of the floor (`/v1/events`) says when to ask again, so a call ringing anywhere shows up before
 * the next tick. Nothing here is folded: a row links to the one screen that reads the call whole.
 */
export function FloorLive(): ReactNode {
  const { lines, connection, error } = useFloor();
  const live = lines.filter(isLive);
  return (
    <div className="floor">
      <div className="floor-head">
        <div>
          <h1 className="floor-title">Live</h1>
          <p className="floor-lede">Every call up on the floor right now, whichever agent has it.</p>
        </div>
        <span className="floor-standing fixed">
          <span className={connection === "live" ? "floor-dot floor-dot-live" : "floor-dot"} aria-hidden />
          {error ?? connection}
        </span>
      </div>
      {live.length === 0 ? (
        <p className="floor-empty fixed">
          Nothing live right now. Leave this open — a call that reaches any agent shows up here as it rings.
        </p>
      ) : (
        <div className="floor-panel">
          <div className="floor-row floor-row-head fixed">
            <span />
            <span>AGENT</span>
            <span>WHO</span>
            <span>STATUS</span>
            <span>CALL</span>
          </div>
          {live.map((line) => (
            <LiveRow key={line.call} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveRow({ line }: { line: SessionLine }): ReactNode {
  return (
    <Link to={`/a/${line.agent}/calls/${line.call}`} className="floor-row floor-row-live">
      <span className="fixed floor-glyph">{glyphOf(line.channel)}</span>
      <span className="fixed">{line.agent}</span>
      <span className="floor-who">{line.caller?.name ?? line.from ?? line.call}</span>
      <span className="fixed floor-status">{line.status}</span>
      <span className="fixed floor-id">{line.call}</span>
    </Link>
  );
}
