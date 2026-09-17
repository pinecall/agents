/** Numbers: whose numbers reach the org, the doors it answers, and one more brought in — imported or bought. */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
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
 * In the order a person asks: which numbers ring, and who picks up; how to add one; and, last, the
 * carrier account they come from. A number answers in one world, so the screen says which world
 * it is showing. How a developer reaches their own copy by phone is the local console's screen
 * (phone.tsx): it needs no number of its own.
 */
export function Numbers(): ReactNode {
  const credentials = useCredentials();
  const { agents } = useHeldAgents();
  const [carrier, setCarrier] = useState<Carrier | null | undefined>(undefined);
  const [doors, setDoors] = useState<Answering[] | null>(null);
  const [available, setAvailable] = useState<Available | null>(null);
  const { world } = useWorld();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = useCallback(async (): Promise<void> => {
    const [brought, answering] = await Promise.all([readCarrier(credentials), readNumbers(credentials)]);
    setCarrier(brought);
    setDoors(answering);
    setAvailable(brought === null ? null : await readAvailable(credentials));
  }, [credentials]);

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
export function pretty(number: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number);
  return us === null ? number : `+1 (${us[1]}) ${us[2]}-${us[3]}`;
}

function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : String(failed);
}
