/** Settings: what the agent runs on, per world and per corner — set a section at a time, kept as versions, rolled back. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";

import type { KnowledgeBase, TuningAnswer, TuningBody, TuningHistory, TuningRow } from "@pinecall/protocol";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { dayAndTime } from "../../lib/format";
import { MODE } from "../../lib/mode";
import { useScopes } from "../../lib/whoami";
import { Card, CardHead, Check, Empty, Page, PageHead, Refused, TableHead } from "../../ui";
import { readBases } from "../docs/door";
import { readPipeline, type Report } from "../pipeline/door";
import { edited, FIELDS, LABEL, readHistory, readSettings, rollbackTo, setSettings, shown } from "./door";
import { sectionsFor, SettingsForm, type Section } from "./form";
import { History } from "./history";
import "./settings.css";

type Corner = "yours" | "team" | "production";

function saidBy(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}

// The gateway's console is production and sets production's corner — the gateway lets a person
// write there while their org lets them act in production, and says so when it does not. The
// sandbox's console sets your own corner, or the team's with the box ticked. Which section is
// open is in the address, so a link lands on it and a reload keeps it.
export function Settings(): ReactNode {
  const credentials = useCredentials();
  const agent = useParams()["agent"] ?? "";
  const scopes = useScopes();
  const [params, setParams] = useSearchParams();
  const [answer, setAnswer] = useState<TuningAnswer | null>(null);
  const [history, setHistory] = useState<TuningHistory | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [bases, setBases] = useState<KnowledgeBase[] | null>(null);
  const [team, setTeam] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const wordsOnly = scopes !== null && !scopes.includes("pipeline");
  const production = MODE === "hosted";
  const offered = sectionsFor(wordsOnly);
  const asked = params.get("section");
  const section: Section = offered.some((one) => one.tab === asked) ? (asked as Section) : offered[0]!.tab;

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
    // The vendors, the models and the voices come off the pipeline report; the bases off the
    // knowledge door. A key that cannot read either sets no vendor and attaches no base.
    readPipeline(credentials, agent).then(
      (read) => !gone && setReport(read),
      (failed: unknown) => {
        if (!gone && !(failed instanceof GatewayError && (failed.status === 403 || failed.status === 404))) setRefused(saidBy(failed));
      },
    );
    readBases(credentials).then(
      (read) => !gone && setBases(read.bases),
      () => !gone && setBases([]),
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent, reread]);

  // What `pinecall agent set` wrote from a terminal is on this page the next time it is looked at:
  // the corners are read again whenever the window comes back, and a corner that moved re-keys
  // the form below onto the newest version.
  useEffect(() => {
    const again = (): void => void reread().catch(() => undefined);
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [reread]);

  const save = async (config: TuningBody, ifVersion: number | null, note: string | null): Promise<void> => {
    setSaving(true);
    setRefused(null);
    try {
      setAnswer(await setSettings(credentials, agent, { config, if_version: ifVersion, note, team }));
      setHistory(await readHistory(credentials, agent, production || team));
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

  const standing = answer === null ? null : edited(answer, production || team);
  // Your corner before you set anything in it runs on the team's: the form opens on that, so what
  // is on screen is what the agent runs on, and the first save writes it with your change.
  const inEffect = standing ?? (answer === null || production || team ? null : answer.team);
  const corners: readonly Corner[] = production ? ["production"] : ["yours", "team", "production"];
  const columns = `150px ${corners.map(() => "minmax(0,1fr)").join(" ")}`;

  return (
    <Page width={1060}>
      <PageHead
        title="Settings"
        ledeWidth={660}
        lede={
          production
            ? "What this agent runs on in production. Every save is a new version with your name on it, and any version can be rolled back."
            : "What this agent runs on in the sandbox: yours to try in your own corner, or the team's, which every corner falls back to. Every save is a version; production has its own page."
        }
      />


      {answer === null && <Empty>{refused ?? "Asking the gateway…"}</Empty>}
      {answer !== null && (
        <>
          {!wordsOnly && !production && (
            <div className="set-corner-pick">
              <Check checked={team} onChange={setTeam}>
                Write the team's corner, which every corner falls back to — not only yours
              </Check>
            </div>
          )}
          <SettingsForm
            // The vendors arrive with the report, and a wire word is read as a vendor or a model
            // against them: the form opens again once they are here.
            key={`${agent}-${team}-${standing?.version ?? 0}-${inEffect?.version ?? 0}-${report === null ? "asking" : "read"}`}
            standing={inEffect?.config ?? {}}
            version={standing?.version ?? null}
            wordsOnly={wordsOnly}
            voices={report?.voices ?? []}
            providers={report?.providers ?? []}
            defaults={report?.defaults ?? {}}
            models={report?.models ?? {}}
            bases={bases}
            section={section}
            onPickSection={(picked) => setParams(picked === offered[0]!.tab ? {} : { section: picked })}
            saving={saving}
            error={refused}
            onSave={save}
          />
        </>
      )}

      <Card>
        <CardHead title={production ? "What is set now" : "Compared, corner by corner"} meta={answer === null ? undefined : answer.world} />
        {answer === null ? (
          <Empty>{refused ?? "Asking the gateway…"}</Empty>
        ) : (
          <>
            <TableHead columns={columns} labels={["", ...corners]} />
            {FIELDS.map((field) => (
              <div key={field} className="ui-table-row" style={{ gridTemplateColumns: columns }}>
                <span className="ui-cell-faint">{LABEL[field]}</span>
                {corners.map((corner) => (
                  <span key={corner} className="ui-clip">
                    {cell(answer[corner], field, corner === "yours")}
                  </span>
                ))}
              </div>
            ))}
            <div className="ui-card-foot set-corners-foot">
              {corners.map((name) => (
                <span key={name}>
                  <b>{name}</b> {answer[name] === null ? "nothing set" : versionLine(answer[name]!)}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

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
