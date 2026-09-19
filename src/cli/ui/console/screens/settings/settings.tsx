/** Settings: what the org set over the class — yours, the team's, production's — set, kept, promoted. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";

import type { TuningAnswer, TuningBody, TuningHistory, TuningRow } from "@pinecall/protocol";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { dayAndTime } from "../../lib/format";
import { MODE } from "../../lib/mode";
import { useScopes } from "../../lib/whoami";
import { Button, Card, CardHead, Check, Empty, Page, PageHead, Refused, TableHead } from "../../ui";
import { readPipeline, type Report } from "../pipeline/door";
import { edited, FIELDS, LABEL, promoteToTeam, readHistory, readSettings, rollbackTo, setSettings, shown } from "./door";
import { SettingsForm } from "./form";
import { History } from "./history";
import "../pipeline/pipeline.css";
import "./settings.css";

const COLUMNS = "140px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

function saidBy(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}

// The gateway's console is production, and production is written by promote alone: the page
// there reads and rolls back, and says which verb writes it. The sandbox's console sets — your own
// corner, or the team's with the box ticked. A key that opens words and not the pipeline sets the
// opening and what is remembered, and sees nothing else as a field.
export function Settings(): ReactNode {
  const credentials = useCredentials();
  const agent = useParams()["agent"] ?? "";
  const scopes = useScopes();
  const [answer, setAnswer] = useState<TuningAnswer | null>(null);
  const [history, setHistory] = useState<TuningHistory | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [team, setTeam] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const wordsOnly = scopes !== null && !scopes.includes("pipeline");
  const production = MODE === "hosted";

  const reread = useCallback(async (): Promise<void> => {
    setAnswer(await readSettings(credentials, agent));
    setHistory(await readHistory(credentials, agent, production || team));
  }, [credentials, agent, team, production]);

  useEffect(() => {
    let gone = false;
    setRefused(null);
    reread().catch((failed: unknown) => {
      if (!gone) setRefused(saidBy(failed));
    });
    // The voices and the vendors come off the pipeline report; a key that cannot read it sets no vendor.
    readPipeline(credentials, agent).then(
      (read) => !gone && setReport(read),
      (failed: unknown) => {
        if (!gone && !(failed instanceof GatewayError && (failed.status === 403 || failed.status === 404))) setRefused(saidBy(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent, reread]);

  const save = async (config: TuningBody, ifVersion: number | null, note: string | null): Promise<void> => {
    setSaving(true);
    setRefused(null);
    try {
      setAnswer(await setSettings(credentials, agent, { config, if_version: ifVersion, note, team }));
      setHistory(await readHistory(credentials, agent, team));
    } catch (failed) {
      setRefused(saidBy(failed));
    } finally {
      setSaving(false);
    }
  };

  const rollBack = async (version: number): Promise<void> => {
    setRefused(null);
    try {
      setAnswer(await rollbackTo(credentials, agent, version, production || team));
      setHistory(await readHistory(credentials, agent, production || team));
      setSaid(`v${version} is the newest again, as a new version.`);
    } catch (failed) {
      setRefused(saidBy(failed));
    }
  };

  const promote = async (): Promise<void> => {
    setRefused(null);
    try {
      const promoted = await promoteToTeam(credentials, agent);
      setSaid(`Yours is the team's v${promoted.version}: every colleague's next call reads it.`);
      await reread();
    } catch (failed) {
      setRefused(saidBy(failed));
    }
  };

  const standing = answer === null ? null : edited(answer, production || team);

  return (
    <Page width={1060} tight>
      <PageHead
        title="Settings"
        ledeWidth={680}
        lede="What the org set over the class, per world and per corner, a version a row: which vendors and models, how the call opens and ends, how a turn is cut, what is remembered, which bases are read. Set here, kept forever, promoted from the sandbox to production once the goldens hold."
      />

      <Card>
        <CardHead title="The three corners" meta={answer === null ? undefined : answer.world} />
        {answer === null ? (
          <Empty>{refused ?? "Asking the gateway…"}</Empty>
        ) : (
          <>
            <TableHead columns={COLUMNS} labels={["", "yours", "team", "production"]} />
            {FIELDS.map((field) => (
              <div key={field} className="ui-table-row" style={{ gridTemplateColumns: COLUMNS }}>
                <span className="ui-cell-faint">{LABEL[field]}</span>
                {[answer.yours, answer.team, answer.production].map((row, at) => (
                  <span key={at} className="ui-clip">
                    {cell(row, field, at === 0)}
                  </span>
                ))}
              </div>
            ))}
            <div className="ui-card-foot set-corners-foot">
              {(["yours", "team", "production"] as const).map((name) => (
                <span key={name}>
                  <b>{name}</b> {answer[name] === null ? "nothing set" : versionLine(answer[name]!)}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      {answer !== null && production ? (
        <Card pad>
          <Empty>
            Production is written by promote, never set here: set it in the sandbox — <code>pinecall serve</code> — and promote it with <code>pinecall agent promote --to production</code>, which runs the agent's goldens first. Rolling back to a version production already ran is allowed below.
          </Empty>
        </Card>
      ) : (
        answer !== null && (
          <>
            {!wordsOnly && (
              <div className="set-corner-pick">
                <Check checked={team} onChange={setTeam}>
                  Write the team's corner, which every corner falls back to — not only yours
                </Check>
                {answer.yours !== null && (
                  <Button size="sm" onClick={() => void promote()}>
                    Promote yours to the team
                  </Button>
                )}
              </div>
            )}
            <SettingsForm
              key={`${agent}-${team}-${standing?.version ?? 0}`}
              standing={standing?.config ?? {}}
              version={standing?.version ?? null}
              wordsOnly={wordsOnly}
              voices={report?.voices ?? []}
              providers={report?.providers ?? []}
              saving={saving}
              error={refused}
              onSave={save}
            />
          </>
        )
      )}

      <History kept={history} canRollBack={!wordsOnly} onRollBack={rollBack} />

      {said !== null && <div className="ui-empty">{said}</div>}
      <Refused>{refused}</Refused>
    </Page>
  );
}

function cell(row: TuningRow | null, field: (typeof FIELDS)[number], yours: boolean): string {
  if (row === null) return yours ? "(team's)" : "—";
  return shown(row.config, field) ?? "—";
}

function versionLine(row: TuningRow): string {
  return `v${row.version} · ${row.author} · ${dayAndTime(row.set_at)}${row.note === null ? "" : ` · “${row.note}”`}`;
}
