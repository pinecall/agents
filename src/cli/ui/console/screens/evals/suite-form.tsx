/** Run a suite: tick the goldens, choose the line, and run them through the class from the page. */

import { useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Button, Card, CardHead, Check, Input, Label, Refused } from "../../ui";
import { startSuite, type Listed, type Roster } from "./testing";

// The television behind the caller at the level the hearing calls measured, and no packets lost:
// the defaults `pinecall test --voice` has, so the two doors spoil a line the same way.
const NOISE_DB = 15;
const LOSS_PERCENT = 0;

/**
 * The form. A run mounts the class of the directory `pinecall start` runs in, so only that process
 * can start one — and it is the same suite `pinecall test` runs, reported in that terminal, with
 * every broken golden written out where the verb writes it. The run's row appears in the table
 * below as the gateway opens it.
 */
export function SuiteForm({ agent, roster, onOpened }: { agent: string; roster: Roster; onOpened: (run: string) => void }): ReactNode {
  const credentials = useCredentials();
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(roster.goldens.map((one) => one.name)));
  const [models, setModels] = useState("");
  const [voice, setVoice] = useState(false);
  const [spoiled, setSpoiled] = useState(false);
  const [noise, setNoise] = useState(NOISE_DB);
  const [loss, setLoss] = useState(LOSS_PERCENT);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const tick = (name: string, on: boolean): void => {
    const next = new Set(ticked);
    if (on) next.add(name);
    else next.delete(name);
    setTicked(next);
  };
  const all = ticked.size === roster.goldens.length;

  const run = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setStarting(true);
    setRefused(null);
    try {
      const asked = models
        .split(",")
        .map((one) => one.trim())
        .filter((one) => one !== "");
      const opened = await startSuite(credentials, {
        agent,
        goldens: roster.goldens.map((one) => one.name).filter((name) => ticked.has(name)),
        ...(asked.length === 0 ? {} : { models: asked }),
        voice,
        ...(voice && spoiled ? { background_noise: noise, packet_loss: loss / 100 } : {}),
      });
      onOpened(opened);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card>
      <CardHead
        title="Run a suite"
        meta="through the class in the directory pinecall start runs in, scored by this gateway"
      />
      <form onSubmit={(event) => void run(event)}>
        <div className="ev-suite-controls">
          <div className="ev-suite-models">
            <Label>Models</Label>
            <Input size="sm" value={models} placeholder="the one the settings name · vendor/model, comma separated" onChange={(event) => setModels(event.target.value)} />
          </div>
          <Check checked={voice} onChange={setVoice}>
            Voice — ring 2, a real line
          </Check>
          {voice && (
            <Check checked={spoiled} onChange={setSpoiled}>
              Noisy line
            </Check>
          )}
          {voice && spoiled && (
            <>
              <div className="ev-suite-number">
                <Label>Noise, dB under</Label>
                <Input size="sm" type="number" min={0} max={60} value={noise} onChange={(event) => setNoise(Number(event.target.value))} />
              </div>
              <div className="ev-suite-number">
                <Label>Packets lost, %</Label>
                <Input size="sm" type="number" min={0} max={100} value={loss} onChange={(event) => setLoss(Number(event.target.value))} />
              </div>
            </>
          )}
          <Button kind="primary" size="md" type="submit" className="ev-suite-go" disabled={starting || ticked.size === 0}>
            {starting ? "Opening…" : `Run ${all ? "the suite" : `${ticked.size} golden${ticked.size === 1 ? "" : "s"}`}`}
          </Button>
        </div>
        <div className="ev-suite-all">
          <Check checked={all} onChange={(on) => setTicked(new Set(on ? roster.goldens.map((one) => one.name) : []))}>
            {ticked.size} of {roster.goldens.length}
          </Check>
        </div>
        {roster.goldens.map((golden) => (
          <div key={golden.name} className="ev-suite-golden">
            <Check checked={ticked.has(golden.name)} onChange={(on) => tick(golden.name, on)}>
              <span className="ev-suite-name">{golden.name}</span>
            </Check>
            <span className="ev-suite-says ui-clip">{golden.input[0] ?? ""}</span>
            <span className="ev-suite-expects ui-clip">{expectsLine(golden)}</span>
          </div>
        ))}
      </form>
      <Refused>{refused}</Refused>
    </Card>
  );
}

// What a golden asks for, as one line: the keys of `expect` with their values, the way the golden
// file wrote them. A golden that expects nothing but consent says so.
function expectsLine(golden: Listed): string {
  const said = Object.entries(golden.expect).map(([key, value]) => `${key}: ${valueOf(value)}`);
  return said.length === 0 ? "consent only" : said.join(" · ");
}

function valueOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}
