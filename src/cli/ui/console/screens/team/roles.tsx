/** What each role opens: the one table the invite form points at. */

import type { ReactNode } from "react";

import { Card, CardHead, TableHead, TableRow } from "../../ui";
import type { Member } from "./door";

// A role is a preset of scopes (the runtime's auth/roles): what the next key minted for that person
// opens. Said once, here; the doors themselves read the key's scopes, never the role's name.
export const ROLE_OPENS: Record<Member["role"], { who: string; opens: string }> = {
  qa: { who: "Reads finished calls and the suites", opens: "calls · evals" },
  supervisor: { who: "Sits beside a live call: listens, whispers, takes it over", opens: "calls · evals · supervise · talk" },
  manager: { who: "Runs the floor and the org's accounts, never the agent's declaration", opens: "calls · evals · supervise · talk · numbers · keys · providers · usage · team" },
  developer: { who: "Writes and runs the agent", opens: "app (in the sandbox only) · calls · talk · supervise · pipeline · knowledge · memory · evals" },
  admin: { who: "The org's owner", opens: "every door" },
};

const ORDER: readonly Member["role"][] = ["qa", "supervisor", "manager", "developer", "admin"];
const COLUMNS = "110px minmax(0,1fr) minmax(0,1.4fr)";

export function Roles(): ReactNode {
  return (
    <Card>
      <CardHead title="Roles" meta="a preset of what a person's keys open — changing one changes their next key, not a door" />
      <TableHead columns={COLUMNS} labels={["Role", "Who", "Opens"]} />
      {ORDER.map((role) => (
        <TableRow key={role} columns={COLUMNS}>
          <span className="ui-cell-strong">{role}</span>
          <span className="ui-cell-ink">{ROLE_OPENS[role].who}</span>
          <span className="ui-cell-faint team-role-opens">{ROLE_OPENS[role].opens}</span>
        </TableRow>
      ))}
    </Card>
  );
}
