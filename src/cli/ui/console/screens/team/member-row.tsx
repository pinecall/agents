/** One member: who, what they may do, which agents, their standing — and the three things a change may replace. */

import { useState, type ReactNode } from "react";

import { ROLES, type Member } from "./door";

type Change = { role?: Member["role"]; agents?: string[]; status?: Member["status"] };

/**
 * The row. The role and the agents are edited in place; the standing is one button that says
 * which move is possible — disable, or bring back — because `active` is what accepting an
 * invitation makes a person and never a thing this screen sets on someone still invited.
 */
export function MemberRow({ member, onChange }: { member: Member; onChange: (said: Change) => Promise<void> }): ReactNode {
  const [agents, setAgents] = useState(member.agents.join(" "));
  const standing =
    member.status === "disabled"
      ? { label: "bring back", to: "active" as const }
      : member.status === "active"
        ? { label: "disable", to: "disabled" as const }
        : null;

  return (
    <div className="team-row">
      <span className="team-name">{member.name}</span>
      <span className="fixed team-dim">{member.email}</span>
      <select
        className="team-input team-inline fixed"
        value={member.role}
        onChange={(event) => void onChange({ role: event.target.value as Member["role"] })}
        aria-label={`${member.name}'s role`}
      >
        {ROLES.map((one) => (
          <option key={one} value={one}>
            {one}
          </option>
        ))}
      </select>
      <input
        className="team-input team-inline fixed"
        value={agents}
        placeholder="every agent"
        onChange={(event) => setAgents(event.target.value)}
        onBlur={() => {
          const wanted = agents.split(/[\s,]+/).filter((one) => one !== "");
          if (wanted.join(" ") !== member.agents.join(" ")) void onChange({ agents: wanted });
        }}
        aria-label={`${member.name}'s agents`}
      />
      <span className={`fixed team-status team-status-${member.status}`}>{member.status}</span>
      <span className="team-moves">
        {standing !== null && (
          <button type="button" className="team-link fixed" onClick={() => void onChange({ status: standing.to })}>
            {standing.label}
          </button>
        )}
        {member.status === "invited" && <span className="fixed team-dim">awaiting the invitation</span>}
      </span>
    </div>
  );
}
