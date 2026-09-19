/** The Docs tab's Attached bases card: which bases this agent reads in this console's world, off its settings. */

import type { DocsConfig, TuningAnswer } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { useCredentials } from "../../../shared/credentials";
import { MODE } from "../../lib/mode";
import { Card, CardHead, Empty } from "../../ui";
import { readSettings } from "../settings/door";

function saidBy(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}

/** The bases the corner a session is built from reads: production's, or yours else the team's. */
function basesRead(answer: TuningAnswer): DocsConfig[] {
  const row = MODE === "hosted" ? answer.production : (answer.yours ?? answer.team);
  return row?.config.bases ?? [];
}

// Which bases an agent reads is one field of its settings, and the Settings tab is where it is
// written: this card says what that field reads right now, and points there. One writer per thing.
export function Attached({ agent }: { agent: string }): ReactNode {
  const credentials = useCredentials();
  const [bases, setBases] = useState<DocsConfig[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readSettings(credentials, agent).then(
      (answer) => {
        if (!gone) setBases(basesRead(answer));
      },
      (failed: unknown) => {
        if (!gone) setRefused(saidBy(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent]);

  return (
    <Card>
      <CardHead title="Attached bases" meta="what this agent reads on every call — set in Settings, per corner and versioned" />
      {refused !== null ? (
        <Empty>{refused}</Empty>
      ) : bases === null ? (
        <Empty>Asking the gateway…</Empty>
      ) : bases.length === 0 ? (
        <Empty>
          No base attached: this agent searches nothing. Attach one in <Link to={`/a/${encodeURIComponent(agent)}/settings`}>Settings</Link>, or `pinecall docs attach &lt;base&gt;`.
        </Empty>
      ) : (
        <div className="kb-attached">
          {bases.map((one) => (
            <div key={one.base} className="kb-attached-row">
              <span className="ui-cell-strong">{one.base}</span>
              <span className="ui-cell-faint">
                {one.mode ?? "retrieved"} · k {one.k ?? 8}
                {one.min_score === undefined || one.min_score === null ? "" : ` · min score ${one.min_score}`}
              </span>
            </div>
          ))}
          <div className="ui-card-foot">
            Change them in <Link to={`/a/${encodeURIComponent(agent)}/settings`}>Settings</Link>.
          </div>
        </div>
      )}
    </Card>
  );
}
