/** Memory: what was kept about one contact, the right to be forgotten, and the two goldens it is held to. */

import type { ContactFact, ExtractionRun, MemoryScore } from "@pinecall/protocol";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import { askRecall, forgetContact, readContact, readHere, runExtraction, type Here } from "./door";
import "./memory.css";

/**
 * The screen. The contact half is the gateway's two doors — read and forget — and the goldens half
 * is this process's own, because both goldens are files of the directory `pinecall run` runs in:
 * `memory/golden.json` for what recall ranks, `test/memory` for what a hang-up makes of a call.
 */
export function Memory(): ReactNode {
  const credentials = useCredentials();
  const agent = useParams()["agent"] ?? "";
  const [here, setHere] = useState<Here | null>(null);
  const [contact, setContact] = useState("");
  const [facts, setFacts] = useState<ContactFact[] | null>(null);
  const [forgotten, setForgotten] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [score, setScore] = useState<MemoryScore | null>(null);
  const [extraction, setExtraction] = useState<ExtractionRun | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readHere(credentials, agent).then(
      (read) => {
        if (!gone) setHere(read);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const look = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setRefused(null);
    setForgotten(null);
    try {
      setFacts((await readContact(credentials, contact.trim())).facts);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  // Erasing is not undoable and the page says so where the finger is, not in a toast afterwards.
  const forget = async (): Promise<void> => {
    if (!window.confirm(`Erase everything memory kept about ${contact.trim()}? There is no undo.`)) return;
    setRefused(null);
    try {
      setForgotten((await forgetContact(credentials, contact.trim())).forgotten);
      setFacts([]);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  const golden = async (which: "recall" | "extraction"): Promise<void> => {
    setBusy(which);
    setRefused(null);
    try {
      if (which === "recall") setScore(await askRecall(credentials, agent));
      else setExtraction(await runExtraction(credentials, agent));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="page page-wide">
      <div className="page-eyebrow fixed">memory</div>
      <h1 className="page-title">what the agent keeps, and what it is held to</h1>

      <form className="mem-ask" onSubmit={(event) => void look(event)}>
        <input
          className="input mono mem-contact"
          value={contact}
          placeholder="a phone number, a customer id"
          onChange={(event) => setContact(event.target.value)}
        />
        <button type="submit" className="button" disabled={contact.trim() === ""}>
          read
        </button>
        <button type="button" className="button" disabled={contact.trim() === ""} onClick={() => void forget()}>
          forget
        </button>
        {forgotten !== null && <span className="fixed dim">forgotten: {forgotten}</span>}
      </form>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {facts !== null &&
        (facts.length === 0 ? (
          <Nothing>Memory keeps nothing about {contact.trim()}.</Nothing>
        ) : (
          <ul className="mem-facts">
            {facts.map((fact, at) => (
              <li key={fact.id ?? `${at}`} className={fact.invalidated_at === null ? "" : "mem-gone"}>
                <span>{fact.text}</span>
                <span className="mono dim">
                  {fact.category ?? "—"}
                  {fact.invalidated_at === null ? "" : ` · superseded ${dayAndTime(fact.invalidated_at)}`}
                </span>
              </li>
            ))}
          </ul>
        ))}

      <div className="section">
        <h2 className="section-title">the goldens of this directory</h2>
        {here !== null && here.agent !== agent ? (
          <Nothing>
            {here.agent === null
              ? "No agent class in the directory the agent's `pinecall run` runs in, so its goldens are not here."
              : `The process holding the agent runs in ${here.agent}'s directory: to run ${agent}'s memory goldens, run \`pinecall run\` there.`}
          </Nothing>
        ) : (
          <div className="mem-goldens">
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">recall</span>
                <span className="fixed dim">{here?.questions ?? 0} questions</span>
              </div>
              <div className="panel-body mem-run">
                <p className="dim">
                  Every question asked of the ranking, scored by code with no model. No contact of
                  yours is read: each question brings its own facts to a scratch contact.
                </p>
                <button
                  type="button"
                  className="button"
                  disabled={busy !== "" || (here?.questions ?? 0) === 0}
                  onClick={() => void golden("recall")}
                >
                  {busy === "recall" ? "asking…" : "run it"}
                </button>
                {score !== null && (
                  <p className="fixed">
                    {score.model} · recall@{score.k} {score.recall_at_k.toFixed(2)} · nDCG@10{" "}
                    {score.ndcg_at_10.toFixed(2)} · {score.misses.length} missed
                  </p>
                )}
                {score?.misses.map((missed) => (
                  <p key={missed.asks} className="mono dim">
                    {missed.asks} → wanted {missed.missing.join(", ")}, got {missed.found[0] ?? "nothing"}
                  </p>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">extraction</span>
                <span className="fixed dim">{here?.cases.length ?? 0} cases</span>
              </div>
              <div className="panel-body mem-run">
                <p className="dim">
                  One call written down per case, and one model call each — the very one a hang-up
                  makes. Which categories got a fact, which never did, what must not survive.
                </p>
                <button
                  type="button"
                  className="button"
                  disabled={busy !== "" || (here?.cases.length ?? 0) === 0}
                  onClick={() => void golden("extraction")}
                >
                  {busy === "extraction" ? "running…" : "run them"}
                </button>
                {extraction !== null && (
                  <p className="fixed">
                    {extraction.model} · {extraction.held}/{extraction.cases} held ·{" "}
                    {Math.round(extraction.took_ms)} ms
                  </p>
                )}
                {extraction?.results
                  .filter((one) => !one.held)
                  .map((one) => (
                    <p key={one.name} className="mono dim">
                      {one.name} — {(one.broke ?? []).map((broke) => `${broke.check}: ${broke.detail}`).join(" · ")}
                    </p>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function dayAndTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
}
