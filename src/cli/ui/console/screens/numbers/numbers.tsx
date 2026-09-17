/** Numbers: whose numbers reach the org, the doors it answers, and one more brought in — imported or bought. */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { prettyNumber } from "../../lib/format";
import { useOrg } from "../../lib/org";
import { useWorld } from "../../lib/world";
import { Button, Card, CardHead, Empty, Page, PageHead, Pill, Refused } from "../../ui";
import { Adding } from "./adding";
import { CarrierPanel } from "./carrier";
import { OutboundPanel } from "./outbound";
import {
  bringCarrier,
  buyNumber,
  dropCarrier,
  importNumber,
  provisionOutbound,
  readAvailable,
  readCarrier,
  readNumbers,
  readOutbound,
  releaseNumber,
  type Answering,
  type Available,
  type Carrier,
  type Outbound,
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
  const { agents } = useOrg();
  const [carrier, setCarrier] = useState<Carrier | null | undefined>(undefined);
  const [doors, setDoors] = useState<Answering[] | null>(null);
  const [available, setAvailable] = useState<Available | null>(null);
  const [outbound, setOutbound] = useState<Outbound | null>(null);
  const { world } = useWorld();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = useCallback(async (): Promise<void> => {
    const [brought, answering] = await Promise.all([readCarrier(credentials), readNumbers(credentials)]);
    setCarrier(brought);
    setDoors(answering);
    setAvailable(brought === null ? null : await readAvailable(credentials));
    // Placing a call needs a carrier to place it through; a gateway with no such door answers nothing.
    setOutbound(brought === null ? null : await readOutbound(credentials).catch(() => null));
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
    <Page width={900}>
      <PageHead title="Phone numbers" lede="The numbers people call, and which agent picks up." />

      <Refused>{refused}</Refused>

      {doors !== null && (
        <Card>
          <CardHead title={`Numbers in ${world}`} />
          {numbered.length === 0 && <Empty>No phone number rings in {world} yet. Add one below.</Empty>}
          {numbered.map((door) => (
            <div key={door.route.number} className="num-row">
              <span className="num-number">{prettyNumber(door.route.number)}</span>
              <span className="num-arrow" aria-hidden>
                →
              </span>
              <span className="num-agent">{door.route.agent}</span>
              {door.route.managed && (
                <span title="bought by the box for this org">
                  <Pill tone="violet">bought</Pill>
                </span>
              )}
              {door.source === "operator" && (
                <Button
                  kind="danger"
                  size="xs"
                  className="num-remove"
                  disabled={busy}
                  title="The number stops ringing this agent. It stays in your carrier account."
                  onClick={() => void moved(() => releaseNumber(credentials, door.route.number ?? "")).catch(() => undefined)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {onTheWeb.length > 0 && (
            <div className="num-foot">Also on the web, with no number needed: {[...new Set(onTheWeb.map((door) => door.route.agent))].join(", ")}.</div>
          )}
        </Card>
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

      {outbound !== null && <OutboundPanel outbound={outbound} busy={busy} onProvision={(dryRun) => moved(() => provisionOutbound(credentials, dryRun))} />}

      {carrier !== undefined && (
        <CarrierPanel
          carrier={carrier}
          busy={busy}
          onBring={async (wanted) => {
            await moved(() => bringCarrier(credentials, wanted)).catch(() => undefined);
          }}
          onDrop={async () => {
            await moved(() => dropCarrier(credentials)).catch(() => undefined);
          }}
        />
      )}
    </Page>
  );
}

function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : String(failed);
}
