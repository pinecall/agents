/** The screens of one agent, highlighted by the URL: the console keeps no selection of its own. */

import type { ReactNode } from "react";
import { NavLink } from "react-router";

import "./rail.css";

// Talk first: it is the screen a person opens the console for. The rest read the same log.
const SCREENS = [
  { path: "talk", name: "Talk" },
  { path: "chat", name: "Chat" },
  { path: "calls", name: "Calls" },
  { path: "sessions", name: "Sessions" },
  { path: "pipeline", name: "Pipeline" },
  { path: "evals", name: "Evals" },
] as const;

export function Rail({ agent }: { agent: string }): ReactNode {
  return (
    <>
      {agent !== "" && (
        <div className="rail-group">
          <div className="rail-label rail-label-path fixed">{agent}</div>
          {SCREENS.map((screen) => (
          <NavLink
            key={screen.path}
            to={`/a/${agent}/${screen.path}`}
            className={({ isActive }) => (isActive ? "rail-link rail-link-here" : "rail-link")}
          >
              {screen.name}
            </NavLink>
          ))}
        </div>
      )}
      <div className="rail-group">
        <div className="rail-label fixed">Gateway</div>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "rail-link rail-link-here" : "rail-link")}>
          Agents
        </NavLink>
      </div>
      <div className="rail-foot fixed">
        <div>web · whatsapp · phone</div>
        <div>one agent, three doors</div>
      </div>
    </>
  );
}
