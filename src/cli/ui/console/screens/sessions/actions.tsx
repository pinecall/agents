/** The two things a person does to a call they have just read: re-check it by code, or write it down as a golden. */

import { useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Button, Pill, type Tone } from "../../ui";
import { promoteCall, replayCall, type Promoted, type Replayed } from "../evals/door";

// A check's word, and the tint it wears: the operator's vocabulary, never a judge's four words.
const TONE: Record<string, Tone> = { passed: "green", failed: "red", deferred: "amber", skipped: "muted" };

/**
 * Ring 3 re-checks the call by code — the runtime rebuilds it from its log and answers four
 * verdicts, and nothing is re-run — and promote writes it down as a golden CANDIDATE in the
 * directory the agent's `pinecall start` stands in, for a person to edit before it counts.
 * `pinecall eval <call>` and `pinecall runs promote <call>`, over the same two doors.
 */
export function Actions({ agent, call }: { agent: string; call: string }): ReactNode {
  const credentials = useCredentials();
  const [busy, setBusy] = useState<"" | "check" | "promote">("");
  const [replayed, setReplayed] = useState<Replayed | null>(null);
  const [promoted, setPromoted] = useState<Promoted | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const does = async (what: "check" | "promote"): Promise<void> => {
    setBusy(what);
    setRefused(null);
    try {
      if (what === "check") setReplayed(await replayCall(credentials, call));
      else setPromoted(await promoteCall(credentials, agent, call));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="session-acts">
      <div className="session-buttons">
        <Button size="md" disabled={busy !== ""} onClick={() => void does("check")}>
          {busy === "check" ? "Checking…" : "Re-check by code"}
        </Button>
        <Button size="md" disabled={busy !== "" || agent === ""} onClick={() => void does("promote")}>
          {busy === "promote" ? "Writing…" : "Promote to a golden"}
        </Button>
      </div>
      {replayed !== null && (
        <div className="session-result">
          <span className="session-result-lead">{replayed.passed ? "Holds by code" : "Does not hold by code"}</span>
          {replayed.verdicts.map((verdict) => (
            <Pill key={verdict.check} tone={TONE[verdict.status] ?? "muted"}>
              {verdict.check} {verdict.status}
            </Pill>
          ))}
        </div>
      )}
      {promoted !== null && (
        <div className="session-result">
          <span className="session-result-lead">Written down</span>
          <span className="ui-fixed session-path">{promoted.path}</span>
          <span className="session-result-note">
            {promoted.candidate.input.length} caller {promoted.candidate.input.length === 1 ? "turn" : "turns"}
          </span>
          {promoted.notes.map((note) => (
            <span key={note} className="session-result-note session-result-line">
              {note}
            </span>
          ))}
        </div>
      )}
      {refused !== null && <div className="ui-refused">{refused}</div>}
    </div>
  );
}
