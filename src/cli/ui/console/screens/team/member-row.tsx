/** One member: who, what they may do, which agents, their standing — and the things a change may replace. */

import { useState, type ReactNode } from "react";

import { Pill, Select, TextAction, Input } from "../../ui";
import { ROLES, type Member } from "./door";

type Change = { role?: Member["role"]; agents?: string[]; status?: Member["status"] };

/** The table's columns: the design's five, and the move at the end of the row. */
export const COLUMNS = "minmax(0,1fr) minmax(0,1.3fr) 110px 110px 90px 170px";

const TONE = { active: "green", invited: "amber", disabled: "gray" } as const;

/**
 * The row. The role and the agents read as words and turn into a control on a click; the standing
 * is one action that says which move is possible — disable, bring back, or send the invitation
 * again — because `active` is what accepting an invitation makes a person and never a thing this
 * screen sets on someone still invited.
 */
export function MemberRow({
  member,
  onChange,
  onResend,
  onReset,
}: {
  member: Member;
  onChange: (said: Change) => Promise<void>;
  onResend: () => Promise<void>;
  onReset: () => Promise<void>;
}): ReactNode {
  const [editing, setEditing] = useState<"role" | "agents" | null>(null);
  const [agents, setAgents] = useState(member.agents.join(" "));
  const [busy, setBusy] = useState(false);

  const act = async (move: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await move();
    } finally {
      setBusy(false);
    }
  };

  const saveAgents = (): void => {
    setEditing(null);
    const wanted = agents.split(/[\s,]+/).filter((one) => one !== "");
    if (wanted.join(" ") !== member.agents.join(" ")) void act(() => onChange({ agents: wanted }));
  };

  return (
    <div className="ui-table-row" style={{ gridTemplateColumns: COLUMNS }}>
      <span className="ui-cell-strong ui-clip">{member.name}</span>
      <span className="ui-cell ui-clip">{member.email}</span>
      {editing === "role" ? (
        <Select
          size="sm"
          autoFocus
          value={member.role}
          onBlur={() => setEditing(null)}
          onChange={(event) => {
            setEditing(null);
            void act(() => onChange({ role: event.target.value as Member["role"] }));
          }}
          aria-label={`${member.name}'s role`}
        >
          {ROLES.map((one) => (
            <option key={one} value={one}>
              {one}
            </option>
          ))}
        </Select>
      ) : (
        <button type="button" className="team-editable team-role" onClick={() => setEditing("role")} title="Change the role">
          {member.role}
        </button>
      )}
      {editing === "agents" ? (
        <Input
          size="sm"
          autoFocus
          value={agents}
          placeholder="every agent"
          onChange={(event) => setAgents(event.target.value)}
          onBlur={saveAgents}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveAgents();
            if (event.key === "Escape") {
              setAgents(member.agents.join(" "));
              setEditing(null);
            }
          }}
          aria-label={`${member.name}'s agents`}
        />
      ) : (
        <button type="button" className="team-editable team-agents ui-clip" onClick={() => setEditing("agents")} title="Change the agents">
          {member.agents.length === 0 ? "every agent" : member.agents.join(", ")}
        </button>
      )}
      <span className="ui-cell-end">
        <Pill tone={TONE[member.status]}>{member.status}</Pill>
      </span>
      <span className="ui-cell-end">
        {member.status === "active" && (
          <>
            <TextAction disabled={busy} onClick={() => void act(onReset)} title="A one-use link to choose a new password">
              Reset password
            </TextAction>
            <TextAction danger disabled={busy} onClick={() => void act(() => onChange({ status: "disabled" }))}>
              Disable
            </TextAction>
          </>
        )}
        {member.status === "disabled" && (
          <TextAction disabled={busy} onClick={() => void act(() => onChange({ status: "active" }))}>
            Bring back
          </TextAction>
        )}
        {member.status === "invited" && (
          <TextAction disabled={busy} onClick={() => void act(onResend)}>
            Resend invite
          </TextAction>
        )}
      </span>
    </div>
  );
}
