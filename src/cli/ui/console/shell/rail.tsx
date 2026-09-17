/** The rail: the gateway's screens, then every agent it holds, the one on screen opened to its screens. */

import type { ReactNode } from "react";
import { NavLink } from "react-router";

import { RailGroup, RailLink } from "../../shared/frame";
import { AGENT_SCREENS, MODE, ORG_SCREENS, screensOf } from "../lib/mode";
import { opens } from "../lib/scopes";
import { bySlug, meIn } from "../lib/corners";
import { useHeldAgents } from "../lib/use-held-agents";
import { useWhoami } from "../lib/whoami";
import { useScopes } from "../lib/whoami";

/**
 * The gateway, then its agents. Every agent the gateway holds is a row; the one whose screen
 * this is stands open, its screens indented under it, so the rail reads as the thing it is: one
 * gateway, holding agents, each with the same screens. Which screens there are is lib/mode.ts. It used to draw the agent's screens
 * ABOVE the gateway's, as if the agent held the gateway (2026-09-16).
 */
export function Rail({ agent }: { agent: string }): ReactNode {
  // Until whoami answers, every scope: nothing flickers off and back on when the key turns out
  // to open it. What the key does not open is then not drawn, so no click meets a 403.
  const scopes = useScopes();
  // Agents and not corners: one slug two people are running is one agent against the plan,
  // and a badge reading 2 beside a fleet of one would be a lie a key's reach invented.
  const agents = bySlug(useHeldAgents().agents, meIn(useWhoami()));
  const open = (screen: string): boolean => scopes === null || opens(scopes, screen);
  const hint = (screen: string): string => (screen === "agents" && agents.length > 0 ? String(agents.length) : "");

  return (
    <>
      <RailGroup label={MODE === "local" ? "Sandbox" : "Gateway"}>
        {screensOf(ORG_SCREENS).filter((screen) => open(screen.key)).map((screen) => (
          <RailLink
            key={screen.key}
            to={`/${screen.path}`}
            end={screen.path === ""}
            name={screen.name}
            hint={hint(screen.key)}
          />
        ))}
      </RailGroup>
      <RailGroup label="Agents">
        {agents.length === 0 && <span className="rail-none">none held here</span>}
        {agents.map((held) => {
          const here = held.slug === agent;
          return (
            <div key={held.slug} className={here ? "rail-agent rail-agent-here" : "rail-agent"}>
              <NavLink to={`/a/${held.slug}/talk`} className="rail-link rail-agent-name">
                <span className="rail-agent-dot" />
                <span className="fixed">{held.slug}</span>
              </NavLink>
              {here && (
                <div className="rail-sub">
                  {screensOf(AGENT_SCREENS).filter((screen) => open(screen.key)).map((screen) => (
                    <RailLink key={screen.path} to={`/a/${agent}/${screen.path}`} name={screen.name} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </RailGroup>
      <div className="rail-foot fixed">
        web · whatsapp · phone
        <br />
        <span className="rail-foot-line">one agent, three doors</span>
      </div>
    </>
  );
}
