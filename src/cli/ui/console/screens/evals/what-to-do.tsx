/** The two things a person does to a call they have just read: re-check it, or write it down. */

import { useState, type ReactNode } from "react";
import { useParams } from "react-router";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
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
    <>
      <div className="ev-acts">
        <button type="button" className="button" disabled={busy !== ""} onClick={() => void does("check")}>
          {busy === "check" ? "checking…" : "re-check by code"}
        </button>
        <button type="button" className="button" disabled={busy !== ""} onClick={() => void does("promote")}>
          {busy === "promote" ? "writing…" : "promote to a golden"}
        </button>
        {replayed !== null && (
          <span className={replayed.passed ? "accent mono" : "ev-bad mono"}>
            {replayed.verdicts.map((verdict) => `${verdict.check} ${verdict.status}`).join(" · ")}
          </span>
        )}
        {promoted !== null && (
          <span className="mono dim">
            {promoted.path} · {promoted.candidate.input.length} caller turn(s)
          </span>
        )}
      </div>
      {refused !== null && <p className="note note-warn">{refused}</p>}
      {promoted?.notes.map((note) => (
        <p key={note} className="note">
          {note}
        </p>
      ))}
    </>
  );
}
