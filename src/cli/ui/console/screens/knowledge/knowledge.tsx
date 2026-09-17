/** Knowledge: what this agent answers from — the folder pushed from here, the bases, and the golden. */

import type { KnowledgeBase, KnowledgeScore } from "@pinecall/protocol";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { dayAndTime } from "../../lib/format";
import { Button, Card, CardHead, Empty, Page, PageHead, Refused, TableHead, TableRow, TextAction } from "../../ui";
import { askTheGolden, dropBase, pushKnowledge, readBases, readHere, type Here, type Pushed } from "./door";
import "./knowledge.css";

const COLUMNS = "minmax(0,1fr) 90px 140px 150px 80px";

/**
 * The screen. Two of its four doors are the gateway's — every base this org has pushed, and one
 * dropped — and two are the holding process's own, because pushing reads `knowledge/docs` off that
 * machine's disk and the golden beside it. It is `pinecall knowledge` with the same defaults.
 */
export function Knowledge(): ReactNode {
  const credentials = useCredentials();
  const agent = useParams()["agent"] ?? "";
  const [here, setHere] = useState<Here | null>(null);
  const [away, setAway] = useState<string | null>(null);
  const [bases, setBases] = useState<KnowledgeBase[] | null>(null);
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
    reread().catch((failed: unknown) => {
      if (!gone) setRefused(saidBy(failed));
    });
    // The directory is the holding process's to answer: with none connected, the bases still read.
    readHere(credentials, agent).then(
      (read) => {
        if (gone) return;
        setHere(read);
        setBase(read.base ?? agent);
      },
      (failed: unknown) => {
        if (!gone) setAway(saidBy(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent, reread]);

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
      setRefused(saidBy(failed));
    } finally {
      setBusy("");
    }
  };

  const forget = async (name: string): Promise<void> => {
    if (!window.confirm(`Drop the base ${name}? Nothing brings it back but another push.`)) return;
    setRefused(null);
    try {
      await dropBase(credentials, name);
      await reread();
    } catch (failed) {
      setRefused(saidBy(failed));
    }
  };

  const mine = here !== null && here.agent === agent;

  return (
    <Page width={1060} tight>
      <PageHead
        title="Knowledge"
        ledeWidth={620}
        lede="What this agent answers from. The folder is pushed whole and the base is replaced, never merged."
      />

      <Card>
        <CardHead title="This directory">
          {mine && (
            <label className="kb-base">
              <span className="kb-base-label">base</span>
              <input className="kb-base-input" value={base} size={Math.max(6, base.length)} onChange={(event) => setBase(event.target.value)} />
            </label>
          )}
        </CardHead>
        {here === null && away === null && <Empty>Asking the process that holds {agent}…</Empty>}
        {here === null && away !== null && (
          <Empty>
            The directory is read by the process holding {agent}, and it did not answer: {away}. Bases already pushed are listed below.
          </Empty>
        )}
        {here !== null && !mine && (
          <Empty>
            {here.agent === null
              ? "No agent class in the directory the agent's `pinecall run` runs in, so there is nothing here to push."
              : `The process holding the agent runs in ${here.agent}'s directory: to push ${agent}'s knowledge, run \`pinecall run\` there.`}
          </Empty>
        )}
        {mine && (
          <div className="kb-here">
            <span className="kb-path">{here.directory ?? "—"}</span>
            <span className="kb-count">
              {here.files} markdown file{here.files === 1 ? "" : "s"}
            </span>
            <Button size="md" disabled={busy !== "" || here.files === 0} onClick={() => void doing("push")}>
              {busy === "push" ? "Pushing…" : "Push the folder"}
            </Button>
            <span className="kb-path">{here.golden === null ? "no golden beside it" : `${here.questions} questions`}</span>
            <Button size="md" disabled={busy !== "" || here.golden === null} onClick={() => void doing("eval")}>
              {busy === "eval" ? "Asking…" : "Run the golden"}
            </Button>
          </div>
        )}
        {pushed !== null && (
          <div className="ui-card-foot">
            Pushed {pushed.base} · {pushed.files} files · {pushed.chunks} chunks · {Math.round(pushed.took_ms)} ms
          </div>
        )}
      </Card>

      <Refused>{refused}</Refused>

      {score !== null && <Score score={score} />}

      <Card>
        {bases !== null && bases.length === 0 ? (
          <Empty>No base pushed yet. Push the folder above, or `pinecall knowledge push` from the project.</Empty>
        ) : (
          <>
            <TableHead columns={COLUMNS} labels={["Base", "Chunks", "Embedder", "Pushed", "Action>"]} />
            {(bases ?? []).map((one) => (
              <TableRow key={one.base} columns={COLUMNS}>
                <span className="ui-cell-strong ui-clip">{one.base}</span>
                <span className="ui-cell-ink">{one.chunks}</span>
                <span className="ui-cell ui-clip">{one.model}</span>
                <span className="ui-cell">{dayAndTime(one.pushed_at)}</span>
                <span className="ui-cell-end">
                  <TextAction danger onClick={() => void forget(one.base)}>
                    Drop
                  </TextAction>
                </span>
              </TableRow>
            ))}
          </>
        )}
      </Card>
    </Page>
  );
}

/** The two figures, and every question the index did not bring the right chunk back for. */
function Score({ score }: { score: KnowledgeScore }): ReactNode {
  return (
    <Card>
      <CardHead title="The golden" meta={`${score.base} · ${score.model} · ${score.questions} questions · ${Math.round(score.took_ms)} ms`} />
      <div className="kb-figures">
        <div>
          <div className="kb-figure-label">recall@{score.k}</div>
          <div className="kb-figure">{score.recall_at_k.toFixed(2)}</div>
        </div>
        <div>
          <div className="kb-figure-label">nDCG@10</div>
          <div className="kb-figure">{score.ndcg_at_10.toFixed(2)}</div>
        </div>
      </div>
      {score.misses.length === 0 ? (
        <div className="ui-card-foot">Every question found what it asked for.</div>
      ) : (
        score.misses.map((missed) => (
          <div key={missed.asks} className="kb-miss">
            <div className="kb-miss-asks">{missed.asks}</div>
            <div className="kb-miss-why">
              wanted {missed.expects} · got {missed.found[0] ?? "nothing"}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : failed instanceof Error ? failed.message : String(failed);
}
