/** The two things a person does to a call they have just read: re-check it, or write it down. */

import { useState, type ReactNode } from "react";
import { useParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Button, Pill, Refused } from "../../ui";
import { promoteCall, replayCall, type Promoted, type Replayed } from "./door";

/**
 * The two things a person does to a call they have just read. Ring 3 re-checks it by code — the
 * runtime rebuilds the call from its log and answers four verdicts, and nothing is re-run — and
 * promote writes it down as a golden CANDIDATE in this directory's `test/candidates`, carrying
 * `promoted_from`, for a person to edit before it counts as a golden. `pinecall eval <call>` and
 * `pinecall runs promote <call>`, over the same two doors.
 */
export function WhatToDoWithIt({ call }: { call: string }): ReactNode {
  const credentials = useCredentials();
  const agent = useParams()["agent"] ?? "";
  const [busy, setBusy] = useState("");
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
    <div className="ev-acts">
      <div className="ev-acts-buttons">
        <Button size="md" disabled={busy !== ""} onClick={() => void does("check")}>
          {busy === "check" ? "Checking…" : "Re-check by code"}
        </Button>
        <Button size="md" disabled={busy !== ""} onClick={() => void does("promote")}>
          {busy === "promote" ? "Writing…" : "Promote to a golden"}
        </Button>
      </div>
      {replayed !== null && (
        <div className="ui-tags">
          {replayed.verdicts.map((verdict) => (
            <span key={verdict.check} title={verdict.detail}>
              <Pill tone={verdict.status === "passed" ? "green" : verdict.status === "failed" ? "red" : "muted"}>
                {verdict.check} {verdict.status}
              </Pill>
            </span>
          ))}
        </div>
      )}
      {promoted !== null && (
        <div className="ui-note">
          Written to <span className="ui-fixed">{promoted.path}</span> · {promoted.candidate.input.length} caller turn(s)
          {promoted.notes.map((note) => (
            <div key={note}>{note}</div>
          ))}
        </div>
      )}
      <Refused>{refused}</Refused>
    </div>
  );
}
