/** One session, read as its log: what it was, what was said, how fast, how it was judged, what it cost — and the proof, folded under it. */

import { CallScoreSchema, reduce, TERMINAL_EVENT, type CallScore, type Cost, type Entry, type State } from "@pinecall/protocol";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";

import { dayAndTime, duration, euros, prettyNumber } from "../../lib/format";
import { medians } from "../../lib/metrics";
import { Card, CardHead, Empty, KV, Page, Refused, Stat, Stats } from "../../ui";
import { Actions } from "./actions";
import { Consents, consents } from "./consent";
import { Recording, recordingIn } from "./recording";
import { ScoreCard } from "./score";
import { LatencyCard } from "./strip";
import { Timeline } from "./timeline";
import { transcript } from "./transcript";
import { useFinishedCall } from "./use-finished-call";
import "./sessions.css";

// The order is an auditor's: what this call was, what was said, how fast, what the judges made of
// it, what it cost, and only then the rows that prove all of it. Everything on this page is derived
// from the log — nothing comes from anywhere the CLI could not reach.

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
  // Under an agent the way back is its list; on the org's floor, the org's.
  const back = agent === "" ? "/sessions" : `/a/${agent}/sessions`;
  const slug = agent !== "" ? agent : read.state.agent;

  return (
    <Page tight>
      <div>
        <Link to={back} className="ui-back">
          ← Sessions
        </Link>
        <h1 className="session-title">{call}</h1>
        <Actions agent={slug} call={call} />
      </div>

      {error !== null && (
        <Card>
          <Empty>
            That session did not load. <Refused>{error}</Refused>
          </Empty>
        </Card>
      )}

      {error === null && entries.length === 0 && (
        <Card>
          <Empty>{reading ? `Reading ${call}…` : `No call ${call} in the log.`}</Empty>
        </Card>
      )}

      {entries.length > 0 && (
        <>
          <Facts state={read.state} events={entries.length} />

          <Card pad>
            <div className="session-outcome-label">Outcome</div>
            <div className="session-outcome">{read.state.outcome ?? (read.state.end_reason === null ? "The call is still going." : "The call left no outcome sentence.")}</div>
          </Card>

          <Recording call={call} path={read.recording} />

          <div className="session-split">
            <Transcript state={read.state} />
            <div className="session-side">
              <LatencyCard rows={read.latencies} />
              <ScoreCard call={call} back={back} score={read.score} turns={read.state.turns.length} ended={read.state.status === "ended"} />
            </div>
          </div>

          {read.state.cost !== null && read.state.cost.rows.length > 0 && <CostCard cost={read.state.cost} />}

          <Details>
            {read.consented.length > 0 && (
              <Card>
                <CardHead title="Consent proof" meta="each grant joined to the tool call it authorised" />
                <Consents rows={read.consented} />
              </Card>
            )}

            {Object.keys(read.state.prompt).length > 0 && (
              <Card>
                <CardHead title="The prompt, block by block" meta="by name, hash and length — the text never enters the log" />
                <div className="session-prompt">
                  {Object.entries(read.state.prompt).map(([name, block]) => (
                    <KV key={name} label={name}>
                      <span className="ui-fixed session-hash">{block.hash}</span> · {block.chars} chars · seq {block.seq}
                    </KV>
                  ))}
                </div>
                <div className="session-note">
                  <span className="ui-fixed">pinecall prompt --state</span> prints the text offline.
                </div>
              </Card>
            )}

            <Timeline lines={read.lines} turns={read.state.turns} />
          </Details>
        </>
      )}
    </Page>
  );
}

// A link to `#seq-N` — a judge citing its evidence, a URL somebody pasted — points INTO the log,
// so it opens the details; the log scrolls to the row itself once it is drawn (timeline.tsx).
const A_SEQ = /^#seq-\d+$/;

/** The proof under the page, closed until asked for: consent, the prompt's blocks, the whole log. */
function Details({ children }: { children: ReactNode }): ReactNode {
  const { hash } = useLocation();
  const [open, setOpen] = useState(() => A_SEQ.test(hash));

  useEffect(() => {
    if (A_SEQ.test(hash)) setOpen(true);
  }, [hash]);

  return (
    <>
      <Card>
        <button type="button" className="session-details" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="ui-card-title">Details</span>
          <span className="ui-card-meta">consent, prompt blocks, the full log</span>
          <span className="session-details-caret">{open ? "Hide ▴" : "Show ▾"}</span>
        </button>
      </Card>
      {open && children}
    </>
  );
}

/** What the call was, one small card each, every one read off the log. */
function Facts({ state, events }: { state: State; events: number }): ReactNode {
  return (
    <div className="session-facts">
      <Stats min={150}>
      <Stat size="fact" label="Agent" value={state.agent} />
      <Stat size="fact" label="Channel" value={state.direction === "outbound" ? `${state.channel ?? "—"} · outbound` : (state.channel ?? "—")} />
      <Stat size="fact" label="Started" value={dayAndTime(state.started_at)} />
      <Stat size="fact" label="Duration" value={state.ended_at === null ? "still going" : duration(state)} />
      <Stat size="fact" label="Ended" value={state.end_reason === null ? "not yet" : state.end_reason.replace(/_/g, " ")} />
      <Stat size="fact" label="Cost" value={euros(state.cost?.eur)} />
      <Stat size="fact" label="Turns · events" value={`${state.turns.length} · ${events}`} />
      </Stats>
    </div>
  );
}

/** What was said, turn by turn, and by whom. */
function Transcript({ state }: { state: State }): ReactNode {
  const caller = callerOf(state);
  return (
    <Card>
      <CardHead title={`Transcript · ${state.turns.length} ${state.turns.length === 1 ? "turn" : "turns"}`} meta={caller === null ? undefined : `with ${caller}`} />
      {state.turns.length === 0 ? (
        <Empty>Nobody said anything a turn was written for.</Empty>
      ) : (
        <div className="session-turns">
          {state.turns.map((turn, index) => (
            <div key={`${index}:${turn.role}:${turn.speech_id}`} className="session-turn">
              <span className={turn.role === "agent" ? "session-who session-who-agent" : "session-who"}>{turn.role === "agent" ? "agent" : "caller"}</span>
              <span className={turn.role === "agent" ? "session-said session-said-agent" : "session-said"}>
                {turn.text}
                {turn.role === "agent" && turn.interrupted && <span className="session-interrupted"> · interrupted</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** What each model billed, and the total. */
function CostCard({ cost }: { cost: Cost }): ReactNode {
  return (
    <Card>
      <CardHead title="Cost by model">
        <span className="session-total">{euros(cost.eur)}</span>
      </CardHead>
      <div>
      {cost.rows.map((row) => (
        <div key={`${row.provider}/${row.model}/${row.unit}`} className="session-cost">
          <span className="session-cost-model">
            {row.model} <span className="session-cost-kind">· {row.unit.replace(/_/g, " ")}</span>
          </span>
          <span className="session-cost-units">{grouped(row.quantity)}</span>
          <span className="session-cost-eur">{euros(row.eur)}</span>
        </div>
      ))}
      </div>
      <div className="session-note">
        EUR at {cost.rate.usd_to_eur} per USD, as of {cost.rate.as_of}
        {cost.unpriced.length > 0 && ` · unpriced: ${cost.unpriced.map((row) => `${row.provider}/${row.model}`).join(", ")}`}
      </div>
    </Card>
  );
}

/** `12 457`: thousands apart, the way the design writes a count. */
function grouped(quantity: number): string {
  const [whole, fraction] = String(Math.round(quantity * 100) / 100).split(".");
  const spaced = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction === undefined ? spaced : `${spaced}.${fraction}`;
}

/** Who was on the other end: the contact's name, else the number or the web visitor's id. */
function callerOf(state: State): string | null {
  const name = state.caller?.name;
  if (name !== null && name !== undefined && name !== "") return name;
  const other = state.direction === "outbound" ? state.to : state.from;
  if (other === null) return null;
  return other.startsWith("+") ? prettyNumber(other) : other;
}

function summaryOf(entries: Entry[]): Entry | undefined {
  return [...entries].reverse().find((entry) => entry.type === A_SUMMARY);
}

/** The verdict the log was sealed with, or null while the call is running or nobody sealed it. */
function scoreOf(entries: Entry[]): CallScore | null {
  const sealed = [...entries].reverse().find((entry) => entry.type === TERMINAL_EVENT);
  return sealed === undefined ? null : CallScoreSchema.parse(sealed.data);
}
