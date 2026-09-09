/** One session, read as its log: the envelope, the latency, the consent, the score, then every fact in seq. */

import { CallScoreSchema, reduce, TERMINAL_EVENT, type CallScore, type Entry, type State } from "@pinecall/protocol";
import { useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { started } from "../../lib/clock";
import { medians } from "../../lib/metrics";
import { Consents, consents } from "./consent";
import { duration, euros } from "./finished-calls";
import { Recording, recordingIn } from "./recording";
import { ScoreBreakdown } from "./score";
import { LatencyStrip } from "./strip";
import { Timeline } from "./timeline";
import { transcript } from "./transcript";
import { useFinishedCall } from "./use-finished-call";
import "./sessions.css";

// The order is an auditor's: what this call was, how fast it was, what it was allowed to do, what
// the judges made of it, and only then the rows that prove all of it. Everything above the table
// is derived from the table — nothing on this screen comes from anywhere the CLI could not reach.

// call.summary and NOT the terminal entry: the log seals on call.score, which is a verdict and
// carries no pointer to anything (the runtime's docs/decisions/scoring.md).
const A_SUMMARY = "call.summary";

export function Session(): ReactNode {
  const { agent = "", call = "" } = useParams();
  const { entries, reading, error } = useFinishedCall(call);
  const read = useMemo(
    () => ({
      state: reduce(entries),
      lines: transcript(entries),
      latencies: medians(entries),
      consented: consents(entries),
      recording: recordingIn(summaryOf(entries)?.data),
      score: scoreOf(entries),
    }),
    [entries],
  );

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div className="page-eyebrow">
          <Link to={`/a/${agent}/sessions`}>{agent} / sessions</Link>
        </div>
        <h1 className="page-title page-title-fixed">{call}</h1>
      </header>

      {error !== null && (
        <section className="section">
          <div className="empty">
            <p className="empty-title">That session did not load</p>
            <div className="empty-body">
              <p>
                <code className="mono">{error}</code>
              </p>
            </div>
          </div>
        </section>
      )}

      {error === null && entries.length === 0 && (
        <section className="section">
          <p className="note">{reading ? `reading ${call}…` : `no call ${call} in the log`}</p>
        </section>
      )}

      {entries.length > 0 && (
        <>
          <section className="section">
            <Facts agent={agent} state={read.state} score={read.score} events={entries.length} />
          </section>

          <Recording call={call} path={read.recording} />

          <section className="section">
            <h2 className="section-title">Latency across this call</h2>
            <LatencyStrip rows={read.latencies} />
            <p className="note">
              Median and max over the turns that carried each measure — the same seconds{" "}
              <code className="mono">pinecall-runtime sessions show {call}</code> prints per turn.
            </p>
          </section>

          {read.consented.length > 0 && (
            <section className="section">
              <h2 className="section-title">Consent proof</h2>
              <Consents rows={read.consented} />
            </section>
          )}

          <section className="section">
            <h2 className="section-title">Score</h2>
            <ScoreBreakdown agent={agent} call={call} score={read.score} turns={read.state.turns.length} />
            <p className="note">
              Written into the log itself as <code className="mono">call.score</code>, the entry the log seals on —
              the last row of the table below.
            </p>
          </section>

          {read.state.cost !== null && read.state.cost.rows.length > 0 && (
            <section className="section">
              <h2 className="section-title">Cost by model</h2>
              <div className="panel">
                <div className="panel-body">
                  <table className="kv">
                    <tbody>
                      {read.state.cost.rows.map((row) => (
                        <tr key={`${row.provider}/${row.model}/${row.unit}`}>
                          <td className="kv-key">
                            {row.provider} · {row.model} · {row.unit}
                          </td>
                          <td className="kv-val">
                            {row.quantity} · {euros(row.eur)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="note">
                    EUR at {read.state.cost.rate.usd_to_eur} USD, as of {read.state.cost.rate.as_of}
                    {read.state.cost.unpriced.length > 0 &&
                      ` · unpriced: ${read.state.cost.unpriced.map((row) => `${row.provider}/${row.model}`).join(", ")}`}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="section">
            <h2 className="section-title">The log</h2>
            <Timeline lines={read.lines} turns={read.state.turns} />
            <p className="note">
              {entries.length} entries, append-only, numbered by seq. Live ≡ stored: the tail streams over SSE while
              the call is up and reads identically afterwards.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/** The envelope: one row of labelled facts, every one of them read off the log. */
function Facts({ agent, state, score, events }: { agent: string; state: State; score: CallScore | null; events: number }): ReactNode {
  return (
    <div className="facts">
      <Fact label="agent" value={agent} />
      <Fact label="channel" value={state.channel ?? "—"} accent={state.channel === "phone"} />
      <Fact label="from" value={state.from ?? "—"} />
      <Fact label="started" value={started(state.started_at)} />
      <Fact label="duration" value={duration(state)} />
      <Fact label="ended" value={state.end_reason ?? "running"} />
      <Fact label="outcome" value={state.outcome ?? "—"} />
      <Fact label="cost" value={euros(state.cost?.eur)} />
      <Fact label="score" value={verdictOf(score)} accent={score?.passed === true} />
      <Fact label="turns" value={String(state.turns.length)} />
      <Fact label="events" value={String(events)} />
    </div>
  );
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }): ReactNode {
  return (
    <div className={accent ? "fact fact-accent" : "fact"}>
      <div className="fact-key">{label}</div>
      <div className="fact-val">{value}</div>
    </div>
  );
}

function verdictOf(score: CallScore | null): string {
  if (score === null) return "—";
  if (score.passed == null) return "not judged";
  return score.passed ? "passed" : "did not pass";
}

function summaryOf(entries: Entry[]): Entry | undefined {
  return [...entries].reverse().find((entry) => entry.type === A_SUMMARY);
}

/** The verdict the log was sealed with, or null while the call is running or nobody sealed it. */
function scoreOf(entries: Entry[]): CallScore | null {
  const sealed = [...entries].reverse().find((entry) => entry.type === TERMINAL_EVENT);
  return sealed === undefined ? null : CallScoreSchema.parse(sealed.data);
}
