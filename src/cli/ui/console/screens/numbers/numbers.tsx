/** Numbers: three tabs — which numbers ring and who picks up, the calls agents place, and the carrier they come from. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { prettyNumber } from "../../lib/format";
import { useOrg } from "../../lib/org";
import { useWorld } from "../../lib/world";
import { Button, Card, CardHead, Dot, Empty, Page, PageHead, Pill, Refused } from "../../ui";
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
  type Wired,
} from "./door";
import "./numbers.css";

type Tab = "numbers" | "outbound" | "carrier";

const TABS: readonly { tab: Tab; name: string }[] = [
  { tab: "numbers", name: "Numbers" },
  { tab: "outbound", name: "Outbound calls" },
  { tab: "carrier", name: "Carrier" },
];

/**
 * The tab is in the address (`?tab=`), so a reload and a link land on the same one. A number
 * answers in one world, so the numbers tab says which world it is showing. How a developer reaches
 * their own copy by phone is the local console's screen (phone.tsx): it needs no number of its own.
 */
export function Numbers(): ReactNode {
  const credentials = useCredentials();
  const { agents } = useOrg();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((one) => one.tab === params.get("tab")) ? (params.get("tab") as Tab) : "numbers";
  const [carrier, setCarrier] = useState<Carrier | null | undefined>(undefined);
  const [doors, setDoors] = useState<Answering[] | null>(null);
  const [available, setAvailable] = useState<Available | null>(null);
  const [outbound, setOutbound] = useState<Outbound | null>(null);
  const { world } = useWorld();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<Wired | null>(null);

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
      <PageHead title="Phone numbers" lede="The numbers people call, which agent picks up, and the calls your agents place." />

      <nav className="num-tabs" aria-label="Phone numbers">
        {TABS.map((one) => (
          <button
            key={one.tab}
            type="button"
            className={tab === one.tab ? "num-tab num-tab-on" : "num-tab"}
            onClick={() => setParams(one.tab === "numbers" ? {} : { tab: one.tab })}
          >
            {one.name}
            {one.tab === "outbound" && carrier !== undefined && <Dot tone={outbound?.ready ? "green" : "amber"} small />}
          </button>
        ))}
      </nav>

      <Refused>{refused}</Refused>

      {tab === "numbers" && doors !== null && (
        <Card>
          <CardHead
            title={`Numbers in ${world}`}
            action={
              !adding && carrier !== undefined ? (
                <Button
                  kind="primary"
                  size="sm"
                  className="ui-card-action"
                  onClick={() => {
                    setAdded(null);
                    setAdding(true);
                  }}
                >
                  Add a number
                </Button>
              ) : undefined
            }
          />
          {numbered.length === 0 && <Empty>No phone number rings in {world} yet.</Empty>}
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
          {added !== null && (
            <div className="num-added">
              Done. {prettyNumber(added.route.number)} now rings {added.route.agent}.
            </div>
          )}
          {adding && carrier !== undefined && (
            <Adding
              carrier={carrier}
              agents={agents}
              available={available}
              busy={busy}
              onImport={(wanted, dryRun) => moved(() => importNumber(credentials, { ...wanted, channel: "phone" }, dryRun))}
              onBuy={(wanted, dryRun) => moved(() => buyNumber(credentials, { ...wanted, channel: "phone" }, dryRun))}
              onDone={(wired) => {
                setAdded(wired);
                setAdding(false);
              }}
              onClose={() => setAdding(false)}
            />
          )}
          {onTheWeb.length > 0 && (
            <div className="num-foot">Also on the web, with no number needed: {[...new Set(onTheWeb.map((door) => door.route.agent))].join(", ")}.</div>
          )}
        </Card>
      )}

      {tab === "outbound" && carrier !== undefined && (
        <OutboundPanel outbound={outbound} agents={agents} busy={busy} onProvision={(dryRun) => moved(() => provisionOutbound(credentials, dryRun))} />
      )}

      {tab === "carrier" && carrier !== undefined && (
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
