/** Simulate: pick a persona, choose the line, and put a synthetic caller on this agent from the page. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { readRoster, startSimulation, type Roster } from "./simulating";

// How many turns a caller improvises when nobody said: the same six `pinecall simulate` uses.
const TURNS = 6;

// The television behind the caller at the level the hearing calls measured, and no packets lost:
// the same defaults the terminal verb has, so the two doors spoil a line the same way.
const NOISE_DB = 15;
const LOSS_PERCENT = 0;

/**
 * The form, folded until somebody wants a caller. It asks the console's own server, never the
 * gateway: a simulation mounts the class of the directory `pinecall run` runs in, so only that
 * process can start one. The call is answered by its id and the page goes to it — the log is the
 * transcript, and on a spoken line the listen button beside it is the speakers `--listen` never had.
 */
export function SimulateForm({ agent }: { agent: string }): ReactNode {
  const credentials = useCredentials();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [persona, setPersona] = useState("");
  const [voice, setVoice] = useState(false);
  const [judge, setJudge] = useState(false);
  const [turns, setTurns] = useState(TURNS);
  const [noise, setNoise] = useState(NOISE_DB);
  const [loss, setLoss] = useState(LOSS_PERCENT);
  const [spoiled, setSpoiled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readRoster(credentials, agent).then(
      (read) => {
        if (gone) return;
        setRoster(read);
        setPersona(read.personas[0]?.name ?? "");
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
    return refused === null ? null : <p className="note note-warn sim-aside">{refused}</p>;
  }
  if (roster.agent !== agent) {
    return (
      <p className="sim-aside">
        {roster.agent === null
          ? "No agent class in the directory the agent's `pinecall run` runs in, so nothing to simulate against."
          : `The process holding the agent runs in ${roster.agent}'s directory; a simulated caller is for that agent.`}
      </p>
    );
  }
  if (roster.personas.length === 0) {
    return <p className="sim-aside">No personas in test/personas: one file per caller, default-exporting one.</p>;
  }

  const chosen = roster.personas.find((one) => one.name === persona);

  const start = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setStarting(true);
    setRefused(null);
    try {
      const call = await startSimulation(credentials, {
        agent,
        persona,
        voice,
        judge,
        turns,
        ...(voice && spoiled ? { background_noise: noise, packet_loss: loss } : {}),
      });
      navigate(`/a/${agent}/calls/${call}`);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="sim">
      <button type="button" className="sim-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{open ? "close" : "simulate a caller"}</span>
        <span className="sim-toggle-mark fixed">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <form className="sim-fields" onSubmit={(event) => void start(event)}>
          <label className="sim-field">
            <span className="sim-label fixed">persona</span>
            <select className="input" value={persona} onChange={(event) => setPersona(event.target.value)}>
              {roster.personas.map((one) => (
                <option key={one.name} value={one.name}>
                  {one.name}
                </option>
              ))}
            </select>
          </label>
          {chosen !== undefined && <p className="sim-goal">goal: {chosen.goal}</p>}
          <div className="sim-pair">
            <label className="sim-field">
              <span className="sim-label fixed">turns</span>
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                value={turns}
                onChange={(event) => setTurns(Number(event.target.value))}
              />
            </label>
            {voice && spoiled && (
              <label className="sim-field">
                <span className="sim-label fixed">noise, dB under</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={60}
                  value={noise}
                  onChange={(event) => setNoise(Number(event.target.value))}
                />
              </label>
            )}
            {voice && spoiled && (
              <label className="sim-field">
                <span className="sim-label fixed">packets lost, %</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={loss}
                  onChange={(event) => setLoss(Number(event.target.value))}
                />
              </label>
            )}
          </div>
          <div className="sim-checks">
            <Switch on={voice} turn={setVoice}>
              voice <span className="sim-check-aside fixed">a real line, and you can listen</span>
            </Switch>
            <Switch on={judge} turn={setJudge}>
              judge at hang-up
            </Switch>
            {voice && (
              <Switch on={spoiled} turn={setSpoiled}>
                noisy line <span className="sim-check-aside fixed">a TV behind the caller, packets lost</span>
              </Switch>
            )}
          </div>
          <button type="submit" className="button button-accent sim-call" disabled={starting || persona === ""}>
            {starting ? "calling…" : "Call the agent"}
          </button>
          {refused !== null && <p className="note note-warn">{refused}</p>}
        </form>
      )}
    </div>
  );
}

/** One switch: a pill with the knob on the side that is on, and what it turns on beside it. */
function Switch({ on, turn, children }: { on: boolean; turn: (on: boolean) => void; children: ReactNode }): ReactNode {
  return (
    <label className="sim-check">
      <input className="sim-switch" type="checkbox" checked={on} onChange={(event) => turn(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
