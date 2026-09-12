/** Numbers: whose numbers reach the org, the doors it answers, and one more brought in — imported or bought. */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { useHeldAgents } from "../../lib/use-held-agents";
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
 * Three things on one screen, in the order a person meets them: the carrier the org brought
 * (a Twilio account or a SIP peer — nothing imports without one, and buying needs none), the
 * doors it answers today with who put each there, and the way to add one — always the plan
 * first, then the same request for real. Every refusal is the gateway's sentence, verbatim.
 */
export function Numbers(): ReactNode {
  const credentials = useCredentials();
  const { agents } = useHeldAgents();
  const [carrier, setCarrier] = useState<Carrier | null | undefined>(undefined);
  const [doors, setDoors] = useState<Answering[] | null>(null);
  const [available, setAvailable] = useState<Available | null>(null);
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

  return (
    <div className="numbers">
      <h1 className="numbers-title">Numbers</h1>
      <p className="numbers-lede">Whose numbers reach this org, which one reaches which agent, and one more brought in.</p>

      {carrier !== undefined && (
        <CarrierPanel
          carrier={carrier}
          busy={busy}
          onBring={async (wanted) => { await moved(() => bringCarrier(credentials, wanted)).catch(() => undefined); }}
          onDrop={async () => { await moved(() => dropCarrier(credentials)).catch(() => undefined); }}
        />
      )}

      {refused !== null && <p className="numbers-note numbers-refused fixed">{refused}</p>}

      {doors !== null && (
        <section className="numbers-doors">
          <div className="numbers-form-head"><span className="numbers-form-title">The doors this org answers</span></div>
          {doors.length === 0 ? (
            <p className="numbers-note fixed">none yet — bring a carrier and import one below, or have the box buy one; an app that declares a door shows up here too</p>
          ) : (
            <div className="numbers-panel">
              <div className="numbers-row numbers-row-head fixed">
                <span>NUMBER</span><span>CHANNEL</span><span>AGENT</span><span>WORLD</span><span>SOURCE</span><span></span>
              </div>
              {doors.map((door) => (
                <div key={`${door.route.channel}-${door.route.number ?? door.route.agent}`} className="numbers-row">
                  <span className="fixed">{door.route.number ?? "—"}{door.route.managed && <span className="numbers-managed fixed" title="bought by the box for this org: counts against the numbers quota">bought</span>}</span>
                  <span className="numbers-channel">{door.route.channel}</span>
                  <span className="fixed">{door.route.agent}</span>
                  <span className="fixed numbers-dim">{door.route.env}</span>
                  <span className={door.source === "operator" ? "fixed numbers-operator" : "fixed numbers-dim"}>{door.source}</span>
                  <span className="numbers-row-moves">
                    {door.route.number !== null && door.source === "operator" && (
                      <button type="button" className="link" disabled={busy} onClick={() => void moved(() => releaseNumber(credentials, door.route.number ?? "")).catch(() => undefined)}>let go</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {numbered.length > 0 && (
            <p className="numbers-note fixed">
              letting a number go removes the route and the media plane's admission; the carrier account is not touched, and a bought number stays the box's to release there
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
          onImport={(wanted, dryRun) => moved(() => importNumber(credentials, { ...wanted, channel: "phone" }, dryRun))}
          onBuy={(wanted, dryRun) => moved(() => buyNumber(credentials, { ...wanted, channel: "phone" }, dryRun))}
        />
      )}
    </div>
  );
}

function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : String(failed);
}
