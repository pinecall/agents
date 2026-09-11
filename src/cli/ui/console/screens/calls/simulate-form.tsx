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
 * The form. It asks the console's own server, never the gateway: a simulation mounts the class of
 * the directory `pinecall ui` runs in, so only that process can start one. The call is answered
 * by its id and the page goes to it — the log is the transcript, and on a spoken line the listen
 * button beside it is the speakers `--listen` never had.
 */
export function SimulateForm({ agent }: { agent: string }): ReactNode {
  const credentials = useCredentials();
  const navigate = useNavigate();
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
    readRoster(credentials).then(
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
    return refused === null ? null : <p className="note note-warn">{refused}</p>;
  }
  if (roster.agent !== agent) {
    return (
      <p className="sim-aside">
        {roster.agent === null
          ? "No agent class in the directory this console runs in, so nothing to simulate against."
          : `This console runs in ${roster.agent}'s directory; a simulated caller is for that agent.`}
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
    <form className="sim" onSubmit={(event) => void start(event)}>
      <h2 className="call-group-name">Simulate</h2>
      <label className="sim-field">
        <span className="sim-label">persona</span>
        <select className="sim-input mono" value={persona} onChange={(event) => setPersona(event.target.value)}>
          {roster.personas.map((one) => (
            <option key={one.name} value={one.name}>
              {one.name}
            </option>
          ))}
        </select>
      </label>
      {chosen !== undefined && <p className="sim-goal">{chosen.goal}</p>}
      <label className="sim-check">
        <input type="checkbox" checked={voice} onChange={(event) => setVoice(event.target.checked)} />
        <span>voice — a real line, and you can listen</span>
      </label>
      <label className="sim-check">
        <input type="checkbox" checked={judge} onChange={(event) => setJudge(event.target.checked)} />
        <span>judge at hang-up</span>
      </label>
      <label className="sim-field">
        <span className="sim-label">turns</span>
        <input
          className="sim-input mono"
          type="number"
          min={1}
          max={30}
          value={turns}
          onChange={(event) => setTurns(Number(event.target.value))}
        />
      </label>
      {voice && (
        <>
          <label className="sim-check">
            <input type="checkbox" checked={spoiled} onChange={(event) => setSpoiled(event.target.checked)} />
            <span>spoil the line</span>
          </label>
          {spoiled && (
            <>
              <label className="sim-field">
                <span className="sim-label">noise, dB under</span>
                <input
                  className="sim-input mono"
                  type="number"
                  min={0}
                  max={60}
                  value={noise}
                  onChange={(event) => setNoise(Number(event.target.value))}
                />
              </label>
              <label className="sim-field">
                <span className="sim-label">packets lost, %</span>
                <input
                  className="sim-input mono"
                  type="number"
                  min={0}
                  max={100}
                  value={loss}
                  onChange={(event) => setLoss(Number(event.target.value))}
                />
              </label>
            </>
          )}
        </>
      )}
      <button type="submit" className="button" disabled={starting || persona === ""}>
        {starting ? "calling…" : "call"}
      </button>
      {refused !== null && <p className="note note-warn">{refused}</p>}
    </form>
  );
}
