/** Knowledge: what this agent answers from — the folder pushed from here, the bases, and the golden. */

import type { KnowledgeBase, KnowledgeScore } from "@pinecall/protocol";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import { askTheGolden, dropBase, pushKnowledge, readBases, readHere, type Here, type Pushed } from "./door";
import "./knowledge.css";

/**
 * The screen. Two of its four doors are the gateway's — every base this org has pushed, and one
 * dropped — and two are this process's own, because pushing reads `knowledge/docs` off this
 * machine's disk and the golden beside it. It is `pinecall knowledge` with the same defaults.
 */
export function Knowledge(): ReactNode {
  const credentials = useCredentials();
  const agent = useParams()["agent"] ?? "";
  const [here, setHere] = useState<Here | null>(null);
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState<"" | "push" | "eval">("");
  const [pushed, setPushed] = useState<Pushed | null>(null);
  const [score, setScore] = useState<KnowledgeScore | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = useCallback(async (): Promise<void> => {
    setBases((await readBases(credentials)).bases);
  }, [credentials]);

  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const read = await readHere(credentials, agent);
        if (gone) return;
        setHere(read);
        setBase(read.base ?? "");
        await reread();
      } catch (failed) {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      }
    })();
    return () => {
      gone = true;
    };
  }, [credentials, reread]);

  const doing = async (what: "push" | "eval"): Promise<void> => {
    setBusy(what);
    setRefused(null);
    try {
      if (what === "push") {
        setPushed(await pushKnowledge(credentials, agent, base));
        await reread();
      } else {
        setScore(await askTheGolden(credentials, agent, base));
      }
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy("");
    }
  };

  const forget = async (name: string): Promise<void> => {
    setRefused(null);
    try {
      await dropBase(credentials, name);
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  return (
    <section className="page page-wide">
      <div className="page-eyebrow fixed">knowledge</div>
      <h1 className="page-title">what this agent answers from</h1>
      <p className="page-lede">
        The folder is pushed whole and the base is replaced, never merged. A golden is fixed and the
        index is the variable: never soften a question so a change can pass.
      </p>

      {here !== null && here.agent !== agent && (
        <Nothing>
          {here.agent === null
            ? "No agent class in the directory the agent's `pinecall run` runs in, so there is nothing here to push."
            : `The process holding the agent runs in ${here.agent}'s directory: to push ${agent}'s knowledge, run \`pinecall run\` there.`}
        </Nothing>
      )}

      {here !== null && here.agent === agent && (
        <div className="panel kb-here">
          <div className="panel-head">
            <span className="panel-title">this directory</span>
            <label className="kb-field">
              <span className="dim">base</span>
              <input className="input mono" value={base} onChange={(event) => setBase(event.target.value)} />
            </label>
          </div>
          <div className="panel-body kb-actions">
            <span className="mono dim">{here.directory ?? "—"}</span>
            <span className="fixed">{here.files} markdown file{here.files === 1 ? "" : "s"}</span>
            <button type="button" className="button" disabled={busy !== "" || here.files === 0} onClick={() => void doing("push")}>
              {busy === "push" ? "pushing…" : "push the folder"}
            </button>
            <span className="fixed dim">{here.golden === null ? "no golden beside it" : `${here.questions} questions`}</span>
            <button type="button" className="button" disabled={busy !== "" || here.golden === null} onClick={() => void doing("eval")}>
              {busy === "eval" ? "asking…" : "run the golden"}
            </button>
          </div>
        </div>
      )}

      {refused !== null && <p className="note note-warn">{refused}</p>}
      {pushed !== null && (
        <p className="note fixed">
          {pushed.base} · {pushed.files} files · {pushed.chunks} chunks · {Math.round(pushed.took_ms)} ms
        </p>
      )}
      {score !== null && <Score score={score} />}

      <div className="section">
        <h2 className="section-title">every base this org has pushed</h2>
        {bases.length === 0 ? (
          <Nothing>No base pushed yet. The button above sends this directory's folder.</Nothing>
        ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>base</th>
                <th className="num">chunks</th>
                <th>embedder</th>
                <th>pushed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bases.map((one) => (
                <tr key={one.base}>
                  <td className="id">{one.base}</td>
                  <td className="num">{one.chunks}</td>
                  <td className="mono dim">{one.model}</td>
                  <td className="mono dim">{dayAndTime(one.pushed_at)}</td>
                  <td>
                    <button type="button" className="link" onClick={() => void forget(one.base)}>
                      drop
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </section>
  );
}

/** The two figures, and every question the index did not bring the right chunk back for. */
function Score({ score }: { score: KnowledgeScore }): ReactNode {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{score.base}</span>
        <span className="fixed dim">
          {score.model} · {score.questions} questions · recall@{score.k} {score.recall_at_k.toFixed(2)} · nDCG@10{" "}
          {score.ndcg_at_10.toFixed(2)} · {Math.round(score.took_ms)} ms
        </span>
      </div>
      <div className="panel-body">
        {score.misses.length === 0 ? (
          <p className="dim">Every question found what it asked for.</p>
        ) : (
          <ul className="kb-misses">
            {score.misses.map((missed) => (
              <li key={missed.asks}>
                <span>{missed.asks}</span>
                <span className="mono dim">
                  wanted {missed.expects} · got {missed.found[0] ?? "nothing"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Unix seconds as a person reads them: the day and the minute, the way the verb prints it. */
function dayAndTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
}
