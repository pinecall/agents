/** Adding a number: import one the carrier owns, or have the box buy one — the plan shown before anything is written. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { HeldAgent } from "@pinecall/protocol";

import { prettyNumber } from "../../lib/format";
import { Button, Card, CardHead, Input, Label, Select } from "../../ui";
import type { Available, Carrier, Wired } from "./door";

/** What the panel is told: the carrier (or none), the org's agents, and the two doors it knocks at. */
export interface AddingProps {
  carrier: Carrier | null;
  agents: HeldAgent[];
  available: Available | null;
  busy: boolean;
  onImport: (wanted: { number: string; agent: string }, dryRun: boolean) => Promise<Wired>;
  onBuy: (wanted: { country: string; area_code?: string; agent: string }, dryRun: boolean) => Promise<Wired>;
}

type Way = "import" | "buy";

/**
 * Two ways into the org's world, one rule: the gateway is asked for the PLAN first — every step
 * it would take, with the ids that stand today — and a person reads it before the same request
 * goes again for real. Importing needs the org's own carrier; buying needs none, since it is the
 * box's account that pays, and the plan names the number it found. Nothing is written on the
 * first click, ever.
 */
export function Adding({ carrier, agents, available, busy, onImport, onBuy }: AddingProps): ReactNode {
  const [way, setWay] = useState<Way>(carrier === null ? "buy" : "import");
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [agent, setAgent] = useState(agents[0]?.slug ?? "");
  const [plan, setPlan] = useState<Wired | null>(null);
  const [done, setDone] = useState<Wired | null>(null);

  useEffect(() => {
    if (agent === "" && agents[0] !== undefined) setAgent(agents[0].slug);
  }, [agents, agent]);

  // A plan is about one request; change a field and it is somebody else's plan.
  const forget = (): void => {
    setPlan(null);
    setDone(null);
  };
  const ask = async (dryRun: boolean): Promise<Wired> =>
    way === "import"
      ? onImport({ number: number.trim(), agent }, dryRun)
      : onBuy({ country: country.trim().toUpperCase(), ...(areaCode.trim() === "" ? {} : { area_code: areaCode.trim() }), agent }, dryRun);

  const planned = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setDone(null);
    setPlan(await ask(true).catch(() => null));
  };
  const confirmed = async (): Promise<void> => {
    const wired = await ask(false).catch(() => null);
    if (wired === null) return;
    setPlan(null);
    setDone(wired);
    setNumber("");
  };

  const owned = available !== null && available.kind === "twilio" ? available.numbers.filter((one) => !one.imported) : [];
  const turn = (to: Way): void => {
    setWay(to);
    forget();
  };

  return (
    <Card>
      <CardHead title="Add a number">
        <div className="ui-segmented num-ways" role="group">
          <button
            type="button"
            className={way === "import" ? "ui-segment ui-segment-on" : "ui-segment"}
            aria-pressed={way === "import"}
            onClick={() => turn("import")}
            disabled={carrier === null}
            title={carrier === null ? "connect your phone carrier first, below" : undefined}
          >
            {owned.length > 0 ? `One I already have · ${owned.length}` : "One I already have"}
          </button>
          <button type="button" className={way === "buy" ? "ui-segment ui-segment-on" : "ui-segment"} aria-pressed={way === "buy"} onClick={() => turn("buy")}>
            Buy a new one
          </button>
        </div>
      </CardHead>

      <form onSubmit={(event) => void planned(event)}>
        <div className={way === "buy" ? "num-fields num-fields-3" : "num-fields"}>
          {way === "import" ? (
            <div>
              <Label>Number</Label>
              {owned.length > 0 ? (
                <Select
                  value={number}
                  onChange={(e) => {
                    setNumber(e.target.value);
                    forget();
                  }}
                  required
                >
                  <option value="">Choose a number…</option>
                  {owned.map((one) => (
                    <option key={one.number} value={one.number}>
                      {prettyNumber(one.number)} — {one.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={number}
                  onChange={(e) => {
                    setNumber(e.target.value);
                    forget();
                  }}
                  placeholder="+14176743169"
                  required
                  autoComplete="off"
                />
              )}
            </div>
          ) : (
            <>
              <div>
                <Label>Country · two letters</Label>
                <Input
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    forget();
                  }}
                  maxLength={2}
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>Area code · optional</Label>
                <Input
                  value={areaCode}
                  onChange={(e) => {
                    setAreaCode(e.target.value);
                    forget();
                  }}
                  placeholder="417"
                  autoComplete="off"
                />
              </div>
            </>
          )}
          <div>
            <Label>Agent that answers</Label>
            {agents.length > 0 ? (
              <Select
                value={agent}
                onChange={(e) => {
                  setAgent(e.target.value);
                  forget();
                }}
                required
              >
                {agents.map((held) => (
                  <option key={held.slug} value={held.slug}>
                    {held.slug}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                value={agent}
                onChange={(e) => {
                  setAgent(e.target.value);
                  forget();
                }}
                placeholder="the agent's slug"
                required
                autoComplete="off"
              />
            )}
          </div>
        </div>
        <div className="num-actions">
          <Button kind="primary" type="submit" disabled={busy || plan !== null}>
            {busy && plan === null ? "Checking…" : "Review"}
          </Button>
          <span className="num-note">
            {way === "import"
              ? "Nothing changes yet — you will see exactly what is going to happen, and confirm."
              : "Nothing is bought yet — you will see the number that was found, and confirm."}
          </span>
        </div>
      </form>

      {plan !== null && (
        <div className="num-plan">
          <div className="num-plan-title">
            This is what will happen{way === "buy" && plan.route.number !== null ? <> with {prettyNumber(plan.route.number)}</> : null}. Nothing is deleted.
          </div>
          <Steps steps={plan.steps} />
          <div className="num-plan-moves">
            <Button kind="primary" size="md" onClick={() => void confirmed()} disabled={busy}>
              {busy ? "Working…" : way === "buy" ? "Buy it and connect it" : "Confirm"}
            </Button>
            <Button size="md" onClick={forget} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {done !== null && (
        <div className="num-plan num-plan-done">
          <div className="num-plan-title">
            Done. {prettyNumber(done.route.number)} now rings {done.route.agent} in {done.route.env}.
          </div>
          <Steps steps={done.steps} />
        </div>
      )}
    </Card>
  );
}

/** The gateway's own steps, one per line, in its words — the first token is what kind of thing each is. */
function Steps({ steps }: { steps: string[] }): ReactNode {
  return (
    <ol className="num-steps">
      {steps.map((step, index) => {
        const [kind, ...rest] = step.split(/\s+/);
        return (
          <li key={index}>
            <span className="num-step-kind">{kind}</span>
            <span className="num-step-text">{rest.join(" ")}</span>
          </li>
        );
      })}
    </ol>
  );
}
