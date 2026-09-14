/** The front page: which agents this org holds in this world, so `/` offers a list and not a URL shape. */

import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { CORNERS, meIn, somebodyElses, through, whoseCorner, type Corners } from "../../lib/corners";
import { useHeldAgents } from "../../lib/use-held-agents";
import { useWhoami } from "../../lib/whoami";
import { Nothing } from "../../../shared/frame";
import "./agents.css";

export function Agents(): ReactNode {
  const { agents, error } = useHeldAgents();
  const me = meIn(useWhoami());
  const [corners, setCorners] = useState<Corners>("everything");
  // The filter is drawn only for a reader the gateway answers with more than their own corner —
  // an admin's key, the operator's. For everybody else there is one corner and nothing to filter.
  const theTeams = agents.some((held) => somebodyElses(held, me));
  const shown = theTeams ? through(agents, corners, me) : agents;
  return (
    <section className="agents">
      <h1 className="agents-title">Agents</h1>
      <p className="agents-lede">Which agents this gateway is holding right now. Read once — the list changes when a socket connects.</p>
      {theTeams && <Corner corners={corners} onPick={setCorners} />}
      {error !== null && <Nothing>{error}</Nothing>}
      {error === null && shown.length === 0 && (
        <Nothing>
          {corners === "everything" ? (
            <>
              No app is holding an agent on this gateway right now — run{" "}
              <span className="fixed">pinecall run</span> in the app’s directory.
            </>
          ) : (
            <>Nothing here is {corners}.</>
          )}
        </Nothing>
      )}
      {shown.length > 0 && (
        <div className="agents-table">
          <div className="agents-head fixed">
            <span>AGENT</span>
            {theTeams && <span>WHOSE</span>}
            <span>CHANNELS</span>
          </div>
          {shown.map((held) => (
            <Link
              className="agents-one"
              key={`${held.slug}/${held.holder?.holder ?? ""}`}
              to={`/a/${held.slug}/calls`}
            >
              <span className="fixed">{held.slug}</span>
              {theTeams && <span className="fixed agents-whose">{whoseCorner(held)}</span>}
              <span className="fixed agents-channels">{held.channels.join(" · ")}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// The sandbox holds one agent per person, so a key that sees the whole team sees the same slug
// several times. Which of them you are looking at is a choice, not a sort: "mine" is what a
// developer came for, "the team's" is what an admin opened this page to find.
function Corner({ corners, onPick }: { corners: Corners; onPick: (one: Corners) => void }): ReactNode {
  return (
    <div className="agents-corners fixed" role="group" aria-label="whose corners">
      {CORNERS.map((one) => (
        <button
          key={one}
          type="button"
          className={one === corners ? "agents-corner agents-corner-here" : "agents-corner"}
          onClick={() => onPick(one)}
          aria-pressed={one === corners}
        >
          {one}
        </button>
      ))}
    </div>
  );
}
