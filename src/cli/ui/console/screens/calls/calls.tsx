/** Calls: this agent's calls on the left, and the ones being watched beside them, as they happen. */

import type { ReactNode } from "react";
import { useParams } from "react-router";

import { isLive, liveFirst, useAgentSessions } from "../../lib/use-agent-sessions";
import { Nothing } from "../../shell/nothing";
import { Live } from "../live";
import { CallList } from "./call-list";
import "./calls.css";

// The URL decides what is watched: a call in the path is that call alone, and no call in the path
// is every live one at once. Nothing on this screen is remembered between two reloads.
/** The screen. One Live per watched call, keyed by call id, so no two of them share a thing. */
export function Calls(): ReactNode {
  const params = useParams();
  const agent = params["agent"] ?? "";
  const chosen = params["call"];
  const listed = useAgentSessions(agent);
  const lines = liveFirst(listed.lines);
  const watching = chosen === undefined ? lines.filter(isLive).map((line) => line.call) : [chosen];

  return (
    <section className="calls">
      <CallList agent={agent} lines={lines} standing={listed.error ?? "live"} />
      <div className="calls-watching">
        {watching.length === 0 ? (
          <Nothing>
            Nothing live right now. Open a call from the list to read it, or leave this open — a
            call that arrives shows up here on its own.
          </Nothing>
        ) : (
          watching.map((call) => <Live key={call} call={call} />)
        )}
      </div>
    </section>
  );
}
