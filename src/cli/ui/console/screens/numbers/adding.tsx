/** Adding a number: import one the carrier owns, or have the box buy one — the plan shown before anything is written. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { HeldAgent } from "@pinecall/protocol";

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
    setPlan(await ask(true));
  };
  const confirmed = async (): Promise<void> => {
    const wired = await ask(false);
    setPlan(null);
    setDone(wired);
    setNumber("");
  };

  const owned = available !== null && available.kind === "twilio" ? available.numbers.filter((one) => !one.imported) : [];

  return (
    <section className="numbers-adding">
      <div className="numbers-form-head">
        <span className="numbers-form-title">Add a number</span>
        <span className="tabs">
          <button type="button" className={way === "import" ? "tab is-active" : "tab"} onClick={() => { setWay("import"); forget(); }} disabled={carrier === null} title={carrier === null ? "bring the org's carrier first" : undefined}>
            import one the carrier owns
          </button>
          <button type="button" className={way === "buy" ? "tab is-active" : "tab"} onClick={() => { setWay("buy"); forget(); }}>
            have the box buy one
          </button>
        </span>
      </div>

      <form className="numbers-form" onSubmit={(event) => void planned(event)}>
        <div className="numbers-fields">
          {way === "import" ? (
            <label className="numbers-field">
              <span>number <em>E.164</em></span>
              {owned.length > 0 ? (
                <select className="input fixed" value={number} onChange={(e) => { setNumber(e.target.value); forget(); }} required>
                  <option value="">pick one of {owned.length} the account owns</option>
                  {owned.map((one) => <option key={one.number} value={one.number}>{one.number} — {one.name}</option>)}
                </select>
              ) : (
                <input className="input fixed" value={number} onChange={(e) => { setNumber(e.target.value); forget(); }} placeholder="+14176743169" required autoComplete="off" />
              )}
            </label>
          ) : (
            <>
              <label className="numbers-field"><span>country <em>ISO, two letters</em></span><input className="input fixed" value={country} onChange={(e) => { setCountry(e.target.value); forget(); }} maxLength={2} required autoComplete="off" /></label>
              <label className="numbers-field"><span>area code <em>optional</em></span><input className="input fixed" value={areaCode} onChange={(e) => { setAreaCode(e.target.value); forget(); }} placeholder="417" autoComplete="off" /></label>
            </>
          )}
          <label className="numbers-field">
            <span>answered by</span>
            {agents.length > 0 ? (
              <select className="input fixed" value={agent} onChange={(e) => { setAgent(e.target.value); forget(); }} required>
                {agents.map((held) => <option key={held.slug} value={held.slug}>{held.slug}</option>)}
              </select>
            ) : (
              <input className="input fixed" value={agent} onChange={(e) => { setAgent(e.target.value); forget(); }} placeholder="the agent's slug" required autoComplete="off" />
            )}
          </label>
        </div>
        <div className="numbers-form-foot">
          <button className="button" type="submit" disabled={busy || plan !== null}>{busy && plan === null ? "asking…" : "show the plan"}</button>
          <span className="numbers-note fixed">
            {way === "import"
              ? "nothing is written until you confirm the plan: the carrier's trunk pointed here, the media plane admitting the number, the route"
              : "the plan names the number the box found and pays nothing; confirming buys it, on the box's account, against your plan's stock"}
          </span>
        </div>
      </form>

      {plan !== null && (
        <div className="numbers-plan">
          <p className="numbers-plan-title">
            The plan{way === "buy" && plan.route.number !== null ? <> — <span className="fixed">{plan.route.number}</span></> : null}. Every step is looked up before it is written; nothing is ever deleted.
          </p>
          <Steps steps={plan.steps} />
          <div className="numbers-form-foot">
            <button type="button" className="button button-accent" onClick={() => void confirmed()} disabled={busy}>
              {busy ? "wiring…" : way === "buy" ? "buy it and wire it" : "do it"}
            </button>
            <button type="button" className="link" onClick={forget} disabled={busy}>not now</button>
          </div>
        </div>
      )}

      {done !== null && (
        <div className="numbers-plan numbers-done">
          <p className="numbers-plan-title"><span className="fixed">{done.route.number}</span> now reaches <span className="fixed">{done.route.agent}</span> in {done.route.env}.</p>
          <Steps steps={done.steps} />
        </div>
      )}
    </section>
  );
}

/** The gateway's own steps, one per line, in its words — the first token is what kind of thing each is. */
function Steps({ steps }: { steps: string[] }): ReactNode {
  return (
    <ol className="numbers-steps fixed">
      {steps.map((step, index) => {
        const [kind, ...rest] = step.split(/\s+/);
        return (
          <li key={index}><span className="numbers-step-kind">{kind}</span><span>{rest.join(" ")}</span></li>
        );
      })}
    </ol>
  );
}
