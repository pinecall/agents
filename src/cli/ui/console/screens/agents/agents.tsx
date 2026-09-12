/** The front page: which agents this org holds in this world, so `/` offers a list and not a URL shape. */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { useHeldAgents } from "../../lib/use-held-agents";
import { Nothing } from "../../shell/nothing";
import "./agents.css";

export function Agents(): ReactNode {
  const { agents, error } = useHeldAgents();
  return (
    <section className="agents">
      <h1 className="agents-title">Agents</h1>
      <p className="agents-lede">Which agents this gateway is holding right now. Read once — the list changes when a socket connects.</p>
      {error !== null && <Nothing>{error}</Nothing>}
      {error === null && agents.length === 0 && (
        <Nothing>
          No app is holding an agent on this gateway right now — run{" "}
          <span className="fixed">pinecall run</span> in the app’s directory.
        </Nothing>
      )}
      {agents.length > 0 && (
        <div className="agents-table">
          <div className="agents-head fixed">
            <span>AGENT</span>
            <span>CHANNELS</span>
          </div>
          {agents.map((held) => (
            <Link className="agents-one" key={held.slug} to={`/a/${held.slug}/calls`}>
              <span className="fixed">{held.slug}</span>
              <span className="fixed agents-channels">{held.channels.join(" · ")}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
