/** Numbers: whose numbers reach the org, the doors it answers, and one more brought in — imported or bought. */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { BASE } from "../../lib/base";
import { keptKey } from "../../lib/session-key";
import { useHeldAgents } from "../../lib/use-held-agents";
import { useWorld } from "../../lib/world";
import { Adding } from "./adding";
import { CarrierPanel } from "./carrier";
import {
  bringCarrier,
  buyNumber,
  dropCarrier,
  importNumber,
  readAvailable,
  readCarrier,
  readNumbers,
  releaseNumber,
  type Answering,
  type Available,
  type Carrier,
} from "./door";
import "./numbers.css";

/**
 * In the order a person asks: which numbers ring, and who picks up; how to test by phone from the
 * sandbox; how to add one; and, last, the carrier account they come from. A number answers in one
 * world, so the screen always says which world it is showing, and in the sandbox it shows
 * production's numbers too — they are the ones a developer calls (`pinecall line from`).
 */
export function Numbers(): ReactNode {
  const credentials = useCredentials();
  const { agents } = useHeldAgents();
  const [carrier, setCarrier] = useState<Carrier | null | undefined>(undefined);
  const [doors, setDoors] = useState<Answering[] | null>(null);
  const [available, setAvailable] = useState<Available | null>(null);
  const [elsewhere, setElsewhere] = useState<Answering[] | null>(null);
  const { world } = useWorld();
  const other = world === "sandbox" ? "production" : "sandbox";
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = useCallback(async (): Promise<void> => {
    const [brought, answering] = await Promise.all([readCarrier(credentials), readNumbers(credentials)]);
    setCarrier(brought);
    setDoors(answering);
    setAvailable(brought === null ? null : await readAvailable(credentials));
    // The other world's numbers, read with the key this browser holds for it, when it holds one.
    const theirs = keptKey(other);
    setElsewhere(theirs === null ? null : await readNumbers({ base: BASE, key: theirs }).catch(() => null));
  }, [credentials, other]);

  useEffect(() => {
    let gone = false;
    reread().catch((failed: unknown) => {
      if (!gone) setRefused(saidBy(failed));
    });
    return () => {
      gone = true;
    };
  }, [reread]);

  // One move at a time, the refusal shown where it happened, the tables re-read after.
  const moved = async <T,>(move: () => Promise<T>): Promise<T> => {
    setBusy(true);
    setRefused(null);
    try {
      const answered = await move();
      await reread();
      return answered;
    } catch (failed) {
      setRefused(saidBy(failed));
      throw failed;
    } finally {
      setBusy(false);
    }
  };

  const numbered = (doors ?? []).filter((door) => door.route.number !== null);
  const onTheWeb = (doors ?? []).filter((door) => door.route.number === null);
  const theirs = (elsewhere ?? []).filter((door) => door.route.number !== null);

  return (
    <div className="numbers">
      <h1 className="numbers-title">Phone numbers</h1>
      <p className="numbers-lede">
        The numbers people call, and which agent picks up. You are looking at{" "}
        <span className={`numbers-world numbers-world-${world}`}>{world}</span>.
      </p>

      {refused !== null && <p className="numbers-note numbers-refused fixed">{refused}</p>}

      {doors !== null && (
        <section className="numbers-doors">
          <h2 className="numbers-heading">Numbers in {world}</h2>
          {numbered.length === 0 ? (
            <p className="numbers-empty">No phone number rings in {world} yet.</p>
          ) : (
            <div className="numbers-cards">
              {numbered.map((door) => (
                <NumberCard
                  key={door.route.number}
                  door={door}
                  onRemove={
                    door.source === "operator"
                      ? () => void moved(() => releaseNumber(credentials, door.route.number ?? "")).catch(() => undefined)
                      : null
                  }
                  busy={busy}
                />
              ))}
            </div>
          )}
          {onTheWeb.length > 0 && (
            <p className="numbers-hint">
              Also on the web, with no number needed: {onTheWeb.map((door) => door.route.agent).join(", ")}.
            </p>
          )}
        </section>
      )}

      {world === "sandbox" && (
        <section className="numbers-doors numbers-callout">
          <h2 className="numbers-heading">Testing by phone</h2>
          <p className="numbers-text">
            You do not need a sandbox number. Tell Pinecall which mobile is yours, keep{" "}
            <code>pinecall run</code> going, and call a production number from it: <b>your copy answers</b>.
            Everybody else who calls still reaches production.
          </p>
          <pre className="numbers-code fixed">pinecall line from +1XXXXXXXXXX    # once: this mobile is mine{"\n"}pinecall run                       # leave it running, then call the number</pre>
          {theirs.length > 0 ? (
            <div className="numbers-cards">
              {theirs.map((door) => <NumberCard key={door.route.number} door={door} onRemove={null} busy={busy} />)}
            </div>
          ) : (
            <p className="numbers-hint">Switch to production (top right) to see the numbers you can call.</p>
          )}
        </section>
      )}

      {carrier !== undefined && (
        <Adding
          carrier={carrier}
          agents={agents}
          available={available}
          busy={busy}
          world={world}
          onImport={(wanted, dryRun) => moved(() => importNumber(credentials, { ...wanted, channel: "phone" }, dryRun))}
          onBuy={(wanted, dryRun) => moved(() => buyNumber(credentials, { ...wanted, channel: "phone" }, dryRun))}
        />
      )}

      {carrier !== undefined && (
        <CarrierPanel
          carrier={carrier}
          busy={busy}
          onBring={async (wanted) => { await moved(() => bringCarrier(credentials, wanted)).catch(() => undefined); }}
          onDrop={async () => { await moved(() => dropCarrier(credentials)).catch(() => undefined); }}
        />
      )}
    </div>
  );
}

/** One number: what people dial, who answers, in which world, and the way to take it off. */
function NumberCard({ door, onRemove, busy }: { door: Answering; onRemove: (() => void) | null; busy: boolean }): ReactNode {
  return (
    <div className="numbers-card">
      <span className="numbers-card-number fixed">{pretty(door.route.number ?? "")}</span>
      <span className="numbers-card-arrow" aria-hidden>→</span>
      <span className="numbers-card-agent fixed">{door.route.agent}</span>
      <span className={`numbers-world numbers-world-${door.route.env}`}>{door.route.env}</span>
      {door.route.managed && <span className="numbers-managed fixed" title="bought by the box for this org">bought</span>}
      {onRemove !== null && (
        <button
          type="button"
          className="link numbers-card-remove"
          disabled={busy}
          title="The number stops ringing this agent. It stays in your carrier account."
          onClick={onRemove}
        >
          remove
        </button>
      )}
    </div>
  );
}

/** +14176743169 as a person reads it; anything that is not a US number is left as it is. */
function pretty(number: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number);
  return us === null ? number : `+1 (${us[1]}) ${us[2]}-${us[3]}`;
}

function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : String(failed);
}
