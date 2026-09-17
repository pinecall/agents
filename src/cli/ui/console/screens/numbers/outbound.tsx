/** Outbound calls: whether the org can place a call, from which numbers, what is missing, and the guards around it. */

import { useState, type ReactNode } from "react";

import { prettyNumber } from "../../lib/format";
import { Button, Card, CardHead, KV, Pill } from "../../ui";
import { Steps } from "./adding";
import type { Outbound, Provisioned } from "./door";

/** What the card is told: the standing, and the one move — planned first, then made. */
export interface OutboundPanelProps {
  outbound: Outbound;
  busy: boolean;
  onProvision: (dryRun: boolean) => Promise<Provisioned>;
}

/**
 * Placing a call runs through a trunk of its own — the other direction from the one a number rings
 * in by — and it is set up the way a number is added: the gateway's plan first, in its own steps,
 * and nothing written until it is confirmed. The guards are shown and never set here: an org that
 * could lift its own fence would have none.
 */
export function OutboundPanel({ outbound, busy, onProvision }: OutboundPanelProps): ReactNode {
  const [plan, setPlan] = useState<Provisioned | null>(null);
  const [done, setDone] = useState<Provisioned | null>(null);
  const { guards } = outbound;

  const review = (): void => {
    setDone(null);
    void onProvision(true).then(setPlan, () => undefined);
  };
  const confirmed = (): void => {
    void onProvision(false).then(
      (made) => {
        setPlan(null);
        setDone(made);
      },
      () => undefined,
    );
  };

  return (
    <Card>
      <CardHead title="Outbound calls" meta="an agent calling somebody back">
        <span className="num-out-pill">{outbound.ready ? <Pill tone="green">ready</Pill> : <Pill tone="amber">not ready</Pill>}</span>
      </CardHead>
      <div className="num-out-body">
        <div className="num-out-from">
          <span className="num-out-label">Calls are placed from</span>
          <span className="num-out-numbers">
            {outbound.from_numbers.length === 0 ? "no number yet — add one above" : outbound.from_numbers.map((one) => prettyNumber(one)).join(" · ")}
          </span>
        </div>
        {!outbound.ready && outbound.steps_missing.length > 0 && (
          <ul className="num-out-missing">
            {outbound.steps_missing.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        )}
        <div className="num-actions num-out-actions">
          {outbound.ready ? (
            <Button size="md" onClick={review} disabled={busy || plan !== null}>
              {busy && plan === null ? "Checking…" : "Repair"}
            </Button>
          ) : (
            <Button kind="primary" onClick={review} disabled={busy || plan !== null}>
              {busy && plan === null ? "Checking…" : "Set up outbound"}
            </Button>
          )}
          <span className="num-note">Nothing changes yet — you will see exactly what is going to happen, and confirm.</span>
        </div>
      </div>

      {plan !== null && (
        <div className="num-plan">
          <div className="num-plan-title">This is what will happen on your carrier account and on this gateway. Nothing is deleted.</div>
          <Steps steps={plan.steps} />
          <div className="num-plan-moves">
            <Button kind="primary" size="md" onClick={confirmed} disabled={busy}>
              {busy ? "Working…" : "Confirm"}
            </Button>
            <Button size="md" onClick={() => setPlan(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {done !== null && (
        <div className="num-plan num-plan-done">
          <div className="num-plan-title">{done.ready ? "Done. Your agents can place calls." : "Done, and something is still missing — see above."}</div>
          <Steps steps={done.steps} />
        </div>
      )}

      <div className="num-out-guards">
        <div className="num-out-guards-title">Guards</div>
        <KV label="Who may be called" keyWidth={140}>
          {guards.dial_anywhere ? "any number" : "only numbers that have already called or written to you"}
        </KV>
        <KV label="Per minute" keyWidth={140}>
          {guards.per_minute} calls
        </KV>
        <KV label="Per day" keyWidth={140}>
          {guards.per_day} calls
        </KV>
        <KV label="Countries" keyWidth={140}>
          {guards.countries.length === 0 ? "the countries of your own numbers" : guards.countries.map((code) => (code.startsWith("+") ? code : `+${code}`)).join(" · ")}
        </KV>
        <KV label="Longest call" keyWidth={140}>
          {Math.round(guards.max_duration_s / 60)} minutes
        </KV>
        <div className="num-out-note">
          Set by whoever runs this gateway: <span className="ui-fixed">pinecall-runtime orgs dialling</span>.
        </div>
      </div>
    </Card>
  );
}
