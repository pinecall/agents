/** An agent's head and its tabs: the name, whether it is on a call, its doors, and its screens. */

import type { ReactNode } from "react";
import { NavLink } from "react-router";

import { AGENT_SCREENS, screensOf } from "../lib/mode";
import { useOrg } from "../lib/org";
import { opens } from "../lib/scopes";
import { useScopes } from "../lib/whoami";
import { Dot } from "../ui";

export function AgentHead({ agent }: { agent: string }): ReactNode {
  const { agents, live } = useOrg();
  const scopes = useScopes();
  const held = agents.find((one) => one.slug === agent);
  const onACall = live.filter((line) => line.agent === agent).length;
  const tabs = screensOf(AGENT_SCREENS).filter((screen) => scopes === null || opens(scopes, screen.key));

  return (
    <>
      <div className="agenthead">
        <div className="agenthead-name">
          <Dot tone={held === undefined ? undefined : "green"} />
          <span className="agenthead-slug">{agent}</span>
          {onACall > 0 ? (
            <span className="agenthead-status ui-pill-green">{onACall === 1 ? "on a call" : `on ${onACall} calls`}</span>
          ) : (
            held !== undefined && <span className="agenthead-status ui-pill-muted">idle</span>
          )}
        </div>
        <span className="agenthead-doors">{held?.channels.join(" · ") || "no doors"}</span>
      </div>
      <nav className="agenttabs" aria-label={`${agent}'s screens`}>
        {tabs.map((screen) => (
          <NavLink key={screen.key} to={`/a/${agent}/${screen.path}`} className={({ isActive }) => (isActive ? "agenttab agenttab-on" : "agenttab")}>
            {screen.name}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
