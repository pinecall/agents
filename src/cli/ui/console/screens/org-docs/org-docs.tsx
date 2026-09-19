/** Docs: every base the org pushed in this world, its size, its embedder, and which agents read it. */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { useCredentials } from "../../../shared/credentials";
import { dayAndTime } from "../../lib/format";
import { Card, Empty, Page, PageHead, Refused, TableHead, TableRow } from "../../ui";
import { readBasesRead, type BaseRead } from "./door";

const COLUMNS = "minmax(0,1fr) 90px 140px 150px minmax(0,1fr)";

function saidBy(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}

// The agent's own Docs tab pushes a folder and asks a golden; this is the org's view across
// every base, and the one column it adds is WHO reads each — off every agent's newest settings.
// Pushing and attaching are the terminal's (`pinecall docs`), and the Settings tab's.
export function OrgDocs(): ReactNode {
  const credentials = useCredentials();
  const [bases, setBases] = useState<BaseRead[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readBasesRead(credentials).then(
      (read) => {
        if (!gone) setBases(read);
      },
      (failed: unknown) => {
        if (!gone) setRefused(saidBy(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  return (
    <Page width={1060} tight>
      <PageHead title="Docs" ledeWidth={640} lede="Every base pushed in this world, and which agents search it. A base is pushed from a project's docs/ folder (`pinecall docs push`) and attached to an agent in its Settings." />

      <Refused>{refused}</Refused>

      <Card>
        {bases === null ? (
          <Empty>{refused === null ? "Asking the gateway…" : "The bases could not be read."}</Empty>
        ) : bases.length === 0 ? (
          <Empty>No base pushed yet. `pinecall docs push` from a project sends its folder here.</Empty>
        ) : (
          <>
            <TableHead columns={COLUMNS} labels={["Base", "Chunks", "Embedder", "Pushed", "Read by"]} />
            {bases.map((one) => (
              <TableRow key={one.base} columns={COLUMNS}>
                <span className="ui-cell-strong ui-clip">{one.base}</span>
                <span className="ui-cell-ink">{one.chunks}</span>
                <span className="ui-cell ui-clip">{one.model}</span>
                <span className="ui-cell">{dayAndTime(one.pushed_at)}</span>
                <span className="ui-cell ui-clip">
                  {one.agents.length === 0
                    ? "nobody"
                    : one.agents.map((agent, at) => (
                        <span key={agent}>
                          {at > 0 && ", "}
                          <Link to={`/a/${encodeURIComponent(agent)}/settings`}>{agent}</Link>
                        </span>
                      ))}
                </span>
              </TableRow>
            ))}
          </>
        )}
      </Card>
    </Page>
  );
}
