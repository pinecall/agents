/** Run a suite: tick the goldens, choose the line, and run them through the class from the page. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { readGoldens, startSuite, type Listed, type Roster } from "./testing";

// The television behind the caller at the level the hearing calls measured, and no packets lost:
// the defaults `pinecall test --voice` has, so the two doors spoil a line the same way.
const NOISE_DB = 15;
const LOSS_PERCENT = 0;

/**
 * The form. It asks the console's own server, never the gateway: a run mounts the class of the
 * directory `pinecall ui` runs in, so only that process can start one — and it is the same suite
 * `pinecall test` runs, reported in that terminal, with every broken golden written out where the
 * verb writes it. The run's row appears in the table below as the gateway opens it.
 */
export function SuiteForm({ agent, onOpened }: { agent: string; onOpened: (run: string) => void }): ReactNode {
  const credentials = useCredentials();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [models, setModels] = useState("");
  const [voice, setVoice] = useState(false);
  const [spoiled, setSpoiled] = useState(false);
  const [noise, setNoise] = useState(NOISE_DB);
  const [loss, setLoss] = useState(LOSS_PERCENT);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readGoldens(credentials, agent).then(
      (read) => {
        if (gone) return;
        setRoster(read);
        setTicked(new Set(read.goldens.map((one) => one.name)));
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  if (roster === null) {
    return refused === null ? null : <p className="note note-warn">{refused}</p>;
  }
  if (roster.agent !== agent) {
    return (
      <p className="suite-aside">
        {roster.agent === null
          ? "No agent class in the directory the agent's `pinecall run` runs in, so no goldens to run."
          : `The process holding the agent runs in ${roster.agent}'s directory; its goldens are that agent's.`}
      </p>
    );
  }
  if (roster.goldens.length === 0) {
    return <p className="suite-aside">No goldens in test/goldens: write one, and it appears here.</p>;
  }

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
      const asked = models.split(",").map((one) => one.trim()).filter((one) => one !== "");
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
    <form className="suite" onSubmit={(event) => void run(event)}>
      <div className="suite-head">
        <label className="suite-check">
          <input
            type="checkbox"
            checked={all}
            onChange={(event) => setTicked(new Set(event.target.checked ? roster.goldens.map((one) => one.name) : []))}
          />
          <span>
            {ticked.size} of {roster.goldens.length}
          </span>
        </label>
        <label className="suite-field">
          <span>models</span>
          <input
            className="input suite-models mono"
            value={models}
            placeholder="the one the class declared"
            onChange={(event) => setModels(event.target.value)}
          />
        </label>
        <label className="suite-check">
          <input type="checkbox" checked={voice} onChange={(event) => setVoice(event.target.checked)} />
          <span>voice — ring 2, a real line</span>
        </label>
        {voice && (
          <label className="suite-check">
            <input type="checkbox" checked={spoiled} onChange={(event) => setSpoiled(event.target.checked)} />
            <span>noisy line — a TV behind the caller, packets lost</span>
          </label>
        )}
        {voice && spoiled && (
          <>
            <label className="suite-field">
              <span>noise, dB under</span>
              <input className="input suite-input mono" type="number" min={0} max={60} value={noise} onChange={(event) => setNoise(Number(event.target.value))} />
            </label>
            <label className="suite-field">
              <span>packets lost, %</span>
              <input className="input suite-input mono" type="number" min={0} max={100} value={loss} onChange={(event) => setLoss(Number(event.target.value))} />
            </label>
          </>
        )}
        <button type="submit" className="button" disabled={starting || ticked.size === 0}>
          {starting ? "opening…" : `run ${ticked.size === roster.goldens.length ? "the suite" : `${ticked.size} golden${ticked.size === 1 ? "" : "s"}`}`}
        </button>
      </div>
      <ul className="suite-list">
        {roster.goldens.map((golden) => (
          <li key={golden.name} className="suite-golden">
            <label className="suite-check">
              <input type="checkbox" checked={ticked.has(golden.name)} onChange={(event) => tick(golden.name, event.target.checked)} />
              <span className="mono">{golden.name}</span>
            </label>
            <span className="suite-says">{golden.input[0] ?? ""}</span>
            <span className="suite-expects mono">{expectsLine(golden)}</span>
          </li>
        ))}
      </ul>
      {refused !== null && <p className="note note-warn">{refused}</p>}
    </form>
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
