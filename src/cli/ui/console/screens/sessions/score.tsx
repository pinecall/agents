/** The post-call score, judge by judge, with the evidence each cites and what the opinion cost. */

import { CallScoreSchema, type CallScore, type Judgment } from "@pinecall/protocol";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { GatewayError, post } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { euros } from "../../lib/format";
import { useScopes } from "../../lib/whoami";
import { Button, Card, CardHead, Pill, type Tone } from "../../ui";

const VERDICT_TONE: Record<string, Tone> = { held: "green", broken: "red", deferred: "amber", skipped: "muted" };

// The card is ordered the way the scorer runs: the standing, every judge that answered, the judges
// of the panel that answered nothing (drawn dim, never green: a card that pretended otherwise would
// be the console lying about coverage), then the bill.
export function ScoreCard({ call, back, score: sealed, turns, ended }: { call: string; back: string; score: CallScore | null; turns: number; ended: boolean }): ReactNode {
  // A verdict asked for here replaces the one the log was sealed with, on this screen, at once.
  const [asked, setAsked] = useState<CallScore | null>(null);
  const score = asked ?? sealed;
  return (
    <Card>
      <CardHead title="Score" meta={score !== null && score.passed != null ? `${held(score)} of ${score.judges.length} held` : undefined} />
      <div className="ui-card-body">
        {score === null ? (
          <>
            <div className="session-standing session-standing-amber">Not scored yet</div>
            <p className="session-sentence">
              The call is still running, or its log was sealed before the judges existed. Ask for one with{" "}
              <span className="ui-fixed">pinecall eval {call}</span>.
            </p>
            {ended && <AttachAJudge call={call} onJudged={setAsked} />}
          </>
        ) : score.passed == null ? (
          <>
            <div className="session-standing session-standing-amber">No judge was given to this session</div>
            {saysMore(score.not_judged) && <p className="session-sentence">{score.not_judged}</p>}
            <p className="session-sentence">{billOf(score, turns)}</p>
            {ended && <AttachAJudge call={call} onJudged={setAsked} />}
          </>
        ) : (
          <>
            <div className={score.passed ? "session-standing session-standing-green" : "session-standing session-standing-red"}>
              {score.passed ? "Passed" : "Did not pass"}
            </div>
            <div className="session-judges">
              {score.judges.map((judge) => (
                <JudgeRow key={judge.name} back={back} call={call} judgment={judge} />
              ))}
              {(score.panel ?? [])
                .filter((name) => !score.judges.some((judge) => judge.name === name))
                .map((name) => (
                  <div key={name} className="session-judge">
                    <div className="session-judge-line">
                      <span className="session-judge-name">{name}</span>
                      <Pill tone="muted">on the panel</Pill>
                    </div>
                    <div className="session-judge-reason">Was run over this call and answered nothing.</div>
                  </div>
                ))}
            </div>
            <p className="session-sentence">{billOf(score, turns)}</p>
          </>
        )}
      </div>
    </Card>
  );
}

function JudgeRow({ back, call, judgment }: { back: string; call: string; judgment: Judgment }): ReactNode {
  return (
    <div className="session-judge">
      <div className="session-judge-line">
        <span className="session-judge-name">{judgment.name}</span>
        <Pill tone={VERDICT_TONE[judgment.verdict] ?? "muted"}>{judgment.verdict}</Pill>
        {judgment.evidence.seqs.map((seq) => (
          <Link key={seq} className="session-seq" to={`${back}/${call}#seq-${seq}`}>
            seq {seq}
          </Link>
        ))}
      </div>
      <div className="session-judge-reason">
        {judgment.reason}
        {judgment.evidence.said != null && <span className="session-judge-said"> “{judgment.evidence.said}”</span>}
      </div>
    </div>
  );
}

// The runtime's own reason, when it says more than the heading above it already does.
function saysMore(reason: string | null | undefined): reason is string {
  return reason !== null && reason !== undefined && reason.trim().toLowerCase() !== "no judge was given to this session";
}

function held(score: CallScore): number {
  return score.judges.filter((judge) => judge.verdict === "held").length;
}

/** One sentence about the only part of this that cost money. */
function billOf(score: CallScore, turns: number): string {
  const replayed = `${turns === 1 ? "One turn" : `${turns} turns`} replayed from the log`;
  if (score.judge_calls === 0) return `${replayed}; the hard policies alone, and they cost nothing.`;
  return `${replayed}; ${score.judge_calls} judge call${score.judge_calls === 1 ? "" : "s"} for ${euros(score.judge_cost_eur)}.`;
}

/**
 * The hang-up's judges, run now over a call nobody judged (POST /v1/evals/judge/{call}, the
 * runtime's console-api.md §6). It costs what judging it at hang-up would have, under the same
 * ceiling, and writes the verdict onto the call's own log.
 */
function AttachAJudge({ call, onJudged }: { call: string; onJudged: (score: CallScore) => void }): ReactNode {
  const credentials = useCredentials();
  const scopes = useScopes();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  if (scopes !== null && !scopes.includes("evals")) return null;

  const judge = async (): Promise<void> => {
    setBusy(true);
    setRefused(null);
    try {
      onJudged(CallScoreSchema.parse(await post(credentials, `/v1/evals/judge/${encodeURIComponent(call)}`, {})));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="session-attach">
      <Button size="md" disabled={busy} onClick={() => void judge()}>
        {busy ? "Judging…" : "Attach a judge"}
      </Button>
      {refused !== null && <p className="session-sentence session-refused-line">{refused}</p>}
    </div>
  );
}
